/**
 * 電帳法ファイル名 一括リネーム — 証憑の取り込みと、リネーム計画の組み立て
 *
 * ⚠ この層は一切ネットワークへ出ない。受け取るのは File / Blob と、読み終わった台帳の行だけ。
 * ⚠ 元のファイルのバイト列はここでは読まない（読むのは書き出しの直前・1件ずつ）。
 *    付け替えるのは名前だけ、という約束を層の設計そのもので守る。
 * ⚠ 推測しない。台帳の「元のファイル名」列だけで紐付ける（計画書 §5-3・§13 の 1）。
 * ⚠ error のある行は結果に混ぜない。0 や空文字で埋めない（共通仕様 §5・落とし穴2）。
 *    ただし**ファイルは黙って落とさない**。名前が決められなかったファイルは `_未処理/` へ入れる
 *    （計画書 §13 の 3。落とすと利用者が元ファイルを消したときに証憑そのものが失われる）。
 *
 * ⚠ この層は UI から**静的 import** される（オプションを変えるたびに同期で呼ぶ）。
 *    重い依存を持ち込まないこと。fflate / pdf-lib / 書体には触らない。
 */

import { pad2, toHalfWidth } from "./text";
import { buildRowName, buildUnmatchedName, splitFileName } from "./naming";
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_SEQ,
  MAX_TOTAL_BYTES,
  PDF_EXTENSIONS,
} from "./types";
import type {
  EvidenceFile,
  LedgerRow,
  NamingOptions,
  ParseIssue,
  RenameCounts,
  RenamePair,
  RenamePlan,
  RenameStatus,
} from "./types";

/* ------------------------------------------------------------------ *
 * 1. 証憑ファイルの取り込み
 * ------------------------------------------------------------------ */

const ACCEPTED_SET = new Set<string>(ACCEPTED_EXTENSIONS);
const PDF_SET = new Set<string>(PDF_EXTENSIONS);

/** 小文字の拡張子（ドットなし）。拡張子が無ければ "" */
export function extensionOf(name: string): string {
  return splitFileName(name).ext.toLowerCase();
}

/** バイト数 → "12.3"（MB）。上限の案内文にだけ使う */
function mb(bytes: number): string {
  return (bytes / 1048576).toFixed(1);
}

/** Blob が File だったときだけ更新日時が取れる。取れなければ -1 */
function lastModifiedOf(blob: Blob): number {
  const v = (blob as Blob & { lastModified?: unknown }).lastModified;
  return typeof v === "number" ? v : -1;
}

/**
 * 同じファイルを2度読み込んだかの判定キー。
 * バイト列は読まない（200MB を毎回ハッシュすると実用にならない）。
 */
function dedupKey(path: string, size: number, lastModified: number): string {
  return JSON.stringify([path, size, lastModified]);
}

export interface CollectResult {
  /** ok:false のときは空配列（一部だけ取り込まない） */
  files: EvidenceFile[];
  ok: boolean;
  /** ok:false のとき画面の message へ出す1行。ok:true なら "" */
  message: string;
  totalBytes: number;
  /** 今回あらたに加わった件数 */
  addedCount: number;
  /** 既に読み込み済みとして飛ばした件数 */
  skippedCount: number;
}

function collectFailed(message: string): CollectResult {
  return { files: [], ok: false, message, totalBytes: 0, addedCount: 0, skippedCount: 0 };
}

/**
 * 選ばれたファイルを既存の一覧へ**足す**（マージ方式）。
 *
 * 同じ選択を2回行っても重複が増えないよう、
 * `(relativePath || name, size, lastModified)` の3つ組が既存と一致するものは黙って飛ばす。
 *
 * 上限を超えたときは**一部だけ取り込まず**、読み込みそのものを中止する（計画書 §5-1）。
 */
