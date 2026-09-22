/**
 * 月次レポートPDF — 売上表の読み取り（.xlsx / .csv）
 *
 * ⚠ この層は一切ネットワークへ出ない。fetch / XMLHttpRequest / WebSocket を使わない。
 *    受け取るのは File から読んだバイト列だけで、結果は呼び出し元へ返すのみ。
 *
 * ⚠ npm の `xlsx` パッケージは使わない（公開版に既知の脆弱性が残っているため）。
 *    zip の展開だけ fflate を使い、XML は自前の軽量スキャナで読む（`_shared/sheetReader`）。
 *
 * ⚠ **読めなかった行は落とす。0 で埋めて通さない。**
 *    金額を 0 として通すと、集計にも紙面にも「¥0 の月」が静かに混ざり、
 *    利用者は間違いに気づけない。落としたうえで「◯行を集計に含めていない」と画面に出す。
 */

import {
  EMPTY_CELL,
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
  toHalfWidth,
} from "../_shared/sheetReader";
import type { Cell, Grid } from "../_shared/sheetReader";
import {
  MAX_SALES_ROWS,
  SALES_COLUMNS,
  SALES_HEADER_SCAN_ROWS,
  SALES_REQUIRED_COLUMNS,
  UNCLASSIFIED,
} from "./types";
import type { ParseIssue, ParseResult, SalesRow } from "./types";

/**
 * 日付セル → "YYYY-MM-DD"。
 *
 * まず共通の `parseDateCell`（Excel のシリアル値・2026/5/31・2026年5月31日 など）で読む。
 * それが駄目なら **「2026/05」「2026年5月」のような月までの表記**を受ける。
 * このツールは読み取った日付を必ず月へ畳むので、日が無い表でも月が分かれば足りる
 * （＝月次に集計済みの表をそのまま投げられる）。その場合は 1 日として扱う。
 */
