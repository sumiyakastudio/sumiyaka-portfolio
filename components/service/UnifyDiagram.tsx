"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import InViewGate from "@/components/animation/InViewGate";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./UnifyDiagram.module.css";

/**
 * FIG. 03-A ＝「ばらばらの形式が、1つの管理表にそろう」変換図（2026-09-20・P17-D1）
 *
 * /service の世界観（重＝線と図面）に合わせ、線画（ストローク）だけで描く。
 *   左＝3つの入力（CSV＝カンマ区切りの紙片／Excel＝升目／PDF＝角の折れた頁）
 *   中央＝3本の配線が1つの端子（節点）に集まり、1本になって右へ
 *   右＝列の揃った管理表（見出し行＋5行）
 * 中身は罫と桁の抽象だけ（社名・金額・日付などの読める文字は描かない）。
 *
 * 動き（画面に入ったら1回）：
 *   ①左の3つが順に描かれる（stroke-dashoffset）→ ②配線が左→右へ伸びる →
 *   ③光の点が線の上を走って節点へ集まる → ④節点がともり1本が右へ届く →
 *   ⑤表の行が上から1行ずつ埋まる。総尺 約4.8秒。
 *   以後の常時演出＝光の点が 4.6 秒周期でゆっくり流れ続ける（InViewGate で
 *   画面内だけ running・既定は animation-play-state: paused）。
 *
 * 互換：動かすのは transform(2D)・opacity・stroke-dashoffset のみ。
 *   filter / blend / 3D / SMIL / offset-path は使わない。線は pathLength="100" で
 *   正規化し、太さは vector-effect="non-scaling-stroke" で幅に依らず一定。
 *   JS 無し・prefers-reduced-motion: reduce ＝ 完成形の静止表示（CSS の既定が完成形で、
 *   JS が載った時だけ初期状態 .armed を被せる）。
 */

const ARIA =
  "形の違う3つの入力（A社のCSV、B社のExcel、C社のPDF請求書）が1本にまとまり、御社の管理表の形に揃う図。";

/** アニメーションの開始時刻（秒）を渡す。インライン style は CSS より強いので遅延だけ上書きできる */
const at = (sec: number): CSSProperties => ({ animationDelay: `${sec}s` });

/** 入場の時刻表（秒） */
const T = {
  csvFrame: 0,
  csvRow: 0.28,
  csvStep: 0.07,
  csvTag: 0.2,
  xlsFrame: 0.3,
  xlsGrid: 0.58,
  xlsTick: 0.72,
  xlsTag: 0.5,
  pdfFrame: 0.58,
  pdfLine: 0.88,
  pdfTag: 0.78,
  wire: 1.15,
  spark: 1.75,
  node: 2.85,
  out: 2.98,
  tableName: 3.5,
  table: 3.35,
  tableHead: 3.62,
  row: 3.78,
  rowStep: 0.14,
};

/** 線分の並び（[開始x, 長さ]）を1本のパスへ。カンマ区切りの「桁」を表す */
const seg = (y: number, list: readonly (readonly [number, number])[]) =>
  list.map(([x, w]) => `M${x} ${y} h${w}`).join(" ");

/* ---------- PC（viewBox 1000×440） ---------- */

/** 桁の数も位置もそろっていない＝CSV。右の管理表（列が一定）との対比が図の主題 */
const PC_CSV: readonly { y: number; s: readonly (readonly [number, number])[] }[] = [
  { y: 56, s: [[52, 30], [90, 44], [142, 18], [168, 22], [198, 40]] },
  { y: 70, s: [[52, 48], [108, 16], [132, 52], [192, 46]] },
  { y: 84, s: [[52, 22], [82, 36], [126, 20], [154, 30], [192, 20], [220, 18]] },
  { y: 98, s: [[52, 40], [100, 24], [132, 54], [194, 44]] },
  { y: 112, s: [[52, 18], [78, 30], [116, 24], [148, 38], [194, 44]] },
];

const PC_XLS_TICKS = [
  seg(195, [[48, 26], [90, 18], [132, 26], [174, 14]]),
  seg(211, [[48, 20], [90, 26], [174, 22], [216, 18]]),
  seg(227, [[48, 26], [132, 20], [174, 26]]),
  seg(243, [[48, 16], [90, 24], [132, 26], [216, 22]]),
].join(" ");

