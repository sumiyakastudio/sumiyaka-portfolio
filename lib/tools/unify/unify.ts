/**
 * 列マッピング統合ツール（T-04） — 統合ロジック
 *
 * ★ここは **静的層**。画面が最初から import する。
 *   したがって `_shared/sheetReader` から **値を import しない**（`import type` だけ可）。
 *   sheetReader は先頭で fflate を引くので、値を1つでも取ると
 *   /tools/table-unify を開いただけで fflate が落ちてくる（types.ts §0 のモジュール契約）。
 *
 *   セルの解釈（日付として読めるか・数値として読めるか）は parse.ts が
 *   取り込み時に1度だけ済ませて `SourceCell.date` / `.num` に入れてある。
 *   この関数はそれを**読むだけ**なので純粋で、線を引き直すたびに何度呼んでも安い。
 *
 * ★設計の芯（計画書 §14）
 *   ・**運ぶ。**読み替えられなかった値は原文のまま出して warn。落とさない。
 *   ・**知らせるだけ。**小計行も重複行も、既定では消さない。
 *   ・**整形しない。**`UnifiedCell.text` は出力ファイルに書く生の値。
 *     `formatYen` / `formatDateJa` は画面でだけ使う。
 */

import { EMPTY_SOURCE_CELL, assignmentOf, isReviewLevel } from "./types";
import type {
  ColumnKind,
  MappingTable,
  OutputColumn,
  SourceCell,
  SourceFile,
  TargetColumn,
  TargetSchema,
  ToolIssue,
  UnifiedCell,
  UnifiedRow,
  UnifyOptions,
  UnifyResult,
  UnifyStats,
} from "./types";

/** 由来列の見出し（画面と出力ファイルで同じ文字を使う） */
export const SOURCE_COLUMN_NAME = "取り込み元";
export const SOURCE_LINE_COLUMN_NAME = "元の行";

/** 同じ種類の指摘を並べる上限。超えたぶんは「ほか◯件」にまとめる */
const MAX_LISTED_ISSUES = 20;
/** 1つの（ファイル × 出力列）につき、値の食い違いを行単位で出す上限 */
const MAX_CELL_ISSUES = 5;

/**
 * 重複判定の署名をつなぐ区切り（US = 0x1f）。
 * ⚠ 制御文字は必ずエスケープで書く。生のバイトを置くと git がバイナリ扱いする（共通仕様 §7-3）。
 */
const SIGNATURE_SEP = "\u001f";

const KIND_LABEL: Record<ColumnKind, string> = {
  text: "文字",
  number: "数値",
  date: "日付",
};

/* ------------------------------------------------------------------ *
 * 1セルの作り方（§8-2）
 * ------------------------------------------------------------------ */

function emptyCell(): UnifiedCell {
  return { text: "", num: null, iso: null, mismatch: false };
}

/**
 * 出力列の種類に合わせて1セルを作る。
 *
 * @param flagMismatch 読めなかったときに `mismatch` を立てるか。
 *   出力スキーマの列は立てる。`keepUnmapped` で末尾に足す列は「元のまま運ぶ」だけなので立てない。
 */
function convert(cell: SourceCell, kind: ColumnKind, flagMismatch: boolean): UnifiedCell {
  const raw = cell.text.trim();

  if (kind === "date") {
    if (cell.date !== null) return { text: cell.date, num: null, iso: cell.date, mismatch: false };
    if (raw === "") return emptyCell();
    return { text: raw, num: null, iso: null, mismatch: flagMismatch };
  }

  if (kind === "number") {
    if (cell.num !== null) return { text: String(cell.num), num: cell.num, iso: null, mismatch: false };
    if (raw === "") return emptyCell();
    return { text: raw, num: null, iso: null, mismatch: flagMismatch };
  }

  // text。⚠ num を持たせない。「0012」のような取引先コードが 12 になる事故を防ぐ
  return { text: raw, num: null, iso: null, mismatch: false };
}

