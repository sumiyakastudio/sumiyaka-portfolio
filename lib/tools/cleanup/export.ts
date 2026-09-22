/**
 * 名簿クレンジングツール（T-05） — 書き出し（.xlsx / .csv）
 *
 * ⚠ この層は一切ネットワークへ出ない（共通仕様 §3-1）。戻り値をそのまま Blob にして落とす。
 *
 * ⚠ **名簿シートは全セルを文字列として書く。**（計画書 §10-2）
 *    数値に変換すると Excel が `100-0001` を日付に、`0312345678` を数値に読み替えて、
 *    直したそばから壊れる。`_shared/xlsxWriter` は JS の string を inlineStr で書くので、
 *    **string のまま渡すこと**が要件そのものになる。ここで `Number(...)` を書いたらツールの価値が消える。
 *
 * ⚠ CSV は **UTF-8 BOM 付き**（`buildCsv` の既定）。Shift_JIS では書き出さない（計画書 §10-1）。
 *    `TextEncoder` は UTF-8 しか出せず、Shift_JIS エンコーダを自前で持つと
 *    表現できない文字（絵文字・一部の異体字）で必ず壊れる。元ファイルが Shift_JIS でも出力は UTF-8 BOM。
 *
 * ⚠ 重複候補シートに「削除」列は作らない。消すかどうかはツールが決めない（計画書 §4-2・§10-2）。
 *
 * ⚠ 重い依存（fflate）を引くので、UI からは **動的 import** で呼ぶこと。
 */

import { safeFileName } from "../_shared/format";
import { buildCsv, buildXlsx } from "../_shared/xlsxWriter";
import type { XlsxCell, XlsxSheetInput } from "../_shared/xlsxWriter";
import { ruleById } from "./rules";
import { DUPLICATE_LEVEL_LABELS, RISK_LABELS } from "./types";
import type { ExportInput, RuleId, RuleRisk } from "./types";

/* ------------------------------------------------------------------ *
 * シートの形（計画書 §10-2）
 * ------------------------------------------------------------------ */

const LIST_SHEET = "名簿";
const CHANGE_SHEET = "修正一覧";
const DUPLICATE_SHEET = "重複候補";

const CHANGE_HEADER: readonly string[] = [
  "元ファイルの行番号",
  "行",
  "列",
  "修正前",
  "修正後",
  "適用した規則",
  "危険度",
];

/** ⚠「削除」列は作らない */
const DUPLICATE_HEADER: readonly string[] = [
  "組",
  "判定",
  "類似度",
  "元ファイルの行番号",
  "照合に使った値",
  "比較キー",
];

const CHANGE_WIDTHS: readonly number[] = [16, 8, 16, 30, 30, 34, 10];
const DUPLICATE_WIDTHS: readonly number[] = [6, 18, 10, 16, 34, 34];

/* ------------------------------------------------------------------ *
 * 小道具
 * ------------------------------------------------------------------ */

/** 危険度の高さ。表示は RISK_LABELS（安全／注意／危険） */
const RISK_ORDER: Record<RuleRisk, number> = { safe: 0, caution: 1, danger: 2 };

/** 適用した規則名を「／」で連結する（例：`半角カナを全角に／前後の空白を落とす`） */
function ruleLabels(ids: readonly RuleId[]): string {
  return ids.map((id) => ruleById(id).label).join("／");
}

/** 重なった規則のうち**最も高い**危険度を返す */
function highestRisk(ids: readonly RuleId[]): string {
  let worst: RuleRisk = "safe";
  for (const id of ids) {
    const risk = ruleById(id).risk;
    if (RISK_ORDER[risk] > RISK_ORDER[worst]) worst = risk;
  }
  return RISK_LABELS[worst];
}

/** 見出しは**原文のまま**戻す（利用者が役割を変えても見出しは変えない） */
function headerRow(input: ExportInput): string[] {
  return input.columns.length > 0
    ? input.columns.map((c) => c.header)
    : [...input.parsed.headers];
}