const PC_COL_X = [576, 686, 776, 886] as const;
const PC_ROW_Y = [124, 179, 234, 289, 344] as const;
const PC_ROW_W: readonly (readonly number[])[] = [
  [78, 58, 84, 52],
  [70, 58, 76, 52],
  [78, 50, 84, 46],
  [64, 58, 84, 52],
  [78, 58, 70, 52],
];

/** 配線（左→右の向きで描く＝描線も光もこの向きに進む） */
const PC_WIRES = [
  "M254 80 H360 V210 H493",
  "M254 210 H493",
  "M219 365 H430 V210 H493",
] as const;
const PC_OUT = "M507 210 H560";

/* ---------- SP（viewBox 420×560） ---------- */

const SP_CSV: readonly { y: number; s: readonly (readonly [number, number])[] }[] = [
  { y: 42, s: [[22, 26], [56, 14], [78, 20], [106, 14]] },
  { y: 55, s: [[22, 16], [46, 34], [88, 32]] },
  { y: 68, s: [[22, 30], [60, 12], [80, 16], [104, 16]] },
  { y: 81, s: [[22, 14], [44, 22], [74, 18], [100, 20]] },
];

const SP_XLS_TICKS = [
  seg(36, [[157, 16], [187, 14], [217, 16], [247, 12]]),
  seg(52, [[157, 14], [187, 16], [247, 14]]),
  seg(68, [[157, 16], [217, 14], [247, 16]]),
  seg(84, [[157, 12], [187, 16], [217, 16]]),
].join(" ");

const SP_COL_X = [28, 125, 222, 319] as const;
const SP_ROW_Y = [296, 349, 402, 455, 508] as const;
const SP_ROW_W: readonly (readonly number[])[] = [
  [70, 52, 74, 46],
  [62, 52, 68, 46],
  [70, 44, 74, 40],
  [58, 52, 74, 46],
  [70, 52, 62, 46],
];

const SP_WIRES = ["M72 96 V150 H210 V189", "M210 96 V189", "M348 120 V150 H210 V189"] as const;
const SP_OUT = "M210 203 V236";

