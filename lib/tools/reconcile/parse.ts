/**
 * 入金消込 突合ツール — 入力の読み取り（請求台帳 / 銀行の入出金明細）
 *
 * ⚠ この層は一切ネットワークへ出ない。受け取るのは File から読んだバイト列だけ。
 *
 * ⚠ npm の `xlsx` パッケージは使わない（公開版に既知の脆弱性が残っているため）。
 *    zip 展開は fflate、XML は自前スキャナ（`_shared/sheetReader`）。
 *
 * ⚠ **error の行は結果に混ぜない。** 読めなかった値を 0 で埋めて通すと、
 *    ¥0 の請求や ¥0 の入金が黙って突合に紛れ込む。落として件数を画面に出す。
 *
 * 台帳と明細で、列名の扱いをわざと非対称にしている。
 *  ・請求台帳 … 列名を固定する（こちらがテンプレートを配れるから）
 *  ・銀行明細 … 別名を認める（銀行が出す形はこちらで選べないから）。ただし見出し行は必須
 */

import {
  SheetReadError,
  cellAt,
  decodeCsvBytes,
  findHeaderRow,
  isZip,
  normalizeHeader,
  parseCsv,
  parseDateCell,
  parseNumberCell,
  readXlsx,
  rowIsEmpty,
} from "../_shared/sheetReader";
import type { Cell, Grid, HeaderMatch } from "../_shared/sheetReader";
import { extractPayer, normalizeMatchKey } from "./normalize";
import {
  LEDGER_COLUMNS,
  LEDGER_HEADER_SCAN_ROWS,
  LEDGER_REQUIRED_COLUMNS,
  MAX_LEDGER_ROWS,
  MAX_STATEMENT_ROWS,
  STATEMENT_ALIASES,
  STATEMENT_COLUMNS,
  STATEMENT_HEADER_SCAN_ROWS,
  STATEMENT_REQUIRED_COLUMNS,
} from "./types";
import type {
  InvoiceEntry,
  LedgerParseResult,
  ParseIssue,
  StatementDirection,
  StatementEntry,
  StatementLayout,
  StatementParseResult,
} from "./types";

/* ------------------------------------------------------------------ *
 * 共通：バイト列 → Grid
 * ------------------------------------------------------------------ */

interface SheetSource {
  grid: Grid;
  /** Grid の行番号（0始まり） → 元ファイル上の行番号（1始まり） */
  lineOf: (rowIndex: number) => number;
  encoding: "utf-8" | "shift_jis";
}

/** 読めない形式は推測せず、利用者向けの文言にして投げる */
function readGrid(name: string, bytes: Uint8Array): SheetSource {
  if (!bytes || bytes.length === 0) {
    throw new SheetReadError("ファイルが空です。");
  }

  if (isZip(bytes)) {
    const read = readXlsx(bytes);
    // xlsx は行の r 属性そのものが Excel 上の行番号
    return { grid: read.grid, lineOf: (i) => i + 1, encoding: "utf-8" };
  }
  if (/\.xls$/i.test(name) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) {
    throw new SheetReadError(
      "旧形式の Excel ファイル（.xls）には対応していません。.xlsx か CSV に変換してからお試しください。",
    );
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    throw new SheetReadError(
      "PDF は読み取れません。銀行のサイトから CSV で書き出したファイルをお使いください。",
    );
  }

  const decoded = decodeCsvBytes(bytes);
  const csv = parseCsv(decoded.text);
  return {
    grid: csv.grid,
    lineOf: (i) => csv.lines[i] ?? i + 1,
    encoding: decoded.encoding,
  };
}

/** 会計表記の △ ▲（マイナスの意味）を落としてから数値にする。`_shared` は変えない */
function readAmountCell(cell: Cell): number | null {
  const raw = cell.text.trim();
  if (!raw) return null;
  const fixed = raw.replace(/^[△▲]\s*/, "-");
  return parseNumberCell(fixed);
}

/** 見出し行の実際の文字（画面の「読めました」表示に使う） */
function headerTextAt(grid: Grid, header: HeaderMatch, col: number): string {
  if (col < 0) return "";
  return cellAt(grid, header.index, col).text.trim();
}

