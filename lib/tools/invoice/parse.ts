/**
 * 請求書PDF一括作成ツール — 台帳の読み取り（.xlsx / .csv）
 *
 * ⚠ この層は一切ネットワークへ出ない。fetch / XMLHttpRequest / WebSocket を使わない。
 *    受け取るのは File から読んだバイト列だけで、結果は呼び出し元へ返すのみ。
 *
 * ⚠ npm の `xlsx` パッケージは使わない（公開版に既知の脆弱性が残っているため）。
 *    zip の展開だけ fflate を使い、XML は DOMParser に依存しない自前の軽量スキャナで読む。
 *    （Node でもブラウザでも同じコードが動く必要があるため。DOMParser は Node に無い）
 *
 * ⚠ 汎用版は「整った入力」しか受け付けない（設計計画書 §9-3-A）。
 *    崩れた台帳は推測で直さず、素直に ParseIssue（error）として返す。
 */

import {
  SheetReadError as LedgerError,
  EMPTY_CELL,
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
  toHalfWidth,
} from "../_shared/sheetReader";
import type { Grid } from "../_shared/sheetReader";
import {
  LEDGER_COLUMNS,
  LEDGER_HEADER_SCAN_ROWS,
  LEDGER_REQUIRED_COLUMNS,
  MAX_LEDGER_ROWS,
} from "./types";
import type { LedgerRow, ParseIssue, ParseResult, TaxRate } from "./types";

/**
 * 税率セル → TaxRate。
 * 10 / 10% / 0.1 / 8 / 8% / 軽減8 / 0 / 非課税 / 空欄（→10）に対応。
 * 読めなければ null（＝呼び出し元でエラーにする）
 */
function parseTaxRateCell(raw: string): TaxRate | null {
  const s = toHalfWidth(raw).replace(/[\s\u3000]/g, "").trim();
  if (!s) return 10;
  if (/(非課税|不課税|課税対象外|対象外|免税)/.test(s)) return 0;

  const m = /(-?\d+(?:\.\d+)?)/.exec(s);
  if (!m) {
    if (/軽減/.test(s)) return 8;
    if (/標準/.test(s)) return 10;
    return null;
  }
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (n > 0 && n < 1) n = n * 100;
  n = Math.round(n * 1000) / 1000;
  if (n === 10) return 10;
  if (n === 8) return 8;
  if (n === 0) return 0;
  return null;
}

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */



