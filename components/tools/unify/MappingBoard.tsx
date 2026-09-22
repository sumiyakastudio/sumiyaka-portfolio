"use client";

/**
 * 列マッピング統合ツール（T-04） — マッピング盤（★このツールの主役の絵）
 *
 * 左＝取り込んだファイルの列／中央＝線／右＝出力したい管理表の列。
 *
 * ■ 線の描き方（計画書 §10-2）
 *   中央レーンに inline SVG を1枚だけ置き、**行の index から座標を計算する**。
 *   y = index * ROW_H + ROW_H / 2。
 *   ⚠ getBoundingClientRect で測らない（スクロールでズレる・iOS のバウンスで暴れる）。
 *   ⚠ 左右のリストを別々にスクロールさせない（y = index × rowH が成立しなくなる）。
 *   ⚠ viewBox を付けない（拡縮事故を避ける）。
 *   ⚠ 使ってよい表現は stroke / stroke-width / stroke-dasharray / opacity だけ。
 *      filter・mix-blend-mode・3D transform は使わない（共通仕様 §3-6）。
 *
 *   ★ ROW_H は MappingBoard.module.css の `--rowH` と、LANE_W は `--laneW` と
 *     必ず同じ値にすること。ここがズレると線が行の中心から外れる。
 *
 * ■ 操作（計画書 §10-3）
 *   ドラッグは使わない。2クリック方式（右の出力列 → 左の入力列）。
 *   各出力列の <select> が、キーボードとスクリーンリーダーの逃げ道。
 *
 * ■ 状態の持ち方
 *   盤が持つのは「いま選択中の出力列」「固定値の入力中テキスト」と、
 *   線の強調のためだけの「ホバー／フォーカス中の出力列」だけ。
 *   **マッピング表そのものは親（TableUnifyTool）が持つ。**
 *
 * ■ 親へのお願い
 *   ファイルタブを切り替えるときは <MappingBoard key={file.id} ... /> と書くこと。
 *   盤の選択状態と固定値の入力欄が、切り替えの瞬間に確実に初期化される。
 */

import { useCallback, useMemo, useState } from "react";

import type { Assignment, ColumnKind, SourceColumn, TargetColumn } from "@/lib/tools/unify/types";
import { NO_ASSIGNMENT, isReviewLevel } from "@/lib/tools/unify/types";

import type { MappingBoardProps } from "./boardTypes";
import styles from "./MappingBoard.module.css";

/** 1行の高さ（px）。★ MappingBoard.module.css の --rowH と同じ値にする */
const ROW_H = 40;
/** 中央レーンの幅（px）。★ MappingBoard.module.css の --laneW と同じ値にする */
const LANE_W = 120;
/** ベジェ曲線の制御点の x（レーン幅の中央） */
const CURVE_X = LANE_W / 2;

/** <option> の予約値。列番号は数字になるので衝突しない */
const OPT_NONE = "none";
const OPT_CONST = "const";

const KIND_LABEL: Record<ColumnKind, string> = {
  text: "文字",
  number: "数値",
  date: "日付",
};

/**
 * 左の入力列を押したときにどうするか（2クリック方式の判定・純粋）。
 *
 * ⚠ 同じ入力列を2つの出力列へ割り当てさせない。ここが唯一の判断場所。
 * 検証から呼べるように名前付きで公開している（既定エクスポートは盤本体）。
 */
export type SourceClickAction =
  | { act: "none" }
  | { act: "select"; targetId: string }
  | { act: "clear"; targetId: string }
  | { act: "assign"; targetId: string; index: number };

export function decideSourceClick(
  /** いま選択中の出力列ID（未選択なら null） */
  selectedId: string | null,
  /** その入力列をすでに使っている出力列ID（誰も使っていなければ undefined） */
  ownerId: string | undefined,
  /** 押された入力列の列番号 */
  index: number,
): SourceClickAction {
  if (selectedId === null) {
    // 未選択のときは、その入力列を使っている出力列を選ぶだけ（組を見せる）
    return ownerId === undefined ? { act: "none" } : { act: "select", targetId: ownerId };
  }
  // 同じ組をもう一度＝解除
  if (ownerId === selectedId) return { act: "clear", targetId: selectedId };
  // ほかの出力列がすでに使っている入力列は割り当てない
  if (ownerId !== undefined) return { act: "none" };
  return { act: "assign", targetId: selectedId, index };
}