export default function UnifyDiagram() {
  const ref = useRef<HTMLDivElement>(null);
  // 入場を仕込んでよいか。サーバーと reduced-motion では false＝CSS の既定（＝完成形）のまま静止。
  // effect 内の同期 setState を避けるため、共通フック（useSyncExternalStore）から読む
  const armed = useMotionAllowed();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!armed) return;

    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPlaying(true);
          io.disconnect();
        }
      },
      { threshold: 0.18 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [armed]);

  const stageClass = [styles.stage, armed ? styles.armed : "", playing ? styles.play : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <figure className={styles.fig} data-unify-diagram>
      <figcaption className={styles.head}>
        <span className={styles.figNo} aria-hidden="true">
          FIG. 03-A
        </span>
        <span className={styles.figLabel}>入力の形式を揃える</span>
        <span className={styles.rule} aria-hidden="true" />
      </figcaption>

      <div className={styles.frame}>
        {/* 常時演出（光の点）の器：画面内のあいだだけ running。className は不変にしておく
            （state 由来のクラスを同じ要素に載せると、再レンダーで .live が消える） */}
        <InViewGate className={styles.gate} activeClassName={styles.live} threshold={0.1}>
          <div ref={ref} className={stageClass}>
            {/* ===== PC ===== */}
            <svg
              className={styles.svgPc}
              viewBox="0 0 1000 440"
              role="img"
              aria-label={ARIA}
              preserveAspectRatio="xMidYMid meet"
            >
              {/* 四隅のトンボ */}
              <path
                className={styles.trim}
                d="M8 14 H20 M14 8 V20 M980 14 H992 M986 8 V20 M8 426 H20 M14 420 V432 M980 426 H992 M986 420 V432"
                aria-hidden="true"
              />

              {/* --- 入力 01：CSV（カンマ区切りの紙片） --- */}
              <text className={styles.tag} x={40} y={32} style={at(T.csvTag)}>
                CSV
              </text>
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.csvFrame)}
                d="M40 40 H250 V120 H40 Z"
              />
              {PC_CSV.map((r, i) => (
                <path
                  key={r.y}
                  className={`${styles.d} ${styles.dFast} ${styles.data}`}
                  pathLength={100}
                  style={at(T.csvRow + i * T.csvStep)}
                  d={seg(r.y, r.s)}
                />
              ))}

              {/* --- 入力 02：Excel（升目） --- */}
              <text className={styles.tag} x={40} y={162} style={at(T.xlsTag)}>
                Excel
              </text>
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.xlsFrame)}
                d="M40 170 H250 V250 H40 Z"
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.xlsGrid)}
                d="M82 170 V250 M124 170 V250 M166 170 V250 M208 170 V250 M40 186 H250 M40 202 H250 M40 218 H250 M40 234 H250"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.xlsTick)}
                d={seg(179, [[48, 22], [90, 26], [132, 20], [174, 26], [216, 20]])}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.xlsTick + 0.1)}
                d={PC_XLS_TICKS}
              />

              {/* --- 入力 03：PDF（角の折れた頁） --- */}
              <text className={styles.tag} x={75} y={292} style={at(T.pdfTag)}>
                PDF
              </text>
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.pdfFrame)}
                d="M75 300 H193 L215 322 V430 H75 Z"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.pdfFrame + 0.3)}
                d="M193 300 V322 H215"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.pdfLine)}
                d="M91 342 h78"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.pdfLine + 0.12)}
                d={"M91 360 h108 M91 374 h108 M91 388 h86 M91 402 h108 M91 416 h64"}
              />

              {/* --- 配線：3本が節点へ集まり、1本になって右へ --- */}
              <g aria-hidden="true">
                {PC_WIRES.map((d, i) => (
                  <path
                    key={d}
                    className={`${styles.d} ${styles.dSlow} ${styles.wire}`}
                    pathLength={100}
                    style={at(T.wire + i * 0.08)}
                    d={d}
                  />
                ))}
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.wire}`}
                  pathLength={100}
                  style={at(T.out)}
                  d={PC_OUT}
                />
                {/* 端子（配線の根本） */}
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire)} cx={254} cy={80} r={3} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.08)} cx={254} cy={210} r={3} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.16)} cx={219} cy={365} r={3} />

                {/* 光の点＝同じ線に重ねた短いダッシュを流す */}
                {PC_WIRES.map((d) => (
                  <path key={`s${d}`} className={`${styles.spark} ${styles.sparkIn}`} pathLength={100} style={at(T.spark)} d={d} />
                ))}
                <path className={`${styles.spark} ${styles.sparkOut}`} pathLength={100} style={at(T.spark)} d={PC_OUT} />

                {/* 節点 */}
                <g transform="translate(500 210)">
                  <circle className={`${styles.ring} ${styles.ring1}`} style={at(T.spark)} cx={0} cy={0} r={14} />
                  <circle className={`${styles.ring} ${styles.ring2}`} style={at(T.spark)} cx={0} cy={0} r={21} />
                  <path
                    className={`${styles.d} ${styles.dFast} ${styles.node}`}
                    pathLength={100}
                    style={at(T.node)}
                    d="M0 -9 L9 0 L0 9 L-9 0 Z"
                  />
                  <circle className={`${styles.fade} ${styles.dot}`} style={at(T.node + 0.18)} cx={0} cy={0} r={2.6} />
                </g>
              </g>

              {/* --- 出力：1つの管理表 --- */}
              <text className={`${styles.name} ${styles.fade}`} x={560} y={40} style={at(T.tableName)}>
                御社の管理表
              </text>
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.table)}
                d="M560 52 H960 V372 H560 Z"
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.table + 0.16)}
                d="M670 52 V372 M760 52 V372 M870 52 V372 M560 152 H960 M560 207 H960 M560 262 H960 M560 317 H960"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.headRule}`}
                pathLength={100}
                style={at(T.table + 0.26)}
                d="M560 97 H960"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.tableHead)}
                d={seg(79, [[576, 62], [686, 44], [776, 62], [886, 44]])}
              />
              {PC_ROW_Y.map((y, i) => (
                <g key={y} className={styles.row} style={at(T.row + i * T.rowStep)}>
                  <path className={styles.cell} d={seg(y, PC_COL_X.map((x, c) => [x, PC_ROW_W[i][c]] as const))} />
                </g>
              ))}
            </svg>

            {/* ===== SP ===== */}
            <svg
              className={styles.svgSp}
              viewBox="0 0 420 560"
              role="img"
              aria-label={ARIA}
              preserveAspectRatio="xMidYMid meet"
            >
              <path
                className={styles.trim}
                d="M2 7 H12 M7 2 V12 M408 7 H418 M413 2 V12 M2 553 H12 M7 548 V558 M408 553 H418 M413 548 V558"
                aria-hidden="true"
              />

              {/* --- 入力 01：CSV --- */}
              <text className={styles.tag} x={12} y={20} style={at(T.csvTag)}>
                CSV
              </text>
              <path className={`${styles.d} ${styles.paper}`} pathLength={100} style={at(T.csvFrame)} d="M12 28 H132 V92 H12 Z" />
              {SP_CSV.map((r, i) => (
                <path
                  key={r.y}
                  className={`${styles.d} ${styles.dFast} ${styles.data}`}
                  pathLength={100}
                  style={at(T.csvRow + i * T.csvStep)}
                  d={seg(r.y, r.s)}
                />
              ))}

              {/* --- 入力 02：Excel --- */}
              <text className={styles.tag} x={152} y={20} style={at(T.xlsTag)}>
                Excel
              </text>
              <path className={`${styles.d} ${styles.paper}`} pathLength={100} style={at(T.xlsFrame)} d="M150 28 H270 V92 H150 Z" />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.xlsGrid)}
                d="M180 28 V92 M210 28 V92 M240 28 V92 M150 44 H270 M150 60 H270 M150 76 H270"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.xlsTick)}
                d={SP_XLS_TICKS}
              />

              {/* --- 入力 03：PDF --- */}
              <text className={styles.tag} x={290} y={20} style={at(T.pdfTag)}>
                PDF
              </text>
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.pdfFrame)}
                d="M288 28 H392 L408 44 V116 H288 Z"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.pdfFrame + 0.3)}
                d="M392 28 V44 H408"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.pdfLine)}
                d="M298 60 h56"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.pdfLine + 0.12)}
                d="M298 74 h92 M298 86 h92 M298 98 h70"
              />

              {/* --- 配線 --- */}
              <g aria-hidden="true">
                {SP_WIRES.map((d, i) => (
                  <path
                    key={d}
                    className={`${styles.d} ${styles.dSlow} ${styles.wire}`}
                    pathLength={100}
                    style={at(T.wire + i * 0.08)}
                    d={d}
                  />
                ))}
                <path className={`${styles.d} ${styles.dFast} ${styles.wire}`} pathLength={100} style={at(T.out)} d={SP_OUT} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire)} cx={72} cy={96} r={3} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.08)} cx={210} cy={96} r={3} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.16)} cx={348} cy={120} r={3} />

                {SP_WIRES.map((d) => (
                  <path key={`s${d}`} className={`${styles.spark} ${styles.sparkIn}`} pathLength={100} style={at(T.spark)} d={d} />
                ))}
                <path className={`${styles.spark} ${styles.sparkOut}`} pathLength={100} style={at(T.spark)} d={SP_OUT} />

                <g transform="translate(210 196)">
                  <circle className={`${styles.ring} ${styles.ring1}`} style={at(T.spark)} cx={0} cy={0} r={13} />
                  <circle className={`${styles.ring} ${styles.ring2}`} style={at(T.spark)} cx={0} cy={0} r={19} />
                  <path
                    className={`${styles.d} ${styles.dFast} ${styles.node}`}
                    pathLength={100}
                    style={at(T.node)}
                    d="M0 -8 L8 0 L0 8 L-8 0 Z"
                  />
                  <circle className={`${styles.fade} ${styles.dot}`} style={at(T.node + 0.18)} cx={0} cy={0} r={2.4} />
                </g>
              </g>

              {/* --- 出力：1つの管理表 --- */}
              <text className={`${styles.name} ${styles.fade}`} x={16} y={228} style={at(T.tableName)}>
                御社の管理表
              </text>
              <path className={`${styles.d} ${styles.paper}`} pathLength={100} style={at(T.table)} d="M16 236 H404 V535 H16 Z" />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.table + 0.16)}
                d="M113 236 V535 M210 236 V535 M307 236 V535 M16 323 H404 M16 376 H404 M16 429 H404 M16 482 H404"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.headRule}`}
                pathLength={100}
                style={at(T.table + 0.26)}
                d="M16 270 H404"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.tableHead)}
                d={seg(255, [[28, 56], [125, 42], [222, 56], [319, 42]])}
              />
              {SP_ROW_Y.map((y, i) => (
                <g key={y} className={styles.row} style={at(T.row + i * T.rowStep)}>
                  <path className={styles.cell} d={seg(y, SP_COL_X.map((x, c) => [x, SP_ROW_W[i][c]] as const))} />
                </g>
              ))}
            </svg>
          </div>
        </InViewGate>
      </div>
    </figure>
  );
}
