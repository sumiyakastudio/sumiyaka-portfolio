"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import InViewGate from "@/components/animation/InViewGate";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./InsideDiagram.module.css";

/**
 * FIG. 08-A ＝「データは、御社のパソコンの中だけ」境界図（2026-09-22・図解の憲法 §8-C）
 *
 * /service の世界観（重＝線と図面）に合わせ、線画（ストローク）だけで描く。
 * 同じページの FIG. 03-A（UnifyDiagram）と同じ作法＝図題・枠・トンボ・色変数・時刻表・
 * armed/play・InViewGate の .live・reduced-motion。
 *
 *   外側＝角丸の枠「御社のパソコン」
 *   その中＝「ブラウザ」の窓（上辺に細い帯＋小さな丸3つ）
 *   窓の中＝CSV／Excel／PDF の小さな紙片 → 配線 → 節点 → 小さな「管理表」（FIG. 03-A の縮小版）
 *   パソコンの右（SP は下）＝境界の破線。その向こうは空で mono「外」
 *
 * 動き（画面に入ったら1回・総尺 約4.7秒）：
 *   ①パソコンの枠 → ②ブラウザの窓と帯 → ③紙片（CSV/Excel/PDF）→ ④配線 → ⑤節点 →
 *   ⑥管理表の行が埋まる → ⑦境界の破線が引かれる → ⑧「外」
 *   以後の常時演出＝5秒周期。前半で紙片→節点→管理表へ光の点が流れ、続けて管理表から境界へ
 *   向かう点が**パソコンの枠の内側で止まり**、枠の縁に短い光が 0.4 秒ともって消える（＝出ない）。
 *   動くのは周期の約 1/3（残りは休む）。InViewGate で画面内かつ前面タブのときだけ running。
 *
 * 互換：動かすのは transform(2D)・opacity・stroke-dashoffset のみ。
 *   filter / blend / 3D / SMIL / offset-path は使わない。線は pathLength="100" で正規化し、
 *   太さは vector-effect="non-scaling-stroke" で幅に依らず一定（1px と 2px の二段だけ）。
 *   JS 無し・prefers-reduced-motion: reduce ＝ 完成形の静止表示。
 */

const ARIA =
  "御社のパソコンの中のブラウザだけで、CSV・Excel・PDF が1つの管理表にまとまる図。管理表から外へ向かった光は、パソコンの枠の内側で止まり、境界の外へは出ない。";

/** アニメーションの開始時刻（秒）を渡す。インライン style は CSS より強いので遅延だけ上書きできる */
const at = (sec: number): CSSProperties => ({ animationDelay: `${sec}s` });

/** 常時演出の周期（秒）。境界へ向かう組は 1 周期ぶん遅らせる＝位相は同じで、初回だけ描き終わりを待つ */
const CYCLE = 5;

/** 入場の時刻表（秒） */
const T = {
  caseFrame: 0,
  caseLabel: 0.12,
  win: 0.42,
  band: 0.72,
  chip: 0.9,
  winTag: 0.95,
  csvTag: 1.0,
  csvFrame: 1.05,
  csvRow: 1.25,
  csvStep: 0.06,
  xlsTag: 1.15,
  xlsFrame: 1.2,
  xlsGrid: 1.4,
  xlsTick: 1.55,
  pdfTag: 1.3,
  pdfFrame: 1.35,
  pdfLine: 1.65,
  wire: 1.9,
  spark: 2.45,
  node: 2.6,
  out: 2.72,
  table: 3.05,
  tableName: 3.1,
  tableHead: 3.3,
  row: 3.45,
  rowStep: 0.13,
  esc: 4.15,
  border: 3.95,
  outTag: 4.3,
};

/** 線分の並び（[開始x, 長さ]）を1本のパスへ。桁の抽象を表す */
const seg = (y: number, list: readonly (readonly [number, number])[]) =>
  list.map(([x, w]) => `M${x} ${y} h${w}`).join(" ");

/** 破線の境界＝dasharray は描線アニメに使うので、短い線分の並びとして持つ */
const dashV = (x: number, from: number, to: number, dash = 14, gap = 10) => {
  const out: string[] = [];
  for (let y = from; y + dash <= to; y += dash + gap) out.push(`M${x} ${y} V${y + dash}`);
  return out.join(" ");
};

