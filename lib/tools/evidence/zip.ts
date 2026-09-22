/**
 * 電帳法ファイル名 一括リネーム — ZIP へ詰める中身の組み立て
 *
 * ⚠ ここでは `fflate` を import しない。zipSync を呼ぶのは UI 側（重い依存は動的 import）。
 *    この層を純関数として切り出してあるのは、**元ファイルのバイト列が1バイトも変わっていないこと**を
 *    Node から SHA-256 で検証できるようにするため（計画書 §12-6・最重要項目）。
 *
 * ⚠ バイト列の読み取り（blob.arrayBuffer）は書き出しの直前に1件ずつ行う。
 *    最初に全件を Uint8Array にすると 200MB を丸ごと抱えることになる。
 *    そのため「一覧を出す」と「バイト列を受け取って組む」を2つの関数に分けてある。
 */

import { isNamedStatus } from "./calc";
import { INDEX_CSV_NAME, MAP_CSV_NAME } from "./types";
import { buildIndexCsv, buildMapCsv } from "./csv";
import type { EvidenceFile, RenamePlan } from "./types";

export interface ZipEntryPlan {
  /** ZIP 内のパス（フォルダ込み） */
  path: string;
  file: EvidenceFile;
}

/**
 * ZIP に入れる証憑の一覧（台帳の行順 → 最後に `_未処理`）。バイト列はまだ読まない。
 * missing / rejected と、名前を決められなかったものは入らない。
 */
export function listZipEntries(plan: RenamePlan): ZipEntryPlan[] {
  const entries: ZipEntryPlan[] = [];

  for (const pair of plan.pairs) {
    if (!isNamedStatus(pair.status) || !pair.file || pair.to === "") continue;
    entries.push({ path: pair.to, file: pair.file });
  }
  for (const pair of plan.pairs) {
    if (pair.status !== "unmatched" || !pair.file || pair.to === "") continue;
    entries.push({ path: pair.to, file: pair.file });
  }

  return entries;
}

/**
 * listZipEntries と同じ順のバイト列を受け取り、CSV2本を足して zipSync への入力を組む。
 *
 * ⚠ 受け取ったバイト列はそのまま入れる。中身を触らない（付け替えるのは名前だけ）。
 */
export function buildZipInput(
  plan: RenamePlan,
  bytesList: readonly Uint8Array[],
): Record<string, Uint8Array> {
  const entries = listZipEntries(plan);
  if (entries.length !== bytesList.length) {
    throw new Error(
      `ZIPに入れる件数が合いません（一覧 ${entries.length}件 / バイト列 ${bytesList.length}件）。`,
    );
  }

  const out: Record<string, Uint8Array> = {};
  out[INDEX_CSV_NAME] = buildIndexCsv(plan);
  out[MAP_CSV_NAME] = buildMapCsv(plan);

  for (let i = 0; i < entries.length; i++) {
    const path = entries[i].path;
    // 名前の重複は buildPlan の枝番で潰してある。ここで当たったら黙って上書きせずに止める
    if (Object.prototype.hasOwnProperty.call(out, path)) {
      throw new Error(`ZIP内のパスが重複しています（${path}）。`);
    }
    out[path] = bytesList[i];
  }

  return out;
}
