/**
 * 名簿クレンジングツール（T-05） — 入力の読み取り（.xlsx / .csv）
 *
 * ⚠ この層は一切ネットワークへ出ない（共通仕様 §3-1）。fetch / "use server" を書かない。
 *    受け取るのは File から読んだバイト列だけで、結果は呼び出し元へ返すのみ。
 *
 * ⚠ npm の `xlsx` パッケージは使わない。zip 展開と XML の読み取りは
 *    `_shared/sheetReader` に集約されている（共通仕様 §4）。
 *
 * ⚠ 「整った入力」原則の適用範囲は **形式** であって **値** ではない（計画書 §5-1）。
 *    ・形式（1シート・見出し行あり・結合セル無し）＝整っている前提。崩れていたら素直に error
 *    ・値（全角半角・カナ・法人格・空白・異体字）＝汚れている前提。**直すのがこのツールの仕事**
 *    結合セル対応・複数シート対応を足し始めたら、それは特注版（有料の側）を無料で解いている。
 *
 * ⚠ この層は **値を1文字も直さない。** `NameRow.cells` も `headers` も原文のまま（trim もしない）。
 *    直すのは rules.ts / apply.ts の仕事で、ここで先に整えると「修正前」が残らなくなる（計画書 §15-2）。
 *
 * ⚠ error は **ファイル全体に関わるものだけ**（計画書 §5-5）。値が汚れていることは error ではないので、
 *    行単位の error は作らない＝行を黙って落とさない。
 *
 * ⚠ 重い依存（fflate）を引くので、UI からは **動的 import** で呼ぶこと（計画書 §14-6）。
 */

import {
  SheetReadError,
  cellAt,
  decodeCsvBytes,
  findHeaderRow,
  isZip,
  normalizeHeader,
  parseCsv,
  readXlsxSheets,
  rowIsEmpty,
} from "../_shared/sheetReader";
import type { Cell, Grid, ToolIssue } from "../_shared/sheetReader";
import {
  HEADER_SCAN_ROWS,
  MAX_COLUMNS,
  MAX_ROWS,
  ROLE_GUESS_WORDS,
  ROLE_HEADER_WORDS,
} from "./types";
import type { ColumnRole, ColumnSpec, NameRow, ParseResult } from "./types";

/* ------------------------------------------------------------------ *
 * 列の役割の推定
 * ------------------------------------------------------------------ */

/**
 * 見出し照合用のキー。
 * `normalizeHeader`（全角→半角・空白と括弧を落とす）を通したうえで小文字化する。
 * 小文字化を `_shared` 側に足すのは却下されている（共通仕様 §4）ので、ここで行う。
 */
function headerKey(value: string): string {
  return normalizeHeader(value).toLowerCase();
}

/**
 * 見出しから列の役割を推定する。どれにも当たらなければ `skip`（＝一切触らない）。
 * 「分からないから全部直しておく」は最悪の選択（計画書 §15-7）。
 *
 * ★ 照合は2周に分けている。
 *   1周目＝**完全一致**、2周目＝**部分一致**（どちらも `ROLE_GUESS_WORDS` の並び順に評価し、
 *   最初に当たった役割を採る）。
 *
 * ⚠ 部分一致だけの1周で済ませると `会社名` が壊れる。`personName` の語に1文字の「名」が入っていて、
 *   `personName` は `companyName` より前に並んでいるため、「会社名」「顧客名」「団体名」まで
 *   personName として拾ってしまう。完全一致を先に通すと、
 *   ・`会社名` → companyName（1周目で確定）
 *   ・`取引先コード` → code（1周目で外れ、2周目で code が companyName より前に来る＝計画書 §5-4 の意図どおり）
 *   ・`氏名カナ` → kana（同上。kana が personName より前）
 *   の3つが同時に成り立つ。**判定順の意図は変えていない。**
 */
export function guessRole(header: string): ColumnRole {
  const key = headerKey(header);
  if (key === "") return "skip";

  for (const { role, words } of ROLE_GUESS_WORDS) {
    for (const word of words) {
      if (headerKey(word) === key) return role;
    }
  }
  for (const { role, words } of ROLE_GUESS_WORDS) {
    for (const word of words) {
      const needle = headerKey(word);
      if (needle !== "" && key.includes(needle)) return role;
    }
  }
  return "skip";
}

