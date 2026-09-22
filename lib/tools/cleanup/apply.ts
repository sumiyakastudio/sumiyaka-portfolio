/**
 * 名簿クレンジングツール（T-05） — 規則の適用・差分・全体の入口
 *
 * ⚠ この層は一切ネットワークへ出ない（共通仕様 §3-1）。fetch / "use server" を書かない。
 *
 * ⚠⚠ **`role: "skip"` の列は1バイトも変えない。**
 *     変化の無いセルは**元の文字列と同一の参照**を返す（=== で比較できる）。
 *     利用者は「このツールは私の名簿に何をしたのか」を1つずつ言えなければならない（計画書 §8-1）。
 *
 * ⚠ 元の値は消さない（§15-2）。`CellChange` に before / after / 効いた規則を1件ずつ残し、
 *   修正レポートとして書き出せるようにする。
 */

import { diffSpan } from "./normalize";
import { ALL_ON, RULES, applyRulesTo } from "./rules";
import { diagnose } from "./diagnose";
import { findDuplicates, keyColumnsFor } from "./dedupe";
import {
  MAX_GROUP_ROWS,
  type CellChange,
  type CleanResult,
  type ColumnSpec,
  type DedupeOptions,
  type NameRow,
  type ParseResult,
  type RuleOptions,
  type RuleSwitches,
} from "./types";

export interface ApplyResult {
  /** 修正後の行。cells の長さ・並びは ParseResult.rows と完全に一致する */
  rows: NameRow[];
  changes: CellChange[];
  /** 修正が入った行の表示上の行番号（昇順・重複なし） */
  changedRows: number[];
}

/**
 * 規則を当てて、変わったセルを1件ずつ記録する。
 *
 * @param parsed   読み取り結果（**原文のまま**の行）
 * @param columns  列の役割（利用者がプルダウンで変えた後の状態を渡す）
 * @param switches 規則の ON/OFF
 * @param options  規則の向き（波ダッシュの寄せ先など）
 */
export function applyToRows(
  parsed: ParseResult,
  columns: readonly ColumnSpec[],
  switches: RuleSwitches,
  options?: RuleOptions,
): ApplyResult {
  const rows: NameRow[] = [];
  const changes: CellChange[] = [];
  const changedRows: number[] = [];

  for (let r = 0; r < parsed.rows.length; r++) {
    const source = parsed.rows[r];
    // 参照ごと複製する。変わらなかったセルは**同じ文字列の参照**がそのまま入る
    const cells = source.cells.slice();
    let touched = false;

    for (let c = 0; c < columns.length; c++) {
      const spec = columns[c];
      // ★ skip の列は読むだけ。1バイトも変えない
      if (spec.role === "skip") continue;

      const before = cells[c];
      if (typeof before !== "string" || before === "") continue;

      const app = applyRulesTo(before, spec.role, switches, options);
      if (app.value === before) continue; // 規則の契約1（変化しなければ同一の参照）

      cells[c] = app.value;
      if (!touched) {
        touched = true;
        changedRows.push(r + 1);
      }
      changes.push({
        row: r + 1,
        sourceLine: source.sourceLine,
        col: spec.index,
        header: spec.header,
        before,
        after: app.value,
        // 効いた規則を**適用順**に（複数の規則が重なることがある）
        ruleIds: app.hits.map((h) => h.ruleId),
        span: diffSpan(before, app.value),
      });
    }

    rows.push({ cells, sourceLine: source.sourceLine });
  }

  return { rows, changes, changedRows };
}

/** 全18規則が ON かどうか（ON なら全規則版の再計算を省ける） */
function isAllOn(switches: RuleSwitches): boolean {
  for (const rule of RULES) if (!switches[rule.id]) return false;
  return true;
}

/**
 * 診断・適用・重複検出を束ねる。**UI はこれ1本を呼ぶ。**
 *
 * ⚠ 重複検出に渡す `fullyCleaned` は「**全規則 ON**（ALL_ON）で適用した行」であり、
 *   現在のスイッチの結果ではない。規則の ON/OFF で重複の判定が揺れると、
 *   利用者が「なぜ同じと判定されたのか」を説明できなくなるため（計画書 §9-2 の1番）。
 */
export function runCleanup(
  parsed: ParseResult,
  columns: readonly ColumnSpec[],
  switches: RuleSwitches,
  dedupe: DedupeOptions,
  options?: RuleOptions,
): CleanResult {
  const { findings, notices } = diagnose(parsed, columns, options);
  const applied = applyToRows(parsed, columns, switches, options);

  const messages: string[] = [];
  let duplicates: CleanResult["duplicates"] = [];

  if (dedupe.enabled) {
    if (keyColumnsFor(columns, dedupe.keyRoles).length === 0) {
      messages.push(
        "重複の照合に使える列がありません。列の役割で「会社名」や「氏名」を指定してください。",
      );
    }
    // 全規則 ON のときは applyToRows の結果をそのまま使い回す（5,000行×18規則を2度走らせない）
    const fully = isAllOn(switches) ? applied.rows : applyToRows(parsed, columns, ALL_ON, options).rows;
    duplicates = findDuplicates({
      original: parsed.rows,
      fullyCleaned: fully,
      columns,
      options: dedupe,
    });

    // 1グループが上限に達した＝突合キーの選び方が悪いサイン
    if (duplicates.some((g) => g.rows.length >= MAX_GROUP_ROWS)) {
      messages.push(
        `${MAX_GROUP_ROWS}行以上が同じキーです。照合に使う列を増やしてください。` +
          `（一つのグループには${MAX_GROUP_ROWS}行までを表示しています）`,
      );
    }
  }

  return {
    rows: applied.rows,
    changes: applied.changes,
    findings,
    notices,
    duplicates,
    changedRows: applied.changedRows,
    messages,
  };
}
