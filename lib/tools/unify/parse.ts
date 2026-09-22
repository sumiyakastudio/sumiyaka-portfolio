/**
 * 列マッピング統合ツール（T-04） — 入力ファイルの読み取り
 *
 * ★ここは **動的層**。画面からは `await import("@/lib/tools/unify/parse")` でしか読まない。
 *   `_shared/sheetReader` が `fflate` を引くため、静的層（types / key / aliases / automap /
 *   unify / sample）からこのファイルを import してはいけない（types.ts §0 のモジュール契約）。
 *
 * ⚠ この層は一切ネットワークへ出ない。fetch / XMLHttpRequest / sendBeacon / "use server" を書かない。
 *    受け取るのは File から読んだバイト列だけで、結果は呼び出し元へ返すのみ。
 *
 * ⚠ T-01 と違い、行単位の error は作らない。読み替えられなかった値は原文のまま運ぶ（§8-2）。
 *    error はファイル単位（開けない・見出しが無い・行が多すぎる）のときだけ。
 *
 * ★ここでセルを1度だけ解釈して SourceCell（date / num）に持たせるのが要。
 *   出力列の種類に依存しない解釈なので、線を引き直すたびの再パースが要らなくなり、
 *   unify.ts を純粋（＝fflate 非依存）に保てる。
 */

import {
  SheetReadError,
  cellAt,
  decodeCsvBytes,
  isZip,
  normalizeHeader,
  parseCsv,
  parseDateCell,
  parseNumberCell,
  readXlsxSheets,
  rowIsEmpty,
} from "../_shared/sheetReader";
import type { Cell, Grid } from "../_shared/sheetReader";
import { colLetter } from "../_shared/xlsxWriter";
import { unifyKey } from "./key";
import {
  EMPTY_SOURCE_CELL,
  HEADER_SCAN_ROWS,
  MAX_ROWS_PER_FILE,
  MAX_SOURCE_COLUMNS,
  NO_HEADER_ROW,
  SAMPLE_VALUES_PER_COLUMN,
} from "./types";
import type {
  ColumnKind,
  ParseFileResult,
  ParseOptions,
  SourceCell,
  SourceColumn,
  SourceFile,
  SourceRow,
  ToolIssue,
} from "./types";

/* ------------------------------------------------------------------ *
 * セル1つの解釈
 * ------------------------------------------------------------------ */

/**
 * 数値セルを「日付シリアル値」とみなしてよい範囲。
 * 1954-10-03 〜 2064-04-25。`_shared/parseDateCell` が5桁の文字列に対して
 * 使っているのと同じ窓（sheetReader.ts の `n >= 20000 && n <= 60000`）に揃えてある。
 *
 * ⚠ これが無いと「数量 500」が 1901-05-14 の日付列だと推測されてしまう。
 *   （`serialToIso(500)` は日付を返すため。値の運搬そのものは §8-5 のとおり
 *     parseDateCell の挙動に従うが、**列の種類の推測**にはこの窓を使う）
 */
const DATE_SERIAL_MIN = 20000;
const DATE_SERIAL_MAX = 60000;

/**
 * 生の文字列（＋元が数値セルだったか）から SourceCell を作る。
 *
 * ★固定値（`Assignment` の `kind: "const"`）を作るときも画面からこれを呼ぶこと。
 *   静的層に解釈させるとバンドル境界を越える（types.ts §0）。
 */
export function makeSourceCell(text: string, numeric = false): SourceCell {
  const cell: Cell = { text, numeric };
  return { text, numeric, date: parseDateCell(cell), num: parseNumberCell(text) };
}

function fromCell(cell: Cell | undefined): SourceCell {
  if (!cell || cell.text === "") return EMPTY_SOURCE_CELL;
  return makeSourceCell(cell.text, cell.numeric);
}