/* ------------------------------------------------------------------ *
 * 見出し行と列数
 * ------------------------------------------------------------------ */

/**
 * 見出し行を決める（計画書 §5-3）。名簿は列が固定でないので2段構えにする。
 *  1. 役割語（`ROLE_HEADER_WORDS`）が最も多く当たった行。表の上に表題やメモ行があっても拾える
 *  2. 当たらなければ「空でないセルが2つ以上ある最初の行」。独自の見出しだけの表でも動く
 * どちらでも決まらなければ -1（呼び出し元で error）。
 */
function findHeaderIndex(grid: Grid): number {
  const byWords = findHeaderRow(grid, ROLE_HEADER_WORDS, ROLE_HEADER_WORDS, HEADER_SCAN_ROWS);
  if (byWords) return byWords.index;

  const scanTo = Math.min(grid.length, HEADER_SCAN_ROWS);
  for (let r = 0; r < scanTo; r++) {
    const row = grid[r];
    if (!row) continue;
    let filled = 0;
    for (const cell of row) {
      if (cell && cell.text.trim() !== "") filled++;
    }
    if (filled >= 2) return r;
  }
  return -1;
}

/** 行の実質的な列数（末尾の空セルは数えない）。空白1つだけのセルは「値がある」とみなす */
function widthOf(row: Cell[] | undefined): number {
  if (!row) return 0;
  let last = row.length;
  while (last > 0) {
    const cell = row[last - 1];
    if (cell && cell.text !== "") break;
    last--;
  }
  return last;
}

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */

export function parseNameList(bytes: Uint8Array, fileName: string): ParseResult {
  const sourceName = fileName;
  const issues: ToolIssue[] = [];
  let encoding: ParseResult["encoding"];
  let sheetName: string | undefined;

  const fail = (message: string): ParseResult => {
    issues.push({ line: 0, level: "error", message });
    return {
      headers: [],
      columns: [],
      rows: [],
      issues,
      sourceName,
      encoding,
      sheetName,
      headerLine: 0,
      numericCells: new Set<string>(),
    };
  };

  if (!bytes || bytes.length === 0) return fail("ファイルが空です。");

  let grid: Grid;
  /** 表の行番号（0始まり）→ 元ファイル上の行番号（1始まり） */
  let lineOf: (rowIndex: number) => number;

  if (isZip(bytes)) {
    let sheets;
    try {
      sheets = readXlsxSheets(bytes);
    } catch (e) {
      return fail(
        e instanceof SheetReadError ? e.message : "Excelファイルを読み取れませんでした。",
      );
    }
    // ★ 先頭シートだけを読む（計画書 §5-2）。readXlsx() は「明細」シートを優先するため、
    //    名簿に「明細」という名のシートがあると取り違える。ここでは必ずブックの並び順の先頭を採る。
    const first = sheets[0];
    if (!first) return fail("Excelファイルの中にワークシートが見つかりませんでした。");
    grid = first.grid;
    sheetName = first.name;
    if (sheets.length > 1) {
      issues.push({
        line: 0,
        level: "warn",
        message: `シートが ${sheets.length} 枚あります。先頭の「${first.name}」シートだけを読みました。`,
      });
    }
    // xlsx は行番号 r 属性そのものが Excel 上の行番号
    lineOf = (i) => i + 1;
  } else if (/\.xls$/i.test(sourceName) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) {
    return fail(
      "旧形式の .xls には対応していません。Excel で「名前を付けて保存」→ .xlsx か CSV に変換してからお試しください。",
    );
  } else if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return fail("PDF は読み取れません。名簿の .xlsx か CSV をお使いください。");
  } else {
    const decoded = decodeCsvBytes(bytes);
    encoding = decoded.encoding;
    const csv = parseCsv(decoded.text);
    grid = csv.grid;
    lineOf = (i) => csv.lines[i] ?? i + 1;
  }

  if (grid.length === 0 || grid.every((row) => rowIsEmpty(row))) {
    return fail("表が空です。1行目に列の名前を置き、1行に1件で入力してください。");
  }

  const headerIndex = findHeaderIndex(grid);
  if (headerIndex < 0) {
    return fail(
      "見出し行が見つかりませんでした。1行目に列の名前（会社名・氏名・住所など）を置いてください。",
    );
  }
  const headerLine = lineOf(headerIndex);

  // 列数（見出し行と本文の広いほうに合わせる）
  let colCount = widthOf(grid[headerIndex]);
  for (let r = headerIndex + 1; r < grid.length; r++) {
    const row = grid[r];
    if (rowIsEmpty(row)) continue;
    const w = widthOf(row);
    if (w > colCount) colCount = w;
  }
  if (colCount === 0) {
    return fail(
      "見出し行が見つかりませんでした。1行目に列の名前（会社名・氏名・住所など）を置いてください。",
    );
  }
  if (colCount > MAX_COLUMNS) {
    return fail(
      `列が ${colCount}列あり、上限の ${MAX_COLUMNS}列を超えています。名簿に関係する列だけを残してからお試しください。`,
    );
  }

  // 見出しと列の役割
  const headers: string[] = [];
  const columns: ColumnSpec[] = [];
  const firstOfHeader = new Map<string, number>();
  for (let c = 0; c < colCount; c++) {
    const raw = cellAt(grid, headerIndex, c).text; // ★ 原文のまま。書き出し時にそのまま戻す
    headers.push(raw);

    let role: ColumnRole = "skip";
    if (raw.trim() === "") {
      // 見出しが空の列は skip 固定にして続行（計画書 §5-5）
      issues.push({
        line: headerLine,
        level: "warn",
        message: `${c + 1}列目の見出しが空です。この列は触らずに、そのまま書き出します。`,
      });
    } else {
      role = guessRole(raw);
      const key = normalizeHeader(raw);
      const first = firstOfHeader.get(key);
      if (first === undefined) {
        firstOfHeader.set(key, c);
      } else {
        issues.push({
          line: headerLine,
          column: raw,
          level: "warn",
          message: `見出し「${raw.trim()}」の列が ${first + 1}列目と ${c + 1}列目にあります。どちらも同じ役割で処理します。`,
        });
      }
    }
    columns.push({ index: c, header: raw, role, guessed: true });
  }

  // 行数（組み立てる前に数える。上限を超えたファイルを全部組んでから落とすのは無駄）
  let dataRows = 0;
  for (let r = headerIndex + 1; r < grid.length; r++) {
    if (!rowIsEmpty(grid[r])) dataRows++;
  }
  if (dataRows === 0) {
    return fail("見出し行の下にデータがありません。1行に1件で入力してください。");
  }
  if (dataRows > MAX_ROWS) {
    return fail(
      `データが ${dataRows}行あり、上限の ${MAX_ROWS}行を超えています。ファイルを分けてからお試しください。`,
    );
  }

  const rows: NameRow[] = [];
  /**
   * 元の Excel で数値型として保存されていたセルの位置（`"行,列"`／どちらも0始まり）。
   * ⚠ ここで捨てると、郵便番号の先頭0が**読み込む前に失われている**事実を誰も知らせられなくなる
   *   （計画書 §7-3 `numericStoredCode`）。復元は原理的に不可能なので、直さず知らせるだけにする。
   */
  const numericCells = new Set<string>();

  for (let r = headerIndex + 1; r < grid.length; r++) {
    const raw = grid[r];
    if (rowIsEmpty(raw)) continue;

    const rowIndex = rows.length;
    const cells: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const cell = cellAt(grid, r, c);
      cells.push(cell.text); // ★ 原文のまま（trim もしない）
      if (cell.numeric && cell.text !== "") numericCells.add(`${rowIndex},${c}`);
    }
    rows.push({ cells, sourceLine: lineOf(r) });
  }

  return { headers, columns, rows, issues, sourceName, encoding, sheetName, headerLine, numericCells };
}