/** 画面に出す入力列の名前。同名の見出しがある列は「金額 (2)」のように枝番を足す */
function buildSourceLabels(columns: readonly SourceColumn[]): string[] {
  const seen = new Map<string, number>();
  return columns.map((col) => {
    const n = (seen.get(col.header) ?? 0) + 1;
    seen.set(col.header, n);
    return col.duplicate ? `${col.header} (${n})` : col.header;
  });
}

export default function MappingBoard({
  file,
  schema,
  assignments,
  ambiguous,
  onAssignColumn,
  onClear,
  onAssignConst,
}: MappingBoardProps) {
  /** いま選択中の出力列ID（2クリック方式の1手目） */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 固定値の入力中テキスト。null＝入力欄を開いていない（開く先は selectedId の行） */
  const [constDraft, setConstDraft] = useState<string | null>(null);
  /** 線を強調する出力列ID（ホバー／フォーカス）。見た目だけの状態 */
  const [activeId, setActiveId] = useState<string | null>(null);

  const sourceColumns = file.columns;
  const targetColumns = schema.columns;

  const sourceLabels = useMemo(() => buildSourceLabels(sourceColumns), [sourceColumns]);

  /** 入力列 index → その列を使っている出力列。同じ入力列を2つに割り当てさせないための表 */
  const usedBy = useMemo(() => {
    const map = new Map<number, TargetColumn>();
    for (const target of targetColumns) {
      const assignment = assignments[target.id];
      if (assignment && assignment.kind === "column") {
        map.set(assignment.index, target);
      }
    }
    return map;
  }, [assignments, targetColumns]);

  const rowCount = Math.max(sourceColumns.length, targetColumns.length, 1);

  /** 引く線。★ index から座標を計算する（測らない） */
  const lines = useMemo(() => {
    const out: { id: string; d: string; review: boolean }[] = [];
    targetColumns.forEach((target, targetRow) => {
      const assignment = assignments[target.id];
      if (!assignment || assignment.kind !== "column") return;
      const sourceRow = sourceColumns.findIndex((col) => col.index === assignment.index);
      if (sourceRow < 0) return;
      const y1 = sourceRow * ROW_H + ROW_H / 2;
      const y2 = targetRow * ROW_H + ROW_H / 2;
      out.push({
        id: target.id,
        d: `M 0,${y1} C ${CURVE_X},${y1} ${CURVE_X},${y2} ${LANE_W},${y2}`,
        review: isReviewLevel(assignment.level),
      });
    });
    return out;
  }, [assignments, sourceColumns, targetColumns]);

  /** 強調中の線があるときだけ、ほかの線を薄くする */
  const emphasisId = activeId ?? selectedId;
  const dimOthers = emphasisId !== null && lines.some((line) => line.id === emphasisId);

  const assignmentOfTarget = (targetId: string): Assignment =>
    assignments[targetId] ?? NO_ASSIGNMENT;

  const focusConstInput = useCallback((el: HTMLInputElement | null) => {
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  /* -------------------- 操作 -------------------- */

  const handleTargetClick = (target: TargetColumn) => {
    setConstDraft(null);
    setSelectedId((prev) => (prev === target.id ? null : target.id));
  };

  const handleSourceClick = (col: SourceColumn) => {
    const action = decideSourceClick(selectedId, usedBy.get(col.index)?.id, col.index);
    if (action.act === "none") return;
    if (action.act === "select") {
      setConstDraft(null);
      setSelectedId(action.targetId);
      return;
    }
    setConstDraft(null);
    setSelectedId(null);
    if (action.act === "clear") onClear(action.targetId);
    else onAssignColumn(action.targetId, action.index);
  };

  const handleSelectChange = (target: TargetColumn, value: string) => {
    if (value === OPT_NONE) {
      setConstDraft(null);
      setSelectedId((prev) => (prev === target.id ? null : prev));
      onClear(target.id);
      return;
    }
    if (value === OPT_CONST) {
      const current = assignmentOfTarget(target.id);
      setSelectedId(target.id);
      setConstDraft(current.kind === "const" ? current.value : "");
      return;
    }
    const index = Number(value);
    if (!Number.isFinite(index)) return;
    setConstDraft(null);
    setSelectedId(null);
    onAssignColumn(target.id, index);
  };

  const commitConst = (target: TargetColumn) => {
    const value = constDraft ?? "";
    setConstDraft(null);
    if (value.trim() === "") {
      onClear(target.id);
      return;
    }
    // ⚠ 盤は文字列を渡すところまで。date / num の解釈は親（parse.ts）が行う
    onAssignConst(target.id, value);
  };

  /* -------------------- 表示用の小道具 -------------------- */

  const sourceLabelOf = (index: number): string => {
    const row = sourceColumns.findIndex((col) => col.index === index);
    return row < 0 ? `列${index + 1}` : (sourceLabels[row] ?? `列${index + 1}`);
  };

  const sampleOf = (index: number): string => {
    const col = sourceColumns.find((item) => item.index === index);
    return col?.samples[0] ?? "";
  };

  const summaryOf = (assignment: Assignment): string => {
    if (assignment.kind === "column") return sourceLabelOf(assignment.index);
    if (assignment.kind === "const") {
      return assignment.value === "" ? "固定値（空）" : `固定値：${assignment.value}`;
    }
    return "";
  };

  const selectValueOf = (assignment: Assignment): string => {
    if (assignment.kind === "column") return String(assignment.index);
    if (assignment.kind === "const") return OPT_CONST;
    return OPT_NONE;
  };

  /** 候補が複数あって自動では割り当てなかった出力列（未割当のものだけ知らせる） */
  const ambiguousNotes = targetColumns
    .map((target) => ({ target, candidates: ambiguous[target.id] ?? [] }))
    .filter(
      (item) => item.candidates.length > 0 && assignmentOfTarget(item.target.id).kind === "none",
    );

  const boardClass = selectedId ? `${styles.board} ${styles.boardPicking}` : styles.board;

  return (
    <div className={boardClass}>
      <div className={styles.grid}>
        {/* ---- 見出し ---- */}
        <div className={styles.headSources}>
          <span className={styles.headTitle}>このファイルの列</span>
          <span className={styles.headSub}>
            {file.name}
            {file.sheetName ? `／${file.sheetName}` : ""}・{sourceColumns.length}列
          </span>
        </div>
        <div className={styles.headLane} aria-hidden="true">
          <span className={styles.headLaneLabel}>線</span>
        </div>
        <div className={styles.headTargets}>
          <span className={styles.headTitle}>出力する管理表の列</span>
          <span className={styles.headSub}>
            {schema.name}・{targetColumns.length}列
          </span>
        </div>

        {/* ---- 左：取り込んだファイルの列 ---- */}
        <div className={styles.sources}>
          {sourceColumns.length === 0 ? (
            <p className={styles.empty}>読み取れた列がありません</p>
          ) : (
            sourceColumns.map((col, row) => {
              const owner = usedBy.get(col.index);
              const isOwnedBySelected = owner !== undefined && owner.id === selectedId;
              const blocked = selectedId !== null && owner !== undefined && !isOwnedBySelected;
              const highlighted = owner !== undefined && owner.id === emphasisId;

              const classNames = [styles.sourceRow];
              if (owner) classNames.push(styles.sourceUsed);
              if (blocked) classNames.push(styles.sourceBlocked);
              if (highlighted) classNames.push(styles.sourceHighlight);

              return (
                <button
                  key={col.index}
                  type="button"
                  className={classNames.join(" ")}
                  onClick={() => handleSourceClick(col)}
                  onPointerEnter={() => setActiveId(owner ? owner.id : null)}
                  onPointerLeave={() => setActiveId(null)}
                  onFocus={() => setActiveId(owner ? owner.id : null)}
                  onBlur={() => setActiveId(null)}
                  disabled={blocked}
                  title={
                    owner
                      ? `${owner.name} に割り当て済み`
                      : selectedId
                        ? "この列を割り当てます"
                        : "右の「出力する管理表の列」を選んでから押します"
                  }
                >
                  <span className={styles.sourceName}>{sourceLabels[row] ?? col.header}</span>
                  <span className={styles.sourceSample}>{col.samples[0] ?? ""}</span>
                  {owner ? <span className={styles.sourceUsedMark}>使用中</span> : null}
                </button>
              );
            })
          )}
        </div>

        {/* ---- 中央：線（inline SVG 1枚だけ） ---- */}
        <div className={styles.lane} style={{ minHeight: rowCount * ROW_H }} aria-hidden="true">
          <svg
            className={dimOthers ? `${styles.laneSvg} ${styles.laneDim}` : styles.laneSvg}
            width={LANE_W}
            height={rowCount * ROW_H}
          >
            {lines.map((line) => {
              const classNames = [styles.line];
              if (line.review) classNames.push(styles.lineReview);
              if (line.id === emphasisId) classNames.push(styles.lineActive);
              return <path key={line.id} className={classNames.join(" ")} d={line.d} fill="none" />;
            })}
          </svg>
        </div>

        {/* ---- 右：出力する管理表の列 ---- */}
        <div className={styles.targets}>
          {targetColumns.length === 0 ? (
            <p className={styles.empty}>出力する列がありません</p>
          ) : (
            targetColumns.map((target) => {
              const assignment = assignmentOfTarget(target.id);
              const selected = selectedId === target.id;
              const editing = selected && constDraft !== null;
              const review = assignment.kind === "column" && isReviewLevel(assignment.level);
              const candidates = ambiguous[target.id] ?? [];
              const needsPick = candidates.length > 0 && assignment.kind === "none";
              const missing = target.required && assignment.kind === "none";

              const rowClasses = [styles.targetRow];
              if (selected) rowClasses.push(styles.targetRowSelected);
              if (target.id === emphasisId) rowClasses.push(styles.targetRowActive);

              const selectClasses = [styles.select];
              if (needsPick) selectClasses.push(styles.selectWarn);

              return (
                <div
                  key={target.id}
                  className={rowClasses.join(" ")}
                  onPointerEnter={() => setActiveId(target.id)}
                  onPointerLeave={() => setActiveId(null)}
                  onFocus={() => setActiveId(target.id)}
                  onBlur={() => setActiveId(null)}
                >
                  <button
                    type="button"
                    className={styles.targetPick}
                    onClick={() => handleTargetClick(target)}
                    aria-pressed={selected}
                    title={
                      selected
                        ? "左の「このファイルの列」を押すと線がつながります（もう一度押すと外れます）"
                        : "この出力列を選びます"
                    }
                  >
                    <span className={styles.targetName}>{target.name}</span>
                    <span className={styles.targetKind}>{KIND_LABEL[target.kind]}</span>
                    {target.required ? <span className={styles.targetRequired}>必須</span> : null}
                    {review ? <span className={styles.markReview}>要確認</span> : null}
                    {needsPick ? (
                      <span className={styles.markPick}>候補{candidates.length}</span>
                    ) : null}
                    {missing && !needsPick ? <span className={styles.markEmpty}>空欄</span> : null}
                  </button>

                  {editing ? (
                    <span className={styles.constEdit}>
                      <input
                        ref={focusConstInput}
                        className={styles.constInput}
                        type="text"
                        value={constDraft ?? ""}
                        placeholder="全行に入れる値"
                        aria-label={`${target.name} に入れる固定値`}
                        onChange={(event) => setConstDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitConst(target);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            setConstDraft(null);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className={styles.miniButton}
                        onClick={() => commitConst(target)}
                      >
                        決定
                      </button>
                      <button
                        type="button"
                        className={styles.miniButton}
                        onClick={() => setConstDraft(null)}
                      >
                        やめる
                      </button>
                    </span>
                  ) : (
                    <select
                      className={selectClasses.join(" ")}
                      value={selectValueOf(assignment)}
                      aria-label={`${target.name} に割り当てる入力列`}
                      onChange={(event) => handleSelectChange(target, event.target.value)}
                    >
                      <option value={OPT_NONE}>— 割り当てない</option>
                      {sourceColumns.map((col, row) => {
                        const owner = usedBy.get(col.index);
                        return (
                          <option
                            key={col.index}
                            value={String(col.index)}
                            disabled={owner !== undefined && owner.id !== target.id}
                          >
                            {sourceLabels[row] ?? col.header}
                          </option>
                        );
                      })}
                      <option value={OPT_CONST}>
                        {assignment.kind === "const"
                          ? `固定値：${assignment.value === "" ? "（空）" : assignment.value}`
                          : "固定値を入れる…"}
                      </option>
                    </select>
                  )}

                  {/* SPのカードでだけ出す、割り当てた入力列の実データ1件 */}
                  <span className={styles.spSample}>
                    {assignment.kind === "column"
                      ? sampleOf(assignment.index) || "（この列は空欄です）"
                      : assignment.kind === "const"
                        ? summaryOf(assignment)
                        : "未割り当て（出力では空欄になります）"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {ambiguousNotes.length > 0 ? (
        <ul className={styles.notes}>
          {ambiguousNotes.map(({ target, candidates }) => (
            <li key={target.id}>
              <span className={styles.noteTag}>候補</span>
              <span>
                {target.name}：候補が{candidates.length}件あります（
                {candidates.join("・")}）。どれを使うかを選んでください。
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className={styles.hint}>
        ① 右の「出力する管理表の列」を押す → ②
        左の「このファイルの列」を押すと線がつながります。同じ組をもう一度押すと外れます。
        右のセレクトからでも同じ操作ができます。
      </p>
    </div>
  );
}