/** 日付シリアル値らしい数値か（列の種類の推測と、画面に出す見本の整形に使う） */
function isDateSerial(num: number | null): boolean {
  return num !== null && num >= DATE_SERIAL_MIN && num <= DATE_SERIAL_MAX;
}

/** 素の5桁の数字。`_shared/parseDateCell` はこれをシリアル値として日付に読む */
const BARE_5_DIGITS = /^\d{5}$/;

/**
 * そのセルを「日付」とみなしてよいか。**列の種類の推測にだけ使う判定。**
 *
 * ⚠ 値の運搬そのものは `parseDateCell` の結果（`SourceCell.date`）に従う（§8-5）。
 *   ここで狭めているのは推測の話で、`date` を消しているわけではない。
 * ⚠ 素の5桁（例：金額 21000）は `parseDateCell` が 1957-06-29 と読んでしまう。
 *   5桁の金額は実務でありふれているので、**推測では数値に倒す**。
 */
function looksDate(cell: SourceCell): boolean {
  if (cell.date === null) return false;
  if (cell.numeric) return isDateSerial(cell.num);
  return !BARE_5_DIGITS.test(cell.text.trim());
}

/**
 * 画面のプレビューに出す文字列。
 * Excel の日付セルは中身が「46208」なので、そのまま出すと人が読めない。
 * 日付として読めた数値セルだけ ISO へ直す（出力ファイルの値ではないので整形してよい）。
 */
function sampleText(cell: SourceCell): string {
  if (cell.numeric && cell.date !== null && isDateSerial(cell.num)) return cell.date;
  return cell.text.trim();
}

/**
 * 列の値の種類を推測する。
 * ⚠ 判断材料は `samples` と同じ先頭数件だけ（types.ts の SourceColumn.guessedKind の但し書き）。
 *   全行を見ると、末尾の小計行や1件の書き損じだけで文字列に倒れてしまい、推測として弱くなる。
 */
function guessKind(cells: SourceCell[]): ColumnKind {
  if (cells.length === 0) return "text";
  let allDate = true;
  let allNum = true;
  for (const cell of cells) {
    if (!looksDate(cell)) allDate = false;
    if (cell.num === null) allNum = false;
  }
  if (allDate) return "date";
  if (allNum) return "number";
  return "text";
}

/* ------------------------------------------------------------------ *
 * 見出し行の検出（★`_shared/findHeaderRow` は使えない）
 * ------------------------------------------------------------------ */

/** その行の非空セル数 */
function countNonEmpty(row: Cell[] | undefined): number {
  if (!row) return 0;
  let n = 0;
  for (const cell of row) {
    if (cell && cell.text.trim() !== "") n++;
  }
  return n;
}

/** 末尾の空セルを除いた列数（CSV の行末カンマで幽霊列を作らないため） */
function widthOf(row: Cell[] | undefined): number {
  if (!row) return 0;
  for (let c = row.length - 1; c >= 0; c--) {
    const cell = row[c];
    if (cell && cell.text.trim() !== "") return c + 1;
  }
  return 0;
}

/**
 * 見出し行を探す（計画書 §5-2）。
 *
 * ⚠ `_shared/findHeaderRow` は「既知の列名リスト」を渡す前提の実装で、
 *   **未知の他社ファイルを読む T-04 では必ず null が返る。**だから自前で持つ。
 *
 * 先頭 scanRows 行それぞれについて
 *   n        = 非空セル数
 *   allText  = 非空セルがすべて numeric === false
 *   noDup    = 非空セルの normalizeHeader 後の値に重複が無い
 *   hasBelow = その行より下に、非空セル数が n の半分以上ある行がある
 *   score    = n*2 + (allText?3:0) + (noDup?2:0) + (hasBelow?3:0)
 * n === 0 は候補外。n === 1 は、他に n >= 2 の候補があるなら候補外（表題行を弾く）。
 * 最高スコア、同点なら上の行。候補ゼロなら null。
 */