function parseSalesDateCell(cell: Cell): string | null {
  const iso = parseDateCell(cell);
  if (iso) return iso;

  const s = toHalfWidth(cell.text).replace(/[\s　]/g, "").trim();
  const m = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*月?$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${year}-${month < 10 ? "0" + month : month}-01`;
}

export async function parseSales(input: { name: string; bytes: Uint8Array }): Promise<ParseResult> {
  const sourceName = input.name;
  const issues: ParseIssue[] = [];
  const rows: SalesRow[] = [];
  const fail = (message: string): ParseResult => {
    issues.push({ line: 0, level: "error", message });
    return { rows: [], issues, sourceName, droppedRows: 0 };
  };

  const bytes = input.bytes;
  if (!bytes || bytes.length === 0) return fail("ファイルが空です。");

  let grid: Grid;
  let lineOf: (rowIndex: number) => number;

  if (isZip(bytes)) {
    try {
      grid = readXlsx(bytes).grid;
    } catch (e) {
      return fail(e instanceof SheetReadError ? e.message : "Excelファイルを読み取れませんでした。");
    }
    // xlsx は行の r 属性そのものが Excel 上の行番号
    lineOf = (i) => i + 1;
  } else if (/\.xls$/i.test(sourceName) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) {
    return fail(
      "旧形式の .xls には対応していません。Excel で「名前を付けて保存」→ .xlsx か CSV に変換してからお試しください。",
    );
  } else if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return fail("PDF は読み取れません。売上表の .xlsx か CSV をお使いください。");
  } else {
    const decoded = decodeCsvBytes(bytes);
    const csv = parseCsv(decoded.text);
    grid = csv.grid;
    lineOf = (i) => csv.lines[i] ?? i + 1;
  }

  if (grid.length === 0 || grid.every((r) => rowIsEmpty(r))) {
    return fail("シートが空です。テンプレートに沿って入力してから読み込ませてください。");
  }

  const header = findHeaderRow(grid, SALES_COLUMNS, SALES_REQUIRED_COLUMNS, SALES_HEADER_SCAN_ROWS);
  if (!header) {
    return fail(
      `見出し行が見つかりませんでした。1行目に「${SALES_COLUMNS.join("／")}」の見出しを置いてください。`,
    );
  }

  const headerLine = lineOf(header.index);
  const col = (name: string): number => header.map.get(normalizeHeader(name)) ?? -1;
  const missingColumns = SALES_REQUIRED_COLUMNS.filter((c) => col(c) < 0);
  for (const name of missingColumns) {
    issues.push({
      line: headerLine,
      column: name,
      level: "error",
      message: `必須の列「${name}」が見つかりません。テンプレートの見出しをそのままお使いください。`,
    });
  }
  if (missingColumns.length > 0) return { rows: [], issues, sourceName, droppedRows: 0 };

  const cDate = col("日付");
  const cAmount = col("金額");
  const cCount = col("件数");
  const cItem = col("商品・サービス");
  const cClient = col("取引先");

  if (cItem < 0 && cClient < 0) {
    issues.push({
      line: headerLine,
      level: "warn",
      message:
        "「商品・サービス」「取引先」の列がどちらもありません。区分別のランキングは「（未分類）」1行になります。",
    });
  }

  const text = (r: number, c: number): string => (c < 0 ? "" : cellAt(grid, r, c).text.trim());

  let droppedRows = 0;
  let blankItem = 0;
  let blankClient = 0;
  let zeroCount = 0;
  let negativeAmount = 0;
  let roundedCount = 0;

  for (let r = header.index + 1; r < grid.length; r++) {
    if (rowIsEmpty(grid[r])) continue;
    const line = lineOf(r);
    let dropped = false;

    /* 日付（必須） */
    let date = "";
    const dateCell = cDate < 0 ? EMPTY_CELL : cellAt(grid, r, cDate);
    if (dateCell.text.trim() === "") {
      issues.push({ line, column: "日付", level: "error", message: "日付が空です。" });
      dropped = true;
    } else {
      const iso = parseSalesDateCell(dateCell);
      if (iso) {
        date = iso;
      } else {
        issues.push({
          line,
          column: "日付",
          level: "error",
          message: `日付「${dateCell.text.trim()}」を読み取れません。2026/05/31 のように入力してください（Excelの日付書式のセルもそのまま使えます）。`,
        });
        dropped = true;
      }
    }

    /* 金額（必須） */
    let amount = 0;
    const amountRaw = text(r, cAmount);
    if (amountRaw === "") {
      issues.push({ line, column: "金額", level: "error", message: "金額が空です。" });
      dropped = true;
    } else {
      const value = parseNumberCell(amountRaw);
      if (value === null) {
        issues.push({
          line,
          column: "金額",
          level: "error",
          message: `金額「${amountRaw}」は数値として読み取れません。`,
        });
        dropped = true;
      } else {
        amount = value;
        if (value < 0) negativeAmount++;
      }
    }

    /* 件数（任意・空欄なら 1 行 ＝ 1 件） */
    let count = 1;
    const countRaw = text(r, cCount);
    if (countRaw !== "") {
      const value = parseNumberCell(countRaw);
      if (value === null) {
        issues.push({
          line,
          column: "件数",
          level: "warn",
          message: `件数「${countRaw}」を読み取れないため、1件として扱います。`,
        });
      } else if (value < 0) {
        issues.push({
          line,
          column: "件数",
          level: "error",
          message: `件数「${countRaw}」が負の数です。件数は 0 以上で入力してください。`,
        });
        dropped = true;
      } else if (!Number.isInteger(value)) {
        roundedCount++;
        count = Math.round(value);
      } else {
        count = value;
        if (value === 0) zeroCount++;
      }
    }

    if (dropped) {
      droppedRows++;
      continue;
    }

    const itemName = text(r, cItem);
    const clientName = text(r, cClient);
    if (cItem >= 0 && itemName === "") blankItem++;
    if (cClient >= 0 && clientName === "") blankClient++;

    rows.push({
      date,
      amount,
      count,
      itemName: itemName || UNCLASSIFIED,
      clientName: clientName || UNCLASSIFIED,
      sourceLine: line,
    });
  }

  /* 行ごとに出すと同じ指摘で埋まるものは、1 件にまとめて件数で言う */
  if (blankItem > 0) {
    issues.push({
      line: 0,
      column: "商品・サービス",
      level: "warn",
      message: `「商品・サービス」が空の行が ${blankItem}行あります。${UNCLASSIFIED}としてまとめました。`,
    });
  }
  if (blankClient > 0) {
    issues.push({
      line: 0,
      column: "取引先",
      level: "warn",
      message: `「取引先」が空の行が ${blankClient}行あります。${UNCLASSIFIED}としてまとめました。`,
    });
  }
  if (zeroCount > 0) {
    issues.push({
      line: 0,
      column: "件数",
      level: "warn",
      message: `件数が 0 の行が ${zeroCount}行あります。金額だけ集計し、平均単価の計算には含めていません。`,
    });
  }
  if (roundedCount > 0) {
    issues.push({
      line: 0,
      column: "件数",
      level: "warn",
      message: `件数に小数のある行が ${roundedCount}行あります。四捨五入して扱いました。`,
    });
  }
  if (negativeAmount > 0) {
    issues.push({
      line: 0,
      column: "金額",
      level: "warn",
      message: `金額が負の行が ${negativeAmount}行あります。返品・値引きとしてそのまま合算しています。`,
    });
  }
  if (droppedRows > 0) {
    issues.push({
      line: 0,
      level: "error",
      message: `${droppedRows}行を読み込めなかったため、集計に含めていません。上の指摘の行を直すと集計に入ります。`,
    });
  }

  if (rows.length === 0) {
    issues.push({
      line: headerLine,
      level: "error",
      message: "見出し行の下に、集計できる明細がありません。1行に1明細で入力してください。",
    });
    return { rows: [], issues, sourceName, droppedRows };
  }

  if (rows.length > MAX_SALES_ROWS) {
    return {
      rows: [],
      issues: [
        ...issues,
        {
          line: 0,
          level: "error",
          message: `明細が ${rows.length.toLocaleString("ja-JP")}行あり、想定（${MAX_SALES_ROWS.toLocaleString("ja-JP")}行）を超えています。期間で分けてお試しください。`,
        },
      ],
      sourceName,
      droppedRows,
    };
  }

  return { rows, issues, sourceName, droppedRows };
}