/**
 * 名簿シートの本文。
 * ⚠ すべて `String` のまま渡す（＝ inlineStr で書かれる）。number へ変換しない。
 */
function listRows(input: ExportInput): string[][] {
  return input.result.rows.map((row) => row.cells.map((value) => String(value)));
}

function changeRows(input: ExportInput): XlsxCell[][] {
  return input.result.changes.map((change) => [
    change.sourceLine,
    change.row,
    change.header,
    change.before,
    change.after,
    ruleLabels(change.ruleIds),
    highestRisk(change.ruleIds),
  ]);
}

function duplicateRows(input: ExportInput): XlsxCell[][] {
  const out: XlsxCell[][] = [];
  for (const group of input.result.duplicates) {
    const level = DUPLICATE_LEVEL_LABELS[group.level];
    // near のときだけ入る。Excel の並べ替え・絞り込みが効くよう、行ごとに同じ値を繰り返す
    const similarity =
      group.similarity === undefined ? "" : Math.round(group.similarity * 100) / 100;
    for (let i = 0; i < group.sourceLines.length; i++) {
      out.push([
        group.mark,
        level,
        similarity,
        group.sourceLines[i],
        group.values[i] ?? "",
        group.key,
      ]);
    }
  }
  return out;
}

/** 列幅（文字数）の目安。全角は2文字ぶんとして数える */
function displayWidth(value: string): number {
  let width = 0;
  for (const ch of value) width += (ch.codePointAt(0) ?? 0) < 0x80 ? 1 : 2;
  return width;
}

function columnWidths(rows: readonly (readonly string[])[]): number[] {
  let count = 0;
  for (const row of rows) count = Math.max(count, row.length);
  const widths = new Array<number>(count).fill(0);
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const w = displayWidth(row[c] ?? "");
      if (w > widths[c]) widths[c] = w;
    }
  }
  return widths.map((w) => Math.min(44, Math.max(8, w + 2)));
}

/* ------------------------------------------------------------------ *
 * 公開API
 * ------------------------------------------------------------------ */

/** 整えた名簿（.xlsx）。3シート＝「名簿」「修正一覧」「重複候補」 */
export function buildCleanedWorkbook(input: ExportInput): Uint8Array {
  const headers = headerRow(input);
  const body = listRows(input);

  const sheets: XlsxSheetInput[] = [
    {
      name: LIST_SHEET,
      header: headers,
      rows: body,
      colWidths: columnWidths([headers, ...body]),
    },
    {
      name: CHANGE_SHEET,
      header: CHANGE_HEADER,
      rows: changeRows(input),
      colWidths: CHANGE_WIDTHS,
    },
    {
      name: DUPLICATE_SHEET,
      header: DUPLICATE_HEADER,
      rows: duplicateRows(input),
      colWidths: DUPLICATE_WIDTHS,
    },
  ];
  return buildXlsx(sheets);
}

/** 整えた名簿（.csv）。「名簿」シートだけ・UTF-8 BOM 付き */
export function buildCleanedCsv(input: ExportInput): string {
  return buildCsv([headerRow(input), ...listRows(input)]);
}

/** 修正レポート（.csv）。「修正一覧」シートだけ・UTF-8 BOM 付き */
export function buildChangeReportCsv(input: ExportInput): string {
  return buildCsv([CHANGE_HEADER, ...changeRows(input)]);
}

/**
 * 書き出しのファイル名。`stamp` は "YYYYMMDD"（呼び出し側が渡す）。
 * ⚠ 拡張子を付ける前に `safeFileName()` を通す（60字で切られて拡張子が消えるのを防ぐ）。
 */
export function exportFileName(
  kind: "list" | "report",
  ext: "xlsx" | "csv",
  stamp: string,
): string {
  const base = kind === "list" ? "整えた名簿" : "修正レポート";
  return `${safeFileName(`${base}_${stamp}`)}.${ext}`;
}