export function detectHeaderRow(grid: Grid, scanRows: number = HEADER_SCAN_ROWS): number | null {
  const counts: number[] = [];
  for (let r = 0; r < grid.length; r++) counts[r] = countNonEmpty(grid[r]);

  const scanTo = Math.min(grid.length, Math.max(0, scanRows));
  const candidates: { index: number; n: number; score: number }[] = [];

  for (let r = 0; r < scanTo; r++) {
    const n = counts[r];
    if (n === 0) continue;
    const row = grid[r] ?? [];

    let allText = true;
    let noDup = true;
    const seen = new Set<string>();
    for (const cell of row) {
      if (!cell || cell.text.trim() === "") continue;
      if (cell.numeric) allText = false;
      const key = normalizeHeader(cell.text);
      if (seen.has(key)) noDup = false;
      seen.add(key);
    }

    let hasBelow = false;
    for (let k = r + 1; k < grid.length; k++) {
      if (counts[k] >= n / 2) {
        hasBelow = true;
        break;
      }
    }

    const score = n * 2 + (allText ? 3 : 0) + (noDup ? 2 : 0) + (hasBelow ? 3 : 0);
    candidates.push({ index: r, n, score });
  }

  if (candidates.length === 0) return null;

  // 表題だけの行（n === 1）は、まともな候補があるなら外す
  const pool = candidates.some((c) => c.n >= 2) ? candidates.filter((c) => c.n >= 2) : candidates;

  let best = pool[0];
  for (const c of pool) {
    if (c.score > best.score) best = c; // 同点は先に出た行（＝上の行）が残る
  }
  return best.index;
}

/* ------------------------------------------------------------------ *
 * 小計行の疑い（§8-6）
 * ------------------------------------------------------------------ */

const SUBTOTAL_WORDS = /^(合計|小計|総計|計|累計|total|sum)$/;

/**
 * ① 値の入っているセルが2つ以下 ② そのいずれかが合計語に一致
 * の両方を満たす行だけ true。**自動では消さない。**
 */
function detectSubtotal(cells: SourceCell[]): boolean {
  const filled: string[] = [];
  for (const cell of cells) {
    const text = cell.text.trim();
    if (text !== "") filled.push(text);
    if (filled.length > 2) return false;
  }
  if (filled.length === 0) return false;
  return filled.some((text) => SUBTOTAL_WORDS.test(unifyKey(text)));
}

/* ------------------------------------------------------------------ *
 * 格子 → SourceFile
 * ------------------------------------------------------------------ */

export interface SourceMeta {
  id: string;
  name: string;
  /** xlsx のとき読んだシート名。CSV は "" */
  sheetName: string;
  /** そのブックの全シート名。CSV は [] */
  sheetNames: string[];
  /** CSV の各 grid 行に対応する元ファイル行番号（`parseCsv` の lines）。xlsx は省略 */
  lines?: number[];
}

/**
 * 読み込んだ格子を SourceFile に変換する。
 * シート選択・見出し行の選び直しは、同じ grid にこの関数を掛け直すだけでよい。
 */