function constCell(value: string, date: string | null, num: number | null, kind: ColumnKind): UnifiedCell {
  const raw = value.trim();
  if (raw === "") return emptyCell();
  if (kind === "date") {
    if (date !== null) return { text: date, num: null, iso: date, mismatch: false };
    return { text: raw, num: null, iso: null, mismatch: true };
  }
  if (kind === "number") {
    if (num !== null) return { text: String(num), num, iso: null, mismatch: false };
    return { text: raw, num: null, iso: null, mismatch: true };
  }
  return { text: raw, num: null, iso: null, mismatch: false };
}

/* ------------------------------------------------------------------ *
 * 内部の集計用
 * ------------------------------------------------------------------ */

/** ファイル × 出力列ごとの読み取り具合。warn を「行ごとに200件」出さないためにまとめる（§8-5） */
interface ColumnStat {
  fileName: string;
  target: TargetColumn;
  /** 元の列見出し。固定値のときは null */
  sourceHeader: string | null;
  nonEmpty: number;
  readable: number;
  /** 読めなかった値（行番号つき） */
  bad: { line: number; raw: string }[];
}

/** `keepUnmapped` で末尾に足す列。同じ見出しの列は1本にまとめる */
interface ExtraColumn {
  name: string;
  kind: ColumnKind;
  /** fileId → その列の列番号 */
  byFile: Map<string, number>;
}

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */

export function unify(
  files: SourceFile[],
  schema: TargetSchema,
  mapping: MappingTable,
  options: UnifyOptions,
): UnifyResult {
  const issues: ToolIssue[] = [];
  const columns: OutputColumn[] = [];

  /* ---- 1. 出力列を組む（§8-1 の並び） ---------------------------- */

  if (options.addSourceColumn) {
    columns.push({ name: SOURCE_COLUMN_NAME, kind: "text", origin: "source" });
  }
  if (options.addSourceLineColumn) {
    columns.push({ name: SOURCE_LINE_COLUMN_NAME, kind: "number", origin: "source" });
  }
  const targetOffset = columns.length;
  for (const target of schema.columns) {
    columns.push({ name: target.name, kind: target.kind, origin: "target" });
  }

  /* ---- 2. 出力に載らない入力列を洗い出す（§8-7） ------------------ */

  const droppedSources: string[] = [];
  const extras: ExtraColumn[] = [];
  const extraByKey = new Map<string, ExtraColumn>();

  for (const file of files) {
    const used = new Set<number>();
    for (const target of schema.columns) {
      const assignment = assignmentOf(mapping, file.id, target.id);
      if (assignment.kind === "column") used.add(assignment.index);
    }
    for (const column of file.columns) {
      if (used.has(column.index)) continue;
      if (!options.keepUnmapped) {
        droppedSources.push(`${file.name} の ${column.header}`);
        continue;
      }
      // 同じ見出しの列は1本にまとめる（A社の「No」と B社の「No」を2列に割らない）
      const mergeKey = column.key !== "" ? column.key : `${file.id}#${column.index}`;
      let extra = extraByKey.get(mergeKey);
      if (!extra) {
        extra = { name: column.header, kind: column.guessedKind, byFile: new Map() };
        extraByKey.set(mergeKey, extra);
        extras.push(extra);
      }
      if (!extra.byFile.has(file.id)) extra.byFile.set(file.id, column.index);
    }
  }
  for (const extra of extras) {
    columns.push({ name: extra.name, kind: extra.kind, origin: "unmapped" });
  }

  /* ---- 3. 重複判定に使う列（§8-4） ------------------------------- */

  let dedupeIndexes: number[] = [];
  if (options.dedupe) {
    const wanted = new Set(options.dedupeKeys);
    schema.columns.forEach((target, j) => {
      if (wanted.size === 0 || wanted.has(target.id)) dedupeIndexes.push(targetOffset + j);
    });
    // 指定された列IDがスキーマに1つも無い＝全行が同じ署名になってしまうので、全列に戻す
    if (dedupeIndexes.length === 0) {
      dedupeIndexes = schema.columns.map((_, j) => targetOffset + j);
    }
  }

  /* ---- 4. 行を積む（§8-1 取り込み順 → ファイル内の行順・並べ替えない） ---- */

  const rows: UnifiedRow[] = [];
  const stats: UnifyStats = {
    fileCount: files.length,
    inputRows: 0,
    outputRows: 0,
    droppedDuplicate: 0,
    droppedSubtotal: 0,
    emptyCells: 0,
    mismatchCells: 0,
    needsReview: 0,
    unmappedTargets: [],
    droppedSources,
  };

  const columnStats = new Map<string, ColumnStat>();
  const seen = new Map<string, { fileName: string; line: number }>();
  const subtotalNotes: ToolIssue[] = [];
  const dedupeNotes: ToolIssue[] = [];

  for (const file of files) {
    stats.inputRows += file.rows.length;

    for (const row of file.rows) {
      if (row.suspectSubtotal) {
        if (options.dropSuspectSubtotal) {
          stats.droppedSubtotal += 1;
          subtotalNotes.push({
            line: row.line,
            level: "warn",
            message: `${file.name} の ${row.line}行目を小計・合計行として外しました。`,
          });
          continue;
        }
        subtotalNotes.push({
          line: row.line,
          level: "warn",
          message: `${file.name} の ${row.line}行目は小計・合計行の可能性があります。外すなら「小計らしき行を外す」を入れてください。`,
        });
      }

      // ⚠ 空欄・食い違いの数は「出した行」だけを数える。
      //   重複で外れた行のぶんを混ぜると、画面の件数と出力ファイルが合わなくなる。
      let rowEmpty = 0;
      let rowMismatch = 0;

      const cells: UnifiedCell[] = [];
      if (options.addSourceColumn) {
        cells.push({ text: file.name, num: null, iso: null, mismatch: false });
      }
      if (options.addSourceLineColumn) {
        cells.push({ text: String(row.line), num: row.line, iso: null, mismatch: false });
      }

      for (const target of schema.columns) {
        const assignment = assignmentOf(mapping, file.id, target.id);

        if (assignment.kind === "none") {
          cells.push(emptyCell());
          rowEmpty += 1;
          continue;
        }

        const statKey = `${file.id}\u001f${target.id}`;
        let stat = columnStats.get(statKey);
        if (!stat) {
          stat = {
            fileName: file.name,
            target,
            sourceHeader:
              assignment.kind === "column"
                ? (file.columns[assignment.index]?.header ?? `列 ${assignment.index + 1}`)
                : null,
            nonEmpty: 0,
            readable: 0,
            bad: [],
          };
          columnStats.set(statKey, stat);
        }

        const cell =
          assignment.kind === "const"
            ? constCell(assignment.value, assignment.date, assignment.num, target.kind)
            : convert(row.cells[assignment.index] ?? EMPTY_SOURCE_CELL, target.kind, true);

        if (cell.text !== "") {
          stat.nonEmpty += 1;
          if (cell.mismatch) {
            stat.bad.push({ line: row.line, raw: cell.text });
            rowMismatch += 1;
          } else {
            stat.readable += 1;
          }
        }
        cells.push(cell);
      }

      for (const extra of extras) {
        const index = extra.byFile.get(file.id);
        const cell = index === undefined ? EMPTY_SOURCE_CELL : (row.cells[index] ?? EMPTY_SOURCE_CELL);
        cells.push(convert(cell, extra.kind, false));
      }

      if (options.dedupe) {
        const signature = dedupeIndexes.map((i) => cells[i]?.text ?? "").join(SIGNATURE_SEP);
        const first = seen.get(signature);
        if (first) {
          stats.droppedDuplicate += 1;
          dedupeNotes.push({
            line: row.line,
            level: "warn",
            message: `${file.name} の ${row.line}行目は ${first.fileName} の ${first.line}行目と同じ内容のため外しました。`,
          });
          continue;
        }
        seen.set(signature, { fileName: file.name, line: row.line });
      }

      stats.emptyCells += rowEmpty;
      stats.mismatchCells += rowMismatch;
      rows.push({ cells, fileId: file.id, fileName: file.name, line: row.line });
    }
  }
  stats.outputRows = rows.length;

  /* ---- 5. 対応づかなかったもの（§8-7） --------------------------- */

  const missingByTarget: { target: TargetColumn; fileNames: string[] }[] = [];
  for (const target of schema.columns) {
    const missing: string[] = [];
    for (const file of files) {
      const assignment = assignmentOf(mapping, file.id, target.id);
      if (assignment.kind === "none") missing.push(file.name);
      if (assignment.kind === "column" && isReviewLevel(assignment.level)) stats.needsReview += 1;
    }
    if (files.length > 0 && missing.length === files.length) {
      stats.unmappedTargets.push(target.name);
      if (target.required) {
        issues.push({
          line: 0,
          column: target.name,
          level: "warn",
          message: `《${target.name}》に当たる列が、どのファイルにもありません。列は残して全行を空欄で出します。`,
        });
      }
      continue;
    }
    if (missing.length > 0) missingByTarget.push({ target, fileNames: missing });
  }

  let listed = 0;
  let hidden = 0;
  for (const { target, fileNames } of missingByTarget) {
    for (const fileName of fileNames) {
      if (listed >= MAX_LISTED_ISSUES) {
        hidden += 1;
        continue;
      }
      listed += 1;
      issues.push({
        line: 0,
        column: target.name,
        level: "warn",
        message: `${fileName} には《${target.name}》に当たる列がありません。空欄で出します。`,
      });
    }
  }
  if (hidden > 0) {
    issues.push({
      line: 0,
      level: "warn",
      message: `ほか${hidden}件、対応づけられていない出力列があります。`,
    });
  }

  /* ---- 6. 値の食い違い（§8-2 / §8-5） ---------------------------- */

  for (const stat of columnStats.values()) {
    if (stat.bad.length === 0) continue;
    const label = KIND_LABEL[stat.target.kind];

    // その列がそのファイルで1件も読めない＝行ごとに並べても意味が無いので1件にまとめる
    if (stat.readable === 0) {
      const head = stat.bad[0].raw;
      issues.push({
        line: 0,
        column: stat.target.name,
        level: "warn",
        message:
          stat.sourceHeader === null
            ? `${stat.fileName} の《${stat.target.name}》に入れた固定値「${head}」は${label}として読み取れません。原文のまま出します。`
            : `${stat.fileName} の《${stat.sourceHeader}》は${label}として読み取れませんでした（先頭の値：「${head}」）。原文のまま《${stat.target.name}》へ入れます。出力列の種類を「文字」に変えると警告は消えます。`,
      });
      continue;
    }

    const shown = stat.bad.slice(0, MAX_CELL_ISSUES);
    for (const bad of shown) {
      issues.push({
        line: bad.line,
        column: stat.target.name,
        level: "warn",
        message: `${stat.fileName} の ${bad.line}行目《${stat.target.name}》の「${bad.raw}」は${label}として読み取れません。原文のまま出します。`,
      });
    }
    if (stat.bad.length > shown.length) {
      issues.push({
        line: 0,
        column: stat.target.name,
        level: "warn",
        message: `${stat.fileName} の《${stat.target.name}》には、ほか${stat.bad.length - shown.length}件の読み取れない値があります。`,
      });
    }
  }

  /* ---- 7. 小計行・重複行の指摘（上限つき） ------------------------ */

  for (const notes of [subtotalNotes, dedupeNotes]) {
    for (const note of notes.slice(0, MAX_LISTED_ISSUES)) issues.push(note);
    if (notes.length > MAX_LISTED_ISSUES) {
      issues.push({
        line: 0,
        level: "warn",
        message: `ほか${notes.length - MAX_LISTED_ISSUES}件、同じ指摘があります。`,
      });
    }
  }

  if (files.length === 0) {
    issues.push({ line: 0, level: "error", message: "統合するファイルがありません。" });
  } else if (rows.length === 0) {
    issues.push({ line: 0, level: "error", message: "出力する行がありません。" });
  }

  return { columns, rows, issues, stats };
}