const dashH = (y: number, from: number, to: number, dash = 14, gap = 10) => {
  const out: string[] = [];
  for (let x = from; x + dash <= to; x += dash + gap) out.push(`M${x} ${y} H${x + dash}`);
  return out.join(" ");
};

/* ---------- PC（viewBox 1000×360） ---------- */

/** 御社のパソコン＝大きな角丸の枠 */
const PC_CASE =
  "M36 52 H770 A10 10 0 0 1 780 62 V324 A10 10 0 0 1 770 334 H36 A10 10 0 0 1 26 324 V62 A10 10 0 0 1 36 52 Z";

/** CSV の紙片＝桁の位置がそろっていないカンマ区切り */
const PC_CSV: readonly { y: number; s: readonly (readonly [number, number])[] }[] = [
  { y: 146, s: [[78, 18], [102, 10], [118, 14], [140, 20]] },
  { y: 155, s: [[78, 12], [96, 22], [124, 16], [146, 16]] },
  { y: 164, s: [[78, 20], [104, 12], [122, 20], [148, 14]] },
];

const PC_XLS_TICKS = [
  seg(219, [[76, 12], [102, 14], [154, 12]]),
  seg(232, [[76, 14], [128, 12], [154, 14]]),
].join(" ");

/** 配線（左→右の向きで描く＝描線も光もこの向きに進む） */
const PC_WIRES = ["M174 154 H250 V218 H306", "M174 218 H306", "M174 282 H250 V218 H306"] as const;
const PC_OUT = "M334 218 H396";
/** 管理表 → 境界へ向かう線。パソコンの枠（x=780）の手前で終わる＝出ない */
const PC_ESC = "M716 218 H774";
/** 枠の縁でともる短い光（0.4s） */
const PC_BLOCK = "M780 200 V236";
const PC_BORDER = dashV(850, 40, 344);

const PC_COL_X = [406, 486, 566, 646] as const;
const PC_ROW_Y = [199, 236, 274] as const;
const PC_ROW_W: readonly (readonly number[])[] = [
  [56, 32, 58, 34],
  [48, 36, 52, 30],
  [58, 30, 62, 34],
];

/* ---------- SP（viewBox 420×520＝縦に組み替え・境界は横の破線） ---------- */

const SP_CASE =
  "M18 30 H402 A10 10 0 0 1 412 40 V394 A10 10 0 0 1 402 404 H18 A10 10 0 0 1 8 394 V40 A10 10 0 0 1 18 30 Z";

const SP_CSV: readonly { y: number; s: readonly (readonly [number, number])[] }[] = [
  { y: 120, s: [[40, 22], [68, 12], [86, 18], [110, 14]] },
  { y: 131, s: [[40, 14], [60, 26], [92, 20], [118, 16]] },
  { y: 142, s: [[40, 24], [70, 14], [90, 22], [118, 14]] },
];

const SP_XLS_TICKS = [
  seg(134, [[158, 14], [186, 16], [240, 14]]),
  seg(150, [[158, 16], [213, 14], [240, 16]]),
].join(" ");

const SP_WIRES = ["M87 156 V180 H207 V186", "M207 156 V186", "M327 156 V180 H207 V186"] as const;
const SP_OUT = "M207 214 V246";
/** 管理表 → 境界へ向かう線。パソコンの枠（y=404）の手前で終わる＝出ない */
const SP_ESC = "M207 366 V396";
const SP_BLOCK = "M183 404 H231";
const SP_BORDER = dashH(440, 8, 412);

const SP_COL_X = [42, 130, 217, 304] as const;
const SP_ROW_Y = [292, 323, 355] as const;
const SP_ROW_W: readonly (readonly number[])[] = [
  [62, 36, 64, 38],
  [54, 40, 58, 34],
  [64, 34, 68, 38],
];