export function collectFiles(
  input: FileList | readonly File[],
  existing?: readonly EvidenceFile[],
): CollectResult {
  const incoming = Array.from(input as ArrayLike<File>);
  const files: EvidenceFile[] = existing ? existing.slice() : [];

  const seen = new Set<string>();
  const keys = new Set<string>();
  for (const f of files) {
    seen.add(dedupKey(f.relativePath || f.name, f.size, lastModifiedOf(f.blob)));
    keys.add(f.key);
  }

  let addedCount = 0;
  let skippedCount = 0;

  for (const raw of incoming) {
    const name = typeof raw.name === "string" ? raw.name : "";
    const relativePath = typeof raw.webkitRelativePath === "string" ? raw.webkitRelativePath : "";
    const size = typeof raw.size === "number" ? raw.size : 0;
    const key0 = relativePath || name;

    const dk = dedupKey(key0, size, lastModifiedOf(raw));
    if (seen.has(dk)) {
      skippedCount++;
      continue;
    }
    if (size > MAX_FILE_BYTES) {
      return collectFailed(
        `「${name}」は ${mb(size)}MB あり、1件あたりの上限（${mb(MAX_FILE_BYTES)}MB）を超えています。読み込みを中止しました。`,
      );
    }
    seen.add(dk);

    let key = key0;
    let n = 1;
    while (keys.has(key)) {
      n++;
      key = `${key0}#${n}`;
    }
    keys.add(key);

    const ext = extensionOf(name);
    files.push({
      key,
      name,
      relativePath,
      ext,
      kind: PDF_SET.has(ext) ? "pdf" : "image",
      accepted: ACCEPTED_SET.has(ext),
      size,
      blob: raw,
    });
    addedCount++;
  }

  if (files.length > MAX_FILES) {
    return collectFailed(
      `合計 ${files.length}件になり、一度に読み込める上限（${MAX_FILES}件）を超えます。分けてお試しください。`,
    );
  }

  let totalBytes = 0;
  for (const f of files) totalBytes += f.size;
  if (totalBytes > MAX_TOTAL_BYTES) {
    return collectFailed(
      `合計 ${mb(totalBytes)}MB になり、上限（${mb(MAX_TOTAL_BYTES)}MB）を超えます。読み込みを中止しました。分けてお試しください。`,
    );
  }

  return { files, ok: true, message: "", totalBytes, addedCount, skippedCount };
}

/* ------------------------------------------------------------------ *
 * 2. 照合キー（計画書 §5-3）
 * ------------------------------------------------------------------ */

/** パス区切り（"/" と "\"）で分割して最後の要素を取る。全角の「／」は分割しない（実在する名前のため） */
function basenameOf(value: string): string {
  const s = value.replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i < 0 ? s : s.slice(i + 1);
}

/** NFC → toHalfWidth → toLowerCase → trim */
function normalizeKey(value: string): string {
  return toHalfWidth(value.normalize("NFC")).toLowerCase().trim();
}

/** 照合キー。basename を取ってから正規化する */
export function matchKey(name: string): string {
  return normalizeKey(basenameOf(name));
}

/** 相対パスの照合キー。区切りを "/" に揃えてから正規化する */
export function pathKey(value: string): string {
  return normalizeKey(value.replace(/\\/g, "/"));
}

function pushInto(map: Map<string, EvidenceFile[]>, key: string, file: EvidenceFile): void {
  if (key === "") return;
  const hit = map.get(key);
  if (hit) hit.push(file);
  else map.set(key, [file]);
}

/** ZIP に正規の名前で入る状態か（索引簿に載る3状態） */
export function isNamedStatus(status: RenameStatus): boolean {
  return status === "ok" || status === "renumbered" || status === "truncated";
}

/* ------------------------------------------------------------------ *
 * 3. リネーム計画
 * ------------------------------------------------------------------ */

type MatchResult =
  | { kind: "file"; file: EvidenceFile }
  | { kind: "missing" }
  | { kind: "error"; message: string };

const AMBIGUOUS_NAME_MESSAGE =
  "同じ名前のファイルが複数あります。台帳には「2024/01/請求書.pdf」のようにフォルダを含めて書いてください。";
const AMBIGUOUS_EXT_MESSAGE =
  "拡張子を除くと同じ名前のファイルが複数あります。台帳には拡張子まで書いてください。";

/**
 * 証憑ファイルと台帳の行を突き合わせ、ZIP 内のパスまで決める。
 *
 * ・順序は台帳の行順（sourceLine 昇順）。枝番は若い行が枝番なし（計画書 §7-5）
 * ・台帳に無いファイルは `_未処理/` へ（計画書 §7-6）。黙って落とさない
 * ・対応していない拡張子は ZIP に入れない（対応表には出す）
 */