export function buildSourceFileFromGrid(
  grid: Grid,
  meta: SourceMeta,
  opts: ParseOptions = {},
): ParseFileResult {
  const sourceName = meta.name;
  const issues: ToolIssue[] = [];
  const fail = (message: string, line = 0): ParseFileResult => {
    issues.push({ line, level: "error", message });
    return { file: null, issues, sourceName };
  };
  const lineOf = (rowIndex: number): number => meta.lines?.[rowIndex] ?? rowIndex + 1;

  if (grid.length === 0 || grid.every((row) => rowIsEmpty(row))) {
    return fail("シートが空です。表の入ったファイルを選んでください。");
  }

  /* 見出し行を決める ------------------------------------------------ */
  let headerIndex: number;
  if (opts.headerRow !== undefined) {
    headerIndex = opts.headerRow === NO_HEADER_ROW ? NO_HEADER_ROW : opts.headerRow;
    if (headerIndex >= 0 && rowIsEmpty(grid[headerIndex])) {
      return fail(
        `見出し行に指定された ${lineOf(headerIndex)}行目が空です。ほかの行を選ぶか、「見出し行なし」にしてください。`,
        lineOf(headerIndex),
      );
    }
  } else {
    const detected = detectHeaderRow(grid, HEADER_SCAN_ROWS);
    if (detected === null) {
      return fail(
        `先頭 ${HEADER_SCAN_ROWS}行のなかに見出し行が見つかりませんでした。見出し行を選び直すか、「見出し行なし」でお試しください。`,
      );
    }
    headerIndex = detected;
  }
  const headerLine = headerIndex === NO_HEADER_ROW ? 0 : lineOf(headerIndex);
  const dataStart = headerIndex === NO_HEADER_ROW ? 0 : headerIndex + 1;

  /* 列数を決める ---------------------------------------------------- */
  let colCount = headerIndex === NO_HEADER_ROW ? 0 : widthOf(grid[headerIndex]);
  for (let r = dataStart; r < grid.length; r++) {
    const row = grid[r];
    if (rowIsEmpty(row)) continue;
    colCount = Math.max(colCount, widthOf(row));
  }
  if (colCount === 0) {
    return fail("表の中身が見つかりませんでした。見出し行の下に1行以上のデータが要ります。", headerLine);
  }
  if (colCount > MAX_SOURCE_COLUMNS) {
    issues.push({
      line: headerLine,
      level: "warn",
      message: `列が ${colCount}列あります。先頭 ${MAX_SOURCE_COLUMNS}列だけを読み込みました。`,
    });
    colCount = MAX_SOURCE_COLUMNS;
  }

  /* データ行 -------------------------------------------------------- */
  const rows: SourceRow[] = [];
  for (let r = dataStart; r < grid.length; r++) {
    const raw = grid[r];
    if (rowIsEmpty(raw)) continue; // 空行は黙って飛ばす（§8-6）
    const cells: SourceCell[] = [];
    for (let c = 0; c < colCount; c++) cells.push(fromCell(raw?.[c]));
    rows.push({ line: lineOf(r), cells, suspectSubtotal: detectSubtotal(cells) });
  }

  if (rows.length === 0) {
    return fail(
      headerIndex === NO_HEADER_ROW
        ? "データ行がありません。"
        : `${headerLine}行目を見出しとして読みましたが、その下にデータがありません。見出し行を選び直してください。`,
      headerLine,
    );
  }
  if (rows.length > MAX_ROWS_PER_FILE) {
    return fail(
      `データが ${rows.length}行あり、1ファイルの上限（${MAX_ROWS_PER_FILE}行）を超えています。ファイルを分けてお試しください。`,
    );
  }

  /* 列 -------------------------------------------------------------- */
  const columns: SourceColumn[] = [];
  for (let c = 0; c < colCount; c++) {
    const rawHeader = headerIndex === NO_HEADER_ROW ? "" : cellAt(grid, headerIndex, c).text.trim();
    const header = rawHeader === "" ? `列${colLetter(c)}` : rawHeader;

    const samples: string[] = [];
    const sampleCells: SourceCell[] = [];
    for (const row of rows) {
      if (samples.length >= SAMPLE_VALUES_PER_COLUMN) break;
      const cell = row.cells[c] ?? EMPTY_SOURCE_CELL;
      const text = sampleText(cell);
      if (text === "") continue;
      samples.push(text);
      sampleCells.push(cell);
    }

    columns.push({
      index: c,
      header,
      key: unifyKey(header),
      duplicate: false, // 下でまとめて立てる
      samples,
      guessedKind: guessKind(sampleCells),
    });
  }

  // 同じ見出しが2つ以上あるか（内部は列番号で区別する。画面が "(2)" を足すための印）
  const keyCount = new Map<string, number>();
  for (const col of columns) keyCount.set(col.key, (keyCount.get(col.key) ?? 0) + 1);
  for (const col of columns) {
    if ((keyCount.get(col.key) ?? 0) > 1) col.duplicate = true;
  }
  const duplicated = [...keyCount.entries()].filter(([, n]) => n > 1).length;
  if (duplicated > 0) {
    issues.push({
      line: headerLine,
      level: "warn",
      message: `同じ見出しの列が ${duplicated}組あります。画面では「(2)」を付けて区別します。`,
    });
  }

  const file: SourceFile = {
    id: meta.id,
    name: meta.name,
    sheetName: meta.sheetName,
    sheetNames: meta.sheetNames,
    headerIndex,
    headerLine,
    columns,
    rows,
  };
  return { file, issues, sourceName };
}