export default function InsideDiagram() {
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
    <figure className={styles.fig} data-inside-diagram>
      <figcaption className={styles.head}>
        <span className={styles.figNo} aria-hidden="true">
          FIG. 08-A
        </span>
        <span className={styles.figLabel}>データは、御社のパソコンの中だけ</span>
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
              viewBox="0 0 1000 360"
              role="img"
              aria-label={ARIA}
              preserveAspectRatio="xMidYMid meet"
            >
              {/* 四隅のトンボ */}
              <path
                className={styles.trim}
                d="M8 14 H20 M14 8 V20 M980 14 H992 M986 8 V20 M8 346 H20 M14 340 V352 M980 346 H992 M986 340 V352"
                aria-hidden="true"
              />

              {/* --- 御社のパソコン（角丸の枠） --- */}
              <text className={`${styles.name} ${styles.fade}`} x={26} y={42} style={at(T.caseLabel)}>
                御社のパソコン
              </text>
              <path
                className={`${styles.d} ${styles.dSlow} ${styles.case}`}
                pathLength={100}
                style={at(T.caseFrame)}
                d={PC_CASE}
              />

              {/* --- ブラウザの窓（上辺の帯＋小さな丸3つ） --- */}
              <path
                className={`${styles.d} ${styles.win}`}
                pathLength={100}
                style={at(T.win)}
                d="M48 76 H742 V312 H48 Z"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.band}`}
                pathLength={100}
                style={at(T.band)}
                d="M48 104 H742"
              />
              <g aria-hidden="true">
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip)} cx={64} cy={90} r={3} />
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip + 0.06)} cx={76} cy={90} r={3} />
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip + 0.12)} cx={88} cy={90} r={3} />
              </g>
              <text className={`${styles.tag} ${styles.tagJa}`} x={104} y={94} style={at(T.winTag)}>
                ブラウザ
              </text>

              {/* --- 窓の中 01：CSV の紙片 --- */}
              <text className={styles.tag} x={70} y={128} style={at(T.csvTag)}>
                CSV
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.csvFrame)}
                d="M70 134 H174 V174 H70 Z"
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

              {/* --- 窓の中 02：Excel の紙片（升目） --- */}
              <text className={styles.tag} x={70} y={192} style={at(T.xlsTag)}>
                Excel
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.xlsFrame)}
                d="M70 198 H174 V238 H70 Z"
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.xlsGrid)}
                d="M96 198 V238 M122 198 V238 M148 198 V238 M70 211 H174 M70 224 H174"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.xlsTick)}
                d={seg(206, [[76, 14], [102, 12], [128, 14], [154, 10]])}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.xlsTick + 0.1)}
                d={PC_XLS_TICKS}
              />

              {/* --- 窓の中 03：PDF の紙片（角の折れた頁） --- */}
              <text className={styles.tag} x={70} y={256} style={at(T.pdfTag)}>
                PDF
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.pdfFrame)}
                d="M70 262 H158 L174 278 V302 H70 Z"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.pdfFrame + 0.22)}
                d="M158 262 V278 H174"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.pdfLine)}
                d="M78 272 h50"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.pdfLine + 0.12)}
                d="M78 282 h78 M78 292 h62"
              />

              {/* --- 配線：3本が節点へ集まり、1本になって管理表へ --- */}
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
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire)} cx={174} cy={154} r={2.6} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.08)} cx={174} cy={218} r={2.6} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.16)} cx={174} cy={282} r={2.6} />

                {/* 光の点＝同じ線に重ねた短いダッシュを流す */}
                {PC_WIRES.map((d) => (
                  <path key={`s${d}`} className={`${styles.spark} ${styles.sparkIn}`} pathLength={100} style={at(T.spark)} d={d} />
                ))}
                <path className={`${styles.spark} ${styles.sparkOut}`} pathLength={100} style={at(T.spark)} d={PC_OUT} />

                {/* 節点 */}
                <g transform="translate(320 218)">
                  <circle className={`${styles.ring} ${styles.ring1}`} style={at(T.spark)} cx={0} cy={0} r={12} />
                  <circle className={`${styles.ring} ${styles.ring2}`} style={at(T.spark)} cx={0} cy={0} r={18} />
                  <path
                    className={`${styles.d} ${styles.dFast} ${styles.node}`}
                    pathLength={100}
                    style={at(T.node)}
                    d="M0 -8 L8 0 L0 8 L-8 0 Z"
                  />
                  <circle className={`${styles.fade} ${styles.dot}`} style={at(T.node + 0.18)} cx={0} cy={0} r={2.4} />
                </g>
              </g>

              {/* --- 窓の中 04：小さな管理表 --- */}
              <text className={`${styles.name} ${styles.fade}`} x={396} y={140} style={at(T.tableName)}>
                管理表
              </text>
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.table)}
                d="M396 148 H716 V288 H396 Z"
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.table + 0.16)}
                d="M476 148 V288 M556 148 V288 M636 148 V288 M396 213 H716 M396 251 H716"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.headRule}`}
                pathLength={100}
                style={at(T.table + 0.24)}
                d="M396 176 H716"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.tableHead)}
                d={seg(167, [[406, 48], [486, 36], [566, 48], [646, 36]])}
              />
              {PC_ROW_Y.map((y, i) => (
                <g key={y} className={styles.row} style={at(T.row + i * T.rowStep)}>
                  <path className={styles.cell} d={seg(y, PC_COL_X.map((x, c) => [x, PC_ROW_W[i][c]] as const))} />
                </g>
              ))}

              {/* --- 境界：ここから先へは出ない --- */}
              <g aria-hidden="true">
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.wireDim}`}
                  pathLength={100}
                  style={at(T.esc)}
                  d={PC_ESC}
                />
                <path
                  className={`${styles.spark} ${styles.sparkEsc}`}
                  pathLength={100}
                  style={at(T.spark + CYCLE)}
                  d={PC_ESC}
                />
                <path className={styles.block} style={at(T.spark + CYCLE)} d={PC_BLOCK} />
                <path
                  className={`${styles.d} ${styles.dSlow} ${styles.border}`}
                  pathLength={100}
                  style={at(T.border)}
                  d={PC_BORDER}
                />
              </g>
              <text
                className={`${styles.tag} ${styles.tagJa} ${styles.fade}`}
                x={925}
                y={196}
                textAnchor="middle"
                style={at(T.outTag)}
              >
                外
              </text>
            </svg>

            {/* ===== SP ===== */}
            <svg
              className={styles.svgSp}
              viewBox="0 0 420 520"
              role="img"
              aria-label={ARIA}
              preserveAspectRatio="xMidYMid meet"
            >
              <path
                className={styles.trim}
                d="M2 7 H12 M7 2 V12 M408 7 H418 M413 2 V12 M2 513 H12 M7 508 V518 M408 513 H418 M413 508 V518"
                aria-hidden="true"
              />

              {/* --- 御社のパソコン --- */}
              <text className={`${styles.name} ${styles.fade}`} x={10} y={22} style={at(T.caseLabel)}>
                御社のパソコン
              </text>
              <path
                className={`${styles.d} ${styles.dSlow} ${styles.case}`}
                pathLength={100}
                style={at(T.caseFrame)}
                d={SP_CASE}
              />

              {/* --- ブラウザの窓 --- */}
              <path className={`${styles.d} ${styles.win}`} pathLength={100} style={at(T.win)} d="M24 52 H396 V386 H24 Z" />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.band}`}
                pathLength={100}
                style={at(T.band)}
                d="M24 78 H396"
              />
              <g aria-hidden="true">
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip)} cx={38} cy={65} r={3} />
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip + 0.06)} cx={50} cy={65} r={3} />
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip + 0.12)} cx={62} cy={65} r={3} />
              </g>
              <text className={`${styles.tag} ${styles.tagJa}`} x={78} y={69} style={at(T.winTag)}>
                ブラウザ
              </text>

              {/* --- 窓の中 01：CSV --- */}
              <text className={styles.tag} x={32} y={100} style={at(T.csvTag)}>
                CSV
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.csvFrame)}
                d="M32 106 H142 V156 H32 Z"
              />
              {SP_CSV.map((r, i) => (
                <path
                  key={r.y}
                  className={`${styles.d} ${styles.dFast} ${styles.data}`}
                  pathLength={100}
                  style={at(T.csvRow + i * T.csvStep)}
                  d={seg(r.y, r.s)}
                />
              ))}

              {/* --- 窓の中 02：Excel --- */}
              <text className={styles.tag} x={152} y={100} style={at(T.xlsTag)}>
                Excel
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.xlsFrame)}
                d="M152 106 H262 V156 H152 Z"
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.xlsGrid)}
                d="M180 106 V156 M207 106 V156 M234 106 V156 M152 123 H262 M152 140 H262"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.xlsTick)}
                d={seg(117, [[158, 16], [186, 14], [213, 16], [240, 14]])}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.xlsTick + 0.1)}
                d={SP_XLS_TICKS}
              />

              {/* --- 窓の中 03：PDF --- */}
              <text className={styles.tag} x={272} y={100} style={at(T.pdfTag)}>
                PDF
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.pdfFrame)}
                d="M272 106 H366 L382 122 V156 H272 Z"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.pdfFrame + 0.22)}
                d="M366 106 V122 H382"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.pdfLine)}
                d="M280 116 h44"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.pdfLine + 0.12)}
                d="M280 130 h84 M280 142 h66"
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
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire)} cx={87} cy={156} r={2.6} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.08)} cx={207} cy={156} r={2.6} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.16)} cx={327} cy={156} r={2.6} />

                {SP_WIRES.map((d) => (
                  <path key={`s${d}`} className={`${styles.spark} ${styles.sparkIn}`} pathLength={100} style={at(T.spark)} d={d} />
                ))}
                <path className={`${styles.spark} ${styles.sparkOut}`} pathLength={100} style={at(T.spark)} d={SP_OUT} />

                <g transform="translate(207 200)">
                  <circle className={`${styles.ring} ${styles.ring1}`} style={at(T.spark)} cx={0} cy={0} r={12} />
                  <circle className={`${styles.ring} ${styles.ring2}`} style={at(T.spark)} cx={0} cy={0} r={18} />
                  <path
                    className={`${styles.d} ${styles.dFast} ${styles.node}`}
                    pathLength={100}
                    style={at(T.node)}
                    d="M0 -8 L8 0 L0 8 L-8 0 Z"
                  />
                  <circle className={`${styles.fade} ${styles.dot}`} style={at(T.node + 0.18)} cx={0} cy={0} r={2.4} />
                </g>
              </g>

              {/* --- 窓の中 04：小さな管理表 --- */}
              <text className={`${styles.name} ${styles.fade}`} x={32} y={238} style={at(T.tableName)}>
                管理表
              </text>
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.table)}
                d="M32 246 H382 V366 H32 Z"
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.table + 0.16)}
                d="M120 246 V366 M207 246 V366 M294 246 V366 M32 303 H382 M32 335 H382"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.headRule}`}
                pathLength={100}
                style={at(T.table + 0.24)}
                d="M32 272 H382"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.tableHead)}
                d={seg(265, [[42, 54], [130, 40], [217, 54], [304, 40]])}
              />
              {SP_ROW_Y.map((y, i) => (
                <g key={y} className={styles.row} style={at(T.row + i * T.rowStep)}>
                  <path className={styles.cell} d={seg(y, SP_COL_X.map((x, c) => [x, SP_ROW_W[i][c]] as const))} />
                </g>
              ))}

              {/* --- 境界（SP は横の破線） --- */}
              <g aria-hidden="true">
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.wireDim}`}
                  pathLength={100}
                  style={at(T.esc)}
                  d={SP_ESC}
                />
                <path
                  className={`${styles.spark} ${styles.sparkEsc}`}
                  pathLength={100}
                  style={at(T.spark + CYCLE)}
                  d={SP_ESC}
                />
                <path className={styles.block} style={at(T.spark + CYCLE)} d={SP_BLOCK} />
                <path
                  className={`${styles.d} ${styles.dSlow} ${styles.border}`}
                  pathLength={100}
                  style={at(T.border)}
                  d={SP_BORDER}
                />
              </g>
              <text
                className={`${styles.tag} ${styles.tagJa} ${styles.fade}`}
                x={210}
                y={486}
                textAnchor="middle"
                style={at(T.outTag)}
              >
                外
              </text>
            </svg>
          </div>
        </InViewGate>
      </div>
    </figure>
  );
}