export function buildPlan(
  files: readonly EvidenceFile[],
  rows: readonly LedgerRow[],
  options: NamingOptions,
): RenamePlan {
  const issues: ParseIssue[] = [];
  const pairs: RenamePair[] = [];

  const accepted: EvidenceFile[] = [];
  const rejected: EvidenceFile[] = [];
  for (const f of files) (f.accepted ? accepted : rejected).push(f);

  // 照合用の索引
  const byPath = new Map<string, EvidenceFile[]>();
  const byName = new Map<string, EvidenceFile[]>();
  const byStem = new Map<string, EvidenceFile[]>();
  const pathKeys: { file: EvidenceFile; key: string }[] = [];
  for (const f of accepted) {
    const pk = pathKey(f.relativePath || f.name);
    pathKeys.push({ file: f, key: pk });
    pushInto(byPath, pk, f);
    pushInto(byName, matchKey(f.name), f);
    pushInto(byStem, matchKey(splitFileName(f.name).stem), f);
  }

  /** 台帳1行 → 証憑ファイル（計画書 §5-3 の3段階） */
  const findFile = (originalName: string): MatchResult => {
    const raw = originalName.trim();
    if (raw === "") return { kind: "missing" };

    if (raw.indexOf("/") >= 0 || raw.indexOf("\\") >= 0) {
      const pk = pathKey(raw);
      const exact = byPath.get(pk);
      if (exact && exact.length === 1) return { kind: "file", file: exact[0] };
      if (exact && exact.length > 1) return { kind: "error", message: AMBIGUOUS_NAME_MESSAGE };

      // フォルダごと選ぶと webkitRelativePath の先頭に、選んだフォルダ名が付く。
      // その分を許すために末尾一致も見る。**候補がちょうど1件のときだけ**採る。
      const tail = `/${pk}`;
      const cands = pathKeys.filter((p) => p.key.endsWith(tail));
      if (cands.length === 1) return { kind: "file", file: cands[0].file };
      if (cands.length > 1) return { kind: "error", message: AMBIGUOUS_NAME_MESSAGE };
    }

    const hitName = byName.get(matchKey(raw));
    if (hitName) {
      if (hitName.length === 1) return { kind: "file", file: hitName[0] };
      return { kind: "error", message: AMBIGUOUS_NAME_MESSAGE };
    }

    const hitStem = byStem.get(matchKey(splitFileName(basenameOf(raw)).stem));
    if (hitStem) {
      if (hitStem.length === 1) return { kind: "file", file: hitStem[0] };
      return { kind: "error", message: AMBIGUOUS_EXT_MESSAGE };
    }
    return { kind: "missing" };
  };

  const missingPair = (row: LedgerRow, note: string): RenamePair => ({
    status: "missing",
    from: row.originalName,
    to: "",
    folder: "",
    serial: 0,
    row,
    file: null,
    seq: 1,
    note,
  });

  /** 台帳の行順。並びが崩れた配列を渡されても枝番の順序が変わらないようにする */
  const ordered = rows.slice().sort((a, b) => a.sourceLine - b.sourceLine);

  const claimed = new Set<string>();
  const used = new Set<string>();
  const claimedBy = new Map<string, number>();
  let namedSerial = 0;

  for (const row of ordered) {
    const found = findFile(row.originalName);

    if (found.kind === "error") {
      issues.push({ line: row.sourceLine, column: "元のファイル名", level: "error", message: found.message });
      pairs.push(missingPair(row, found.message));
      continue;
    }
    if (found.kind === "missing") {
      pairs.push(missingPair(row, ""));
      continue;
    }

    const file = found.file;
    const owner = claimedBy.get(file.key);
    if (owner !== undefined) {
      const message = `このファイルは ${owner}行目でも指定されています。1つのファイルを2つの行から指すことはできません。`;
      issues.push({ line: row.sourceLine, column: "元のファイル名", level: "error", message });
      pairs.push(missingPair(row, message));
      continue;
    }

    const serial = namedSerial + 1;
    let chosen: { path: string; folder: string; truncated: boolean; seq: number } | null = null;
    let reason: "date" | "amount" | "variable" | "length" | "seq" = "seq";

    for (let seq = 1; seq <= MAX_SEQ; seq++) {
      const build = buildRowName({
        date: row.date,
        vendor: row.vendor,
        amount: row.amount,
        ext: file.ext,
        serial,
        seq,
        options,
      });
      if (!build.ok) {
        reason = build.reason;
        break;
      }
      if (!used.has(build.path.toLowerCase())) {
        chosen = { path: build.path, folder: build.folder, truncated: build.truncated, seq };
        break;
      }
    }

    if (!chosen) {
      // 名前を決められなかった行は結果に混ぜない。
      // ただし証憑は claimed にしないので、このあと `_未処理/` へ入る（黙って落とさない）。
      const message =
        reason === "date"
          ? "取引年月日を読み取れないため、ファイル名を決められません。"
          : reason === "amount"
            ? "取引金額を読み取れないため、ファイル名を決められません。"
            : reason === "variable"
              ? "取引先の名称に、ファイル名に使える文字がありません。"
              : reason === "length"
                ? "取引先の名称が長すぎて、ファイル名を決められません。"
                : `同じ名前が ${MAX_SEQ}件を超えました。台帳を分けてお試しください。`;
      issues.push({ line: row.sourceLine, level: "error", message });
      pairs.push(missingPair(row, `${message}この証憑は「_未処理」に入れます。`));
      continue;
    }

    used.add(chosen.path.toLowerCase());
    claimed.add(file.key);
    claimedBy.set(file.key, row.sourceLine);
    namedSerial = serial;

    const notes: string[] = [];
    if (chosen.seq > 1) notes.push("同じ名前になるため枝番を付けました。");
    if (chosen.truncated) notes.push("取引先名を切り詰めました。");

    pairs.push({
      status: chosen.seq > 1 ? "renumbered" : chosen.truncated ? "truncated" : "ok",
      from: file.relativePath || file.name,
      to: chosen.path,
      folder: chosen.folder,
      serial,
      row,
      file,
      seq: chosen.seq,
      note: notes.join(""),
    });
  }

  // 台帳に紐付かなかった証憑 → `_未処理/`（元の名前のまま）
  for (const file of accepted) {
    if (claimed.has(file.key)) continue;

    let chosen: { path: string; folder: string; truncated: boolean; seq: number } | null = null;
    for (let seq = 1; seq <= MAX_SEQ; seq++) {
      const build = buildUnmatchedName({
        originalName: file.name,
        delimiter: options.delimiter,
        seq,
      });
      if (!build.ok) break;
      if (!used.has(build.path.toLowerCase())) {
        chosen = { path: build.path, folder: build.folder, truncated: build.truncated, seq };
        break;
      }
    }

    if (!chosen) {
      // 現実には起きない（枝番が 999 まで埋まった場合だけ）。黙って消さずに指摘へ出す。
      issues.push({
        line: 0,
        level: "error",
        message: `「${file.name}」のZIP内の名前を決められませんでした。ファイル名を変えてからお試しください。`,
      });
      pairs.push({
        status: "unmatched",
        from: file.relativePath || file.name,
        to: "",
        folder: "",
        serial: 0,
        row: null,
        file,
        seq: 1,
        note: "ZIP内の名前を決められませんでした。",
      });
      continue;
    }

    used.add(chosen.path.toLowerCase());
    const notes = ["台帳に行が見つかりませんでした。"];
    if (chosen.seq > 1) notes.push("同じ名前になるため枝番を付けました。");
    if (chosen.truncated) notes.push("名前が長いため切り詰めました。");

    pairs.push({
      status: "unmatched",
      from: file.relativePath || file.name,
      to: chosen.path,
      folder: chosen.folder,
      serial: 0,
      row: null,
      file,
      seq: chosen.seq,
      note: notes.join(""),
    });
  }

  // 対応していない拡張子（ZIP に入れない）
  for (const file of rejected) {
    issues.push({
      line: 0,
      level: "error",
      message: `「${file.name}」は対応していない形式です（${ACCEPTED_EXTENSIONS.join(" / ")} に対応しています）。ZIPには入れません。`,
    });
    pairs.push({
      status: "rejected",
      from: file.relativePath || file.name,
      to: "",
      folder: "",
      serial: 0,
      row: null,
      file,
      seq: 1,
      note: "対応していない形式です。ZIPには入れません。",
    });
  }

  const counts: RenameCounts = {
    total: pairs.length,
    named: 0,
    renumbered: 0,
    truncated: 0,
    unmatched: 0,
    missing: 0,
    rejected: 0,
  };
  let totalBytes = 0;
  for (const pair of pairs) {
    if (isNamedStatus(pair.status)) {
      counts.named++;
      if (pair.status === "renumbered") counts.renumbered++;
      if (pair.status === "truncated") counts.truncated++;
    } else if (pair.status === "unmatched") {
      counts.unmatched++;
    } else if (pair.status === "missing") {
      counts.missing++;
    } else {
      counts.rejected++;
    }
    if (pair.file && pair.to !== "" && (isNamedStatus(pair.status) || pair.status === "unmatched")) {
      totalBytes += pair.file.size;
    }
  }

  if (counts.missing > 0) {
    issues.push({
      line: 0,
      level: "warn",
      message: `台帳の ${counts.missing}行は、対応するファイルが読み込まれていません（対応表に「ファイルなし」と出ています）。`,
    });
  }

  // Excel が数式として解釈することがある。原文は変えず、指摘だけ出す（計画書 §8-4）
  for (const row of rows) {
    if (row.vendor.startsWith("=")) {
      issues.push({
        line: row.sourceLine,
        column: "取引先",
        level: "warn",
        message: "取引先が「=」で始まります。CSVをExcelで開くと数式として扱われることがあります。",
      });
    }
  }

  return { pairs, issues, counts, totalBytes };
}

/* ------------------------------------------------------------------ *
 * 4. ZIP のファイル名
 * ------------------------------------------------------------------ */

/**
 * 例: evidence_20260822_58件.zip
 * today は呼び出し側から渡す（この層を純関数に保つため）。
 */
export function buildZipFileName(plan: RenamePlan, today: Date): string {
  const y = today.getFullYear();
  const m = pad2(today.getMonth() + 1);
  const d = pad2(today.getDate());
  const count = plan.counts.named + plan.counts.unmatched;
  return `evidence_${y}${m}${d}_${count}件.zip`;
}