export async function parseLedger(input: { name: string; bytes: Uint8Array }): Promise<ParseResult> {
  const sourceName = input.name;
  const issues: ParseIssue[] = [];
  const rows: LedgerRow[] = [];
  const fail = (message: string): ParseResult => {
    issues.push({ line: 0, level: "error", message });
    return { rows, issues, sourceName };
  };

  const bytes = input.bytes;
  if (!bytes || bytes.length === 0) return fail("ファイルが空です。");

  let grid: Grid;
  let lineOf: (rowIndex: number) => number;

  if (isZip(bytes)) {
    try {
      const read = readXlsx(bytes);
      grid = read.grid;
    } catch (e) {
      return fail(e instanceof LedgerError ? e.message : "Excelファイルを読み取れませんでした。");
    }
    // xlsx は行番号 r 属性そのものが Excel 上の行番号
    lineOf = (i) => i + 1;
  } else if (/\.xls$/i.test(sourceName)) {
    return fail(
      "旧形式の .xls には対応していません。Excel で「名前を付けて保存」→ .xlsx か CSV に変換してからお試しください。"
    );
  } else if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    return fail(
      "旧形式の Excel ファイル（.xls）のようです。.xlsx か CSV に変換してからお試しください。"
    );
  } else if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return fail("PDF は読み取れません。台帳の .xlsx か CSV をお使いください。");
  } else {
    const decoded = decodeCsvBytes(bytes);
    const csv = parseCsv(decoded.text);
    grid = csv.grid;
    lineOf = (i) => csv.lines[i] ?? i + 1;
  }

  if (grid.length === 0 || grid.every((r) => rowIsEmpty(r))) {
    return fail("シートが空です。テンプレートに沿って入力してから読み込ませてください。");
  }

  const header = findHeaderRow(grid, LEDGER_COLUMNS, LEDGER_REQUIRED_COLUMNS, LEDGER_HEADER_SCAN_ROWS);
  if (!header) {
    return fail(
      `見出し行が見つかりませんでした。1行目に「${LEDGER_COLUMNS.join("・")}」の見出しを置いてください。`
    );
  }

  const headerLine = lineOf(header.index);
  const col = (name: string): number => header.map.get(normalizeHeader(name)) ?? -1;
  const missing = LEDGER_REQUIRED_COLUMNS.filter((c) => col(c) < 0);
  for (const name of missing) {
    issues.push({
      line: headerLine,
      column: name,
      level: "error",
      message: `必須の列「${name}」が見つかりません。テンプレートの見出しをそのままお使いください。`,
    });
  }
  if (missing.length > 0) return { rows, issues, sourceName };

  const cInvoiceNo = col("請求書番号");
  const cIssueDate = col("請求日");
  const cDueDate = col("支払期日");
  const cClient = col("取引先名");
  const cHonorific = col("敬称");
  const cZip = col("郵便番号");
  const cAddress = col("住所");
  const cSubject = col("件名");
  const cItem = col("品目");
  const cQty = col("数量");
  const cUnit = col("単位");
  const cPrice = col("単価");
  const cTax = col("税率");
  const cNote = col("備考");

  const text = (r: number, c: number): string => (c < 0 ? "" : cellAt(grid, r, c).text.trim());

  for (let r = header.index + 1; r < grid.length; r++) {
    const raw = grid[r];
    if (rowIsEmpty(raw)) continue;
    const line = lineOf(r);

    const invoiceNo = text(r, cInvoiceNo);
    const clientName = text(r, cClient);
    const itemName = text(r, cItem);

    if (!invoiceNo && !clientName) {
      issues.push({
        line,
        column: "請求書番号",
        level: "error",
        message: "請求書番号と取引先名がどちらも空です。どの請求書の明細か決められません。",
      });
    }

    // 日付
    let issueDate = "";
    const issueCell = cIssueDate < 0 ? EMPTY_CELL : cellAt(grid, r, cIssueDate);
    if (issueCell.text.trim() !== "") {
      const iso = parseDateCell(issueCell);
      if (iso) {
        issueDate = iso;
      } else {
        issues.push({
          line,
          column: "請求日",
          level: "error",
          message: `請求日「${issueCell.text.trim()}」を日付として読み取れません。2026/08/21 のように入力してください。`,
        });
      }
    }

    let dueDate = "";
    const dueCell = cDueDate < 0 ? EMPTY_CELL : cellAt(grid, r, cDueDate);
    if (dueCell.text.trim() !== "") {
      const iso = parseDateCell(dueCell);
      if (iso) {
        dueDate = iso;
      } else {
        issues.push({
          line,
          column: "支払期日",
          level: "warn",
          message: `支払期日「${dueCell.text.trim()}」を日付として読み取れないため、空欄として扱います。`,
        });
      }
    }

    // 数量・単価
    const qtyRaw = text(r, cQty);
    let quantity = parseNumberCell(qtyRaw);
    if (quantity === null) {
      issues.push({
        line,
        column: "数量",
        level: "error",
        message:
          qtyRaw === ""
            ? "数量が空です。数値を入力してください。"
            : `数量「${qtyRaw}」は数値として読み取れません。`,
      });
      quantity = 0;
    }

    const priceRaw = text(r, cPrice);
    let unitPrice = parseNumberCell(priceRaw);
    if (unitPrice === null) {
      issues.push({
        line,
        column: "単価",
        level: "error",
        message:
          priceRaw === ""
            ? "単価が空です。数値を入力してください。"
            : `単価「${priceRaw}」は数値として読み取れません。`,
      });
      unitPrice = 0;
    }

    // 税率
    const taxRaw = text(r, cTax);
    let taxRate = parseTaxRateCell(taxRaw);
    if (taxRate === null) {
      issues.push({
        line,
        column: "税率",
        level: "error",
        message: `税率「${taxRaw}」を判別できません。10 / 8 / 0 のいずれか、または「軽減8%」「非課税」と入力してください。`,
      });
      taxRate = 10;
    }

    rows.push({
      invoiceNo,
      issueDate,
      dueDate,
      clientName,
      clientHonorific: text(r, cHonorific) || "御中",
      clientZip: text(r, cZip),
      clientAddress: text(r, cAddress),
      subject: text(r, cSubject),
      itemName,
      quantity,
      unit: text(r, cUnit),
      unitPrice,
      taxRate,
      reduced: taxRate === 8,
      note: text(r, cNote),
      sourceLine: line,
    });
  }

  if (rows.length === 0) {
    issues.push({
      line: headerLine,
      level: "error",
      message: "見出し行の下に明細がありません。1行に1明細で入力してください。",
    });
    return { rows, issues, sourceName };
  }

  if (rows.length > MAX_LEDGER_ROWS) {
    issues.push({
      line: 0,
      level: "error",
      message: `明細が ${rows.length}行あり、テンプレートの想定（${MAX_LEDGER_ROWS}行）を超えています。ファイルを分けてお試しください。`,
    });
  }

  // 同一請求書番号のヘッダー情報の食い違い
  const firstIssue = new Map<string, { value: string; line: number }>();
  const firstClient = new Map<string, { value: string; line: number }>();
  for (const row of rows) {
    const key = row.invoiceNo;
    if (!key) continue;
    if (row.issueDate) {
      const seen = firstIssue.get(key);
      if (!seen) firstIssue.set(key, { value: row.issueDate, line: row.sourceLine });
      else if (seen.value !== row.issueDate) {
        issues.push({
          line: row.sourceLine,
          column: "請求日",
          level: "warn",
          message: `請求書番号「${key}」の請求日が食い違っています（${seen.value} と ${row.issueDate}）。先頭の行の値「${seen.value}」を採用します。`,
        });
      }
    }
    if (row.clientName) {
      const seen = firstClient.get(key);
      if (!seen) firstClient.set(key, { value: row.clientName, line: row.sourceLine });
      else if (seen.value !== row.clientName) {
        issues.push({
          line: row.sourceLine,
          column: "取引先名",
          level: "warn",
          message: `請求書番号「${key}」の取引先名が食い違っています（${seen.value} と ${row.clientName}）。先頭の行の値「${seen.value}」を採用します。`,
        });
      }
    }
  }

  return { rows, issues, sourceName };
}