/** 別名のうち、いちばん左の列に当たったものを採る */
function findAliasColumn(header: HeaderMatch, aliases: readonly string[]): number {
  let best = -1;
  for (const alias of aliases) {
    const col = header.map.get(normalizeHeader(alias));
    if (col === undefined) continue;
    if (best < 0 || col < best) best = col;
  }
  return best;
}

/** 当たった別名の列をすべて（左から順に） */
function findAliasColumns(header: HeaderMatch, aliases: readonly string[]): number[] {
  const cols = new Set<number>();
  for (const alias of aliases) {
    const col = header.map.get(normalizeHeader(alias));
    if (col !== undefined) cols.add(col);
  }
  return [...cols].sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ *
 * 1. 請求台帳
 * ------------------------------------------------------------------ */

/** 漢字・ひらがなが残っている＝カナの振込名義と当たらない、という警告の判定 */
const HAS_JA_TEXT_RE = /[ぁ-ゖ一-鿿]/;

export async function parseLedger(input: {
  name: string;
  bytes: Uint8Array;
}): Promise<LedgerParseResult> {
  const sourceName = input.name;
  const issues: ParseIssue[] = [];
  const entries: InvoiceEntry[] = [];
  const fail = (message: string): LedgerParseResult => {
    issues.push({ line: 0, level: "error", message });
    return { entries: [], issues, sourceName };
  };

  let src: SheetSource;
  try {
    src = readGrid(sourceName, input.bytes);
  } catch (e) {
    return fail(
      e instanceof SheetReadError ? e.message : "ファイルを読み取れませんでした。",
    );
  }

  const { grid, lineOf } = src;
  if (grid.length === 0 || grid.every((r) => rowIsEmpty(r))) {
    return fail("シートが空です。テンプレートに沿って入力してから読み込ませてください。");
  }

  const header = findHeaderRow(
    grid,
    LEDGER_COLUMNS,
    LEDGER_REQUIRED_COLUMNS,
    LEDGER_HEADER_SCAN_ROWS,
  );
  if (!header) {
    return fail(
      `見出し行が見つかりませんでした。1行目に「${LEDGER_COLUMNS.join("・")}」の見出しを置いてください。`,
    );
  }

  const headerLine = lineOf(header.index);
  const col = (name: string): number => header.map.get(normalizeHeader(name)) ?? -1;
  const missing = LEDGER_REQUIRED_COLUMNS.filter((c) => col(c) < 0);
  if (missing.length > 0) {
    for (const name of missing) {
      issues.push({
        line: headerLine,
        column: name,
        level: "error",
        message: `必須の列「${name}」が見つかりません。テンプレートの見出しをそのままお使いください。`,
      });
    }
    return { entries: [], issues, sourceName };
  }

  const cNo = col("請求番号");
  const cIssue = col("請求日");
  const cDue = col("支払期日");
  const cClient = col("取引先名");
  const cPayer = col("振込名義");
  const cAmount = col("請求額");
  const cNote = col("備考");

  const text = (r: number, c: number): string => (c < 0 ? "" : cellAt(grid, r, c).text.trim());

  let dataRows = 0;
  for (let r = header.index + 1; r < grid.length; r++) {
    if (rowIsEmpty(grid[r])) continue;
    dataRows++;
    if (dataRows > MAX_LEDGER_ROWS) break;

    const line = lineOf(r);
    let broken = false;

    const invoiceNo = text(r, cNo);
    if (!invoiceNo) {
      issues.push({
        line,
        column: "請求番号",
        level: "error",
        message: "請求番号が空です。1行に1件、台帳の中で重ならない番号を入れてください。",
      });
      broken = true;
    }

    const clientName = text(r, cClient);
    if (!clientName) {
      issues.push({
        line,
        column: "取引先名",
        level: "error",
        message: "取引先名が空です。どこへの請求か決められないため、突合に含めません。",
      });
      broken = true;
    }

    const amountRaw = text(r, cAmount);
    const amountNum = cAmount < 0 ? null : readAmountCell(cellAt(grid, r, cAmount));
    if (amountNum === null) {
      issues.push({
        line,
        column: "請求額",
        level: "error",
        message:
          amountRaw === ""
            ? "請求額が空です。税込の金額を数値で入力してください。"
            : `請求額「${amountRaw}」は数値として読み取れません。`,
      });
      broken = true;
    } else if (amountNum <= 0) {
      issues.push({
        line,
        column: "請求額",
        level: "error",
        message: `請求額が ${amountRaw} です。0円以下の請求は突合に含めません。`,
      });
      broken = true;
    } else if (!Number.isInteger(amountNum)) {
      issues.push({
        line,
        column: "請求額",
        level: "warn",
        message: `請求額「${amountRaw}」に小数がついています。${Math.round(amountNum).toLocaleString("ja-JP")}円として扱います。`,
      });
    }

    // 日付（読めなければ空欄として扱う。日付で切り捨てて「入っているのに未入金」にしない）
    let issueDate = "";
    const issueRaw = text(r, cIssue);
    if (issueRaw) {
      const iso = parseDateCell(cellAt(grid, r, cIssue));
      if (iso) issueDate = iso;
      else {
        issues.push({
          line,
          column: "請求日",
          level: "warn",
          message: `請求日「${issueRaw}」を日付として読み取れないため、空欄として扱います。`,
        });
      }
    }

    let dueDate = "";
    const dueRaw = text(r, cDue);
    if (dueRaw) {
      const iso = parseDateCell(cellAt(grid, r, cDue));
      if (iso) dueDate = iso;
      else {
        issues.push({
          line,
          column: "支払期日",
          level: "warn",
          message: `支払期日「${dueRaw}」を日付として読み取れないため、空欄として扱います（入金日の範囲を見ません）。`,
        });
      }
    }

    const payerName = text(r, cPayer);
    if (!payerName && clientName && HAS_JA_TEXT_RE.test(clientName)) {
      issues.push({
        line,
        column: "振込名義",
        level: "warn",
        message: `振込名義が空です。取引先名「${clientName}」から照合しますが、漢字・ひらがなは銀行の明細と当たりません。カナの振込名義を入れると精度が上がります。`,
      });
    }

    if (broken) continue;

    entries.push({
      invoiceNo,
      issueDate,
      dueDate,
      clientName,
      payerName,
      amount: Math.round(amountNum as number),
      note: text(r, cNote),
      key: normalizeMatchKey(payerName || clientName),
      sourceLine: line,
    });
  }

  if (dataRows > MAX_LEDGER_ROWS) {
    issues.push({
      line: 0,
      level: "error",
      message: `請求が ${MAX_LEDGER_ROWS}行を超えています。ファイルを分けてからお試しください。`,
    });
    return { entries: [], issues, sourceName };
  }

  if (entries.length === 0) {
    issues.push({
      line: headerLine,
      level: "error",
      message: "突合に使える請求がありません。テンプレートの形式をご確認ください。",
    });
    return { entries, issues, sourceName };
  }

  // 請求番号の重複（結果には混ぜるが、どれに当てるか迷う元なので必ず出す）
  const seenNo = new Map<string, number>();
  for (const entry of entries) {
    const first = seenNo.get(entry.invoiceNo);
    if (first === undefined) seenNo.set(entry.invoiceNo, entry.sourceLine);
    else {
      issues.push({
        line: entry.sourceLine,
        column: "請求番号",
        level: "warn",
        message: `請求番号「${entry.invoiceNo}」が ${first}行目と重複しています。別々の請求として突合します。`,
      });
    }
  }

  return { entries, issues, sourceName };
}

/* ------------------------------------------------------------------ *
 * 2. 銀行の入出金明細
 * ------------------------------------------------------------------ */

/**
 * 区分列（受払区分など）の値 → 入金・出金。
 * 「払出」「お支払」は出金、「受入」「入金」は入金。読めなければ null。
 */
function readKind(raw: string): StatementDirection | null {
  const s = raw.trim();
  if (!s) return null;
  if (/[出払引借]/.test(s)) return "debit";
  if (/[入受預貸]/.test(s)) return "credit";
  return null;
}

/**
 * 当たった見出しの組み合わせから金融機関を推定する。
 *
 * ⚠ **表示だけに使う。読み取りロジックへは一切影響させない。**
 *    銀行ごとに分岐を書くと、未検証の見出し語が外れた瞬間にその銀行が丸ごと読めなくなる。
 */
function guessBank(headers: Set<string>): string {
  // headers は normalizeHeader 済み（括弧と空白が落ちている）ので、比べる側も同じ形にする
  const has = (...names: string[]) => names.every((n) => headers.has(normalizeHeader(n)));
  if (has("入出金(円)")) return "楽天銀行";
  if (has("詳細1", "詳細2")) return "ゆうちょ銀行";
  if (has("お預かり金額") || has("お支払い金額")) return "ゆうちょ銀行";
  if (has("受取額", "支払額")) return "三菱UFJ銀行";
  if (has("お預り金額", "お支払金額")) return "三井住友銀行";
  if (has("預入金額")) return "みずほ銀行";
  if (has("お預け入れ額", "お引き出し額")) return "ソニー銀行";
  if (has("入金額", "出金額")) return "PayPay銀行";
  return "";
}

export async function parseStatement(input: {
  name: string;
  bytes: Uint8Array;
}): Promise<StatementParseResult> {
  const sourceName = input.name;
  const issues: ParseIssue[] = [];
  const entries: StatementEntry[] = [];
  const fail = (message: string): StatementParseResult => {
    issues.push({ line: 0, level: "error", message });
    return { entries: [], issues, sourceName, layout: null };
  };

  let src: SheetSource;
  try {
    src = readGrid(sourceName, input.bytes);
  } catch (e) {
    return fail(
      e instanceof SheetReadError ? e.message : "ファイルを読み取れませんでした。",
    );
  }

  const { grid, lineOf, encoding } = src;
  if (grid.length === 0 || grid.every((r) => rowIsEmpty(r))) {
    return fail("ファイルの中に明細がありません。");
  }

  const header = findHeaderRow(
    grid,
    STATEMENT_COLUMNS,
    STATEMENT_REQUIRED_COLUMNS,
    STATEMENT_HEADER_SCAN_ROWS,
  );
  if (!header) {
    return fail(
      "見出し行が見つかりませんでした。列の位置は推測しません。対応していない形式のときは、最小テンプレート（日付／摘要／入金額）へ貼り替えてお試しください。",
    );
  }

  const cDate = findAliasColumn(header, STATEMENT_ALIASES.date);
  const cCredit = findAliasColumn(header, STATEMENT_ALIASES.credit);
  const cDebit = findAliasColumn(header, STATEMENT_ALIASES.debit);
  const cSigned = findAliasColumn(header, STATEMENT_ALIASES.signed);
  const cKind = findAliasColumn(header, STATEMENT_ALIASES.kind);
  const descCols = findAliasColumns(header, STATEMENT_ALIASES.desc);

  if (cDate < 0) {
    return fail("日付の列が見つかりませんでした。見出しに「日付」または「取引日」を置いてください。");
  }

  let amountShape: StatementLayout["amountShape"];
  if (cCredit >= 0 || cDebit >= 0) amountShape = "twoColumn";
  else if (cKind >= 0 && cSigned >= 0) amountShape = "kindColumn";
  else if (cSigned >= 0) amountShape = "signed";
  else {
    return fail(
      "金額の列が見つかりませんでした。入金・出金が分かれた列、符号つきの1列、区分列つきの金額列のいずれかが必要です。",
    );
  }

  if (descCols.length === 0) {
    issues.push({
      line: lineOf(header.index),
      level: "warn",
      message:
        "摘要の列が見つかりませんでした。振込名義が読めないため、すべての入金が「請求が見つからない」に分かれます。",
    });
  }

  const layout: StatementLayout = {
    guessedBank: guessBank(new Set(header.map.keys())),
    amountShape,
    dateHeader: headerTextAt(grid, header, cDate),
    descHeaders: descCols.map((c) => headerTextAt(grid, header, c)),
    creditHeader: headerTextAt(grid, header, cCredit),
    debitHeader: headerTextAt(grid, header, cDebit),
    kindHeader: headerTextAt(grid, header, cKind),
    encoding,
    skippedDebits: 0,
  };

  let dataRows = 0;
  for (let r = header.index + 1; r < grid.length; r++) {
    if (rowIsEmpty(grid[r])) continue;
    const line = lineOf(r);

    // 金額の候補（先に読む。日付も金額も空の行＝合計行や注記は黙って飛ばす）
    const creditVal = cCredit >= 0 ? readAmountCell(cellAt(grid, r, cCredit)) : null;
    const debitVal = cDebit >= 0 ? readAmountCell(cellAt(grid, r, cDebit)) : null;
    const signedVal = cSigned >= 0 ? readAmountCell(cellAt(grid, r, cSigned)) : null;
    const creditRaw = cCredit >= 0 ? cellAt(grid, r, cCredit).text.trim() : "";
    const debitRaw = cDebit >= 0 ? cellAt(grid, r, cDebit).text.trim() : "";
    const signedRaw = cSigned >= 0 ? cellAt(grid, r, cSigned).text.trim() : "";
    const dateRaw = cellAt(grid, r, cDate).text.trim();

    const hasAmountText = creditRaw !== "" || debitRaw !== "" || signedRaw !== "";
    if (!dateRaw && !hasAmountText) continue;

    dataRows++;
    if (dataRows > MAX_STATEMENT_ROWS) break;

    const date = parseDateCell(cellAt(grid, r, cDate));
    if (!date) {
      issues.push({
        line,
        column: layout.dateHeader || "日付",
        level: "error",
        message:
          dateRaw === ""
            ? "日付が空です。この行は突合に含めません。"
            : `日付「${dateRaw}」を読み取れません。この行は突合に含めません。`,
      });
      continue;
    }

    let amount: number | null = null;
    let direction: StatementDirection = "credit";

    if (amountShape === "twoColumn") {
      if (creditVal !== null && creditVal !== 0) {
        amount = Math.abs(creditVal);
        direction = creditVal < 0 ? "debit" : "credit";
      } else if (debitVal !== null && debitVal !== 0) {
        amount = Math.abs(debitVal);
        direction = "debit";
      } else if (hasAmountText && creditVal === null && debitVal === null) {
        issues.push({
          line,
          level: "error",
          message: `金額「${creditRaw || debitRaw}」を数値として読み取れません。この行は突合に含めません。`,
        });
        continue;
      } else {
        // 入金も出金も 0（残高だけの行）＝取引ではないので黙って飛ばす
        continue;
      }
    } else if (amountShape === "signed") {
      if (signedVal === null) {
        issues.push({
          line,
          level: "error",
          message: `金額「${signedRaw}」を数値として読み取れません。この行は突合に含めません。`,
        });
        continue;
      }
      if (signedVal === 0) continue;
      amount = Math.abs(signedVal);
      direction = signedVal < 0 ? "debit" : "credit";
    } else {
      // kindColumn
      if (signedVal === null) {
        issues.push({
          line,
          level: "error",
          message: `金額「${signedRaw}」を数値として読み取れません。この行は突合に含めません。`,
        });
        continue;
      }
      if (signedVal === 0) continue;
      const kindRaw = cellAt(grid, r, cKind).text.trim();
      const kind = readKind(kindRaw);
      if (kind === null) {
        // 区分が読めないときは符号で決める。誤って入金に倒さないよう、警告を必ず出す
        issues.push({
          line,
          column: layout.kindHeader || "区分",
          level: "warn",
          message: `区分「${kindRaw}」が入金か出金か判別できません。金額の符号で判定しました。`,
        });
        direction = signedVal < 0 ? "debit" : "credit";
      } else {
        direction = kind;
      }
      amount = Math.abs(signedVal);
    }

    if (amount === null) continue;
    if (!Number.isInteger(amount)) amount = Math.round(amount);

    const descValues = descCols
      .map((c) => cellAt(grid, r, c).text.trim())
      .filter((v) => v !== "");
    const description = descValues.join(" ");
    const payerRaw = descValues.length > 0 ? extractPayer(descValues[descValues.length - 1]) : "";

    if (direction === "debit") layout.skippedDebits++;

    entries.push({
      date,
      description,
      payerRaw,
      key: normalizeMatchKey(payerRaw),
      amount,
      direction,
      sourceLine: line,
    });
  }

  if (dataRows > MAX_STATEMENT_ROWS) {
    issues.push({
      line: 0,
      level: "error",
      message: `明細が ${MAX_STATEMENT_ROWS}行を超えています。期間を分けて書き出してからお試しください。`,
    });
    return { entries: [], issues, sourceName, layout: null };
  }

  if (entries.length === 0) {
    issues.push({
      line: lineOf(header.index),
      level: "error",
      message: "読み取れる明細がありませんでした。見出しの下に取引の行があるかご確認ください。",
    });
  }

  return { entries, issues, sourceName, layout };
}