/* ------------------------------------------------------------------ *
 * バイト列 → SourceFile
 * ------------------------------------------------------------------ */

/** 「明細」シートを優先し、無ければ先頭シート（`_shared/readXlsx` と同じ作法） */
function pickSheet(sheets: { name: string; grid: Grid }[], wanted?: string): number {
  if (wanted !== undefined) {
    const exact = sheets.findIndex((s) => s.name === wanted);
    if (exact >= 0) return exact;
    const loose = sheets.findIndex((s) => normalizeHeader(s.name) === normalizeHeader(wanted));
    if (loose >= 0) return loose;
  }
  const meisai = sheets.findIndex((s) => normalizeHeader(s.name) === "明細");
  return meisai >= 0 ? meisai : 0;
}

/**
 * 取り込んだファイル1つを読む。
 * `.xlsx`（zip）と `.csv`（UTF-8 → 失敗したら Shift_JIS）だけを受ける。
 */
export function parseSourceBytes(
  bytes: Uint8Array,
  fileName: string,
  opts: ParseOptions = {},
): ParseFileResult {
  const sourceName = fileName;
  const id = opts.id ?? "f1";
  const fail = (message: string): ParseFileResult => ({
    file: null,
    issues: [{ line: 0, level: "error", message }],
    sourceName,
  });

  if (!bytes || bytes.length === 0) return fail("ファイルが空です。");

  if (isZip(bytes)) {
    let sheets: { name: string; grid: Grid }[];
    try {
      sheets = readXlsxSheets(bytes);
    } catch (e) {
      return fail(
        e instanceof SheetReadError ? e.message : "Excelファイルを読み取れませんでした。",
      );
    }
    const sheetNames = sheets.map((s) => s.name);
    const picked = pickSheet(sheets, opts.sheetName);
    const sheet = sheets[picked];
    const result = buildSourceFileFromGrid(
      sheet.grid,
      { id, name: fileName, sheetName: sheet.name, sheetNames },
      opts,
    );
    if (opts.sheetName !== undefined && sheet.name !== opts.sheetName) {
      result.issues.unshift({
        line: 0,
        level: "warn",
        message: `シート「${opts.sheetName}」が見つからないため、「${sheet.name}」を読み込みました。`,
      });
    }
    return result;
  }

  if (/\.xls$/i.test(fileName)) {
    return fail(
      "旧形式の .xls には対応していません。Excel で「名前を付けて保存」→ .xlsx か CSV に変換してからお試しください。",
    );
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    return fail(
      "旧形式の Excel ファイル（.xls）のようです。.xlsx か CSV に変換してからお試しください。",
    );
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return fail("PDF は読み取れません。表の .xlsx か CSV をお使いください。");
  }

  const decoded = decodeCsvBytes(bytes);
  const csv = parseCsv(decoded.text);
  return buildSourceFileFromGrid(
    csv.grid,
    { id, name: fileName, sheetName: "", sheetNames: [], lines: csv.lines },
    opts,
  );
}
