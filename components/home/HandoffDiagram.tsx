"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import InViewGate from "@/components/animation/InViewGate";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./HandoffDiagram.module.css";

/**
 * 「手を離すまで」＝トップ 01「何をする人か」の仕事の3段（01 現場に入る／02 仕事のやり方を
 * 教え込む／03 社員の方が回せる状態にする）を、**同じ仕組みを3コマで描く紙芝居**にした図
 * （2026-09-22・v2。v1 の折れ線グラフは廃止＝線と文字だけで意味が読めなかったため）。
 *
 * 1コマの中身は3コマとも同じ並び（＝比べて読める）。部品は FIG. 03-A（UnifyDiagram）から
 * 寸法比ごと借りる：
 *   左   … 書類2枚（手前＝罫の入った紙／奥＝角の折れた頁）
 *   中央 … ひし形の節点（＋同心の輪）
 *   右   … 管理表（4列×3行・見出し罫つき）
 *   下   … 人（肩までのピクトグラム＝頭 円 r=8・肩 半円弧 幅32・線1px）
 *
 * コマごとの差：
 *   01 現場に入る       … 節点はまだ無い（点線の輪郭だけ）。書類→管理表を破線が直結し、
 *                          その走りの真下に「社員の方」が立つ＝手で運んでいる。
 *                          「私」は右に離れて立ち、流れへ細い点線（見ている）。
 *   02 教え込む         … 節点が実線になり、書類→節点→管理表が配線で通る。
 *                          「私」が節点の下につながり（入場時に光の点が1回だけ私→節点へ走る）、
 *                          「社員の方」はその右に立つ。
 *   03 回せる状態にする … 02 と同じ仕組みのまま、節点につながるのが「社員の方」に替わる。
 *                          「私」は点線の輪郭だけになり、最後に opacity 0.25 へ落ちる＝手を離した。
 *
 * 図の中の語は「01」「02」「03」「私」「社員の方」の5つだけ（どれも節の既存語）。
 *
 * 動き（画面に 18% 入ったら1回）：01 のコマ → 02 → 03 の順に描かれる（各コマ 1.2 秒差）。
 *   03 の「私」の輪郭は最後に薄くなる。総尺 約4.3秒。
 *   以後の常時演出＝**03 のコマだけ** 光の点が 書類→節点→管理表 を 5 秒周期で流れる
 *   （動くのは周期の約 1/3 だけ。InViewGate で画面内かつ前面タブのときだけ running）。
 *
 * 互換：動かすのは transform(2D)・opacity・stroke-dashoffset だけ。
 *   filter / blend / 3D / SMIL / offset-path は使わない。線は pathLength="100" で正規化し、
 *   太さは vector-effect="non-scaling-stroke" で幅に依らず一定。
 *   JS 無し・SSR・prefers-reduced-motion: reduce ＝ 完成形の静止。
 *
 * 色：トップは色を使わない（朱は 02 実測の1点だけ）。白と灰のトークンだけ。
 */

const ARIA =
  "同じ仕組みを3つの場面で描いた図。01は書類から管理表へ破線がのび、その下で社員の方が手で運び、私は離れて見ている。02は書類と管理表のあいだに節点ができ、私が節点につながって教えている。03は同じ節点に社員の方がつながり、私は点線の輪郭だけになる。";

/** アニメーションの開始時刻（秒）を渡す。インライン style は CSS より強いので遅延だけ上書きできる */
const at = (sec: number): CSSProperties => ({ animationDelay: `${sec}s` });

/** 線分の並び（[開始x, 長さ]）を1本のパスへ＝紙の罫・表のセル（FIG. 03-A と同じ作法） */
type Run = readonly [number, number];
type Pt = readonly [number, number];

const seg = (y: number, list: readonly Run[]) => list.map(([x, w]) => `M${x} ${y} h${w}`).join(" ");

/** 入場の時刻表（秒）。コマ内の相対時刻＋コマ番号×T.panel が実時刻 */
const T = {
  panel: 1.2, // コマ間の間隔（01 → 02 → 03）
  num: 0,
  docFront: 0.06,
  docBack: 0.14,
  csv: 0.26,
  csvStep: 0.06,
  table: 0.3,
  grid: 0.42,
  head: 0.5,
  headCells: 0.56,
  row: 0.6,
  rowStep: 0.08,
  wire: 0.5,
  pin: 0.62,
  node: 0.66,
  dot: 0.82,
  opWire: 0.7,
  opPin: 0.84,
  person: 0.78,
  shoulder: 0.82,
  gaze: 0.86,
  sparkOnce: 0.86, // 02＝私→節点の光（入場の1回だけ）
  label: 0.92,
  spark: 1.0, // 03＝常時演出の始まり（2.4 + 1.0 ＝ 3.4 秒から 5 秒周期）
  ghostDim: 1.15, // 2.4 + 1.15 ＝ 3.55 秒から 0.7 秒で opacity 0.25 へ
};

/* ---------- 版（PC＝コマ 1/3 ずつの 1000×300／SP＝縦積み 420×720・各240） ----------
   どちらも「コマ内のローカル座標」で持ち、コマは translate で置く（拡大はしない）。 */

type Plan = {
  num: Pt;
  docBack: string;
  docFold: string;
  docFront: string;
  csv: readonly { y: number; s: readonly Run[] }[];
  tableFrame: string;
  tableGrid: string;
  tableHeadRule: string;
  headCellY: number;
  headCells: readonly Run[];
  rowCells: readonly { y: number; s: readonly Run[] }[];
  wireIn: string;
  wireOut: string;
  pinIn: Pt;
  node: Pt;
  ring1: number;
  ring2: number;
  half: number;
  dotR: number;
  carry: string;
  opWire: string;
  opPin: Pt;
  gaze: string;
  slotA: number;
  slotB: number;
  headY: number;
  headR: number;
  shoulderY: number;
  shoulderR: number;
  labelY: number;
};

const PC: Plan = {
  num: [22, 34],
  docBack: "M39 86 V74 H81 L93 86 V142 H84",
  docFold: "M81 74 V86 H93",
  docFront: "M30 86 H84 V154 H30 Z",
  csv: [
    { y: 100, s: [[36, 14], [54, 10], [68, 8]] },
    { y: 114, s: [[36, 22], [62, 14]] },
    { y: 128, s: [[36, 10], [50, 18], [72, 6]] },
    { y: 142, s: [[36, 18], [58, 8], [70, 8]] },
  ],
  tableFrame: "M238 86 H316 V150 H238 Z",
  tableGrid: "M258 86 V150 M278 86 V150 M298 86 V150 M238 118 H316 M238 134 H316",
  tableHeadRule: "M238 102 H316",
  headCellY: 95,
  headCells: [[242, 12], [262, 10], [282, 12], [302, 9]],
  rowCells: [
    { y: 110, s: [[242, 12], [262, 10], [282, 12], [302, 9]] },
    { y: 126, s: [[242, 10], [262, 11], [282, 10], [302, 9]] },
    { y: 142, s: [[242, 12], [262, 9], [282, 12], [302, 8]] },
  ],
  wireIn: "M97 118 H158",
  wireOut: "M176 118 H238",
  pinIn: [97, 118],
  node: [167, 118],
  ring1: 13,
  ring2: 19,
  half: 9,
  dotR: 2.4,
  carry: "M57 160 V180 H277 V156",
  opWire: "M167 197 V127",
  opPin: [167, 197],
  gaze: "M252 204 L206 188",
  slotA: 167,
  slotB: 262,
  headY: 212,
  headR: 8,
  shoulderY: 238,
  shoulderR: 16,
  labelY: 258,
};

const SP: Plan = {
  num: [16, 22],
  docBack: "M42 68 V56 H92 L106 70 V124 H94",
  docFold: "M92 56 V70 H106",
  docFront: "M32 68 H94 V136 H32 Z",
  csv: [
    { y: 82, s: [[38, 16], [60, 12], [78, 10]] },
    { y: 96, s: [[38, 26], [70, 16]] },
    { y: 110, s: [[38, 12], [56, 20], [82, 6]] },
    { y: 124, s: [[38, 20], [64, 10], [80, 8]] },
  ],
  tableFrame: "M300 68 H396 V136 H300 Z",
  tableGrid: "M324 68 V136 M348 68 V136 M372 68 V136 M300 102 H396 M300 119 H396",
  tableHeadRule: "M300 85 H396",
  headCellY: 78,
  headCells: [[305, 15], [329, 12], [353, 15], [377, 11]],
  rowCells: [
    { y: 94, s: [[305, 15], [329, 12], [353, 15], [377, 11]] },
    { y: 111, s: [[305, 13], [329, 13], [353, 12], [377, 11]] },
    { y: 128, s: [[305, 15], [329, 11], [353, 15], [377, 10]] },
  ],
  wireIn: "M110 102 H196",
  wireOut: "M214 102 H300",
  pinIn: [110, 102],
  node: [205, 102],
  ring1: 13,
  ring2: 19,
  half: 9,
  dotR: 2.4,
  carry: "M63 142 V158 H348 V142",
  opWire: "M205 169 V111",
  opPin: [205, 169],
  gaze: "M306 176 L256 166",
  slotA: 205,
  slotB: 318,
  headY: 184,
  headR: 8,
  shoulderY: 208,
  shoulderR: 16,
  labelY: 226,
};

/** 場面＝0:01（手で運ぶ）／1:02（私が教える）／2:03（社員の方が回す） */
type Scene = 0 | 1 | 2;
const SCENES: readonly Scene[] = [0, 1, 2];
const NUMS = ["01", "02", "03"] as const;

/** 人＝肩までのピクトグラム（頭 円 r=8・肩 半円弧 幅32・線1px）＋足元のラベル。
 *  ghost＝03 の「私」＝点線の輪郭（外側の g で opacity 0.25 まで落とす） */
function actor(p: Plan, px: number, label: string, base: number, ghost: boolean, key: string) {
  const arc = `M${px - p.shoulderR} ${p.shoulderY} A${p.shoulderR} ${p.shoulderR} 0 0 1 ${px + p.shoulderR} ${p.shoulderY}`;
  const line = ghost ? styles.personGhost : styles.person;

  return (
    <g key={key}>
      <circle
        className={`${line} ${styles.fade}`}
        cx={px}
        cy={p.headY}
        r={p.headR}
        style={at(base + T.person)}
      />
      {ghost ? (
        <path className={`${line} ${styles.fade}`} style={at(base + T.shoulder)} d={arc} />
      ) : (
        <path
          className={`${line} ${styles.d} ${styles.dFast}`}
          pathLength={100}
          style={at(base + T.shoulder)}
          d={arc}
        />
      )}
      <text
        className={`${styles.label} ${styles.fade}`}
        x={px}
        y={p.labelY}
        textAnchor="middle"
        style={at(base + T.label)}
      >
        {label}
      </text>
    </g>
  );
}

/** 1コマ。3コマとも同じ部品・同じ座標で、変わるのは節点と配線と人の役だけ */
function panel(p: Plan, scene: Scene, transform: string) {
  const base = scene * T.panel;
  const solid = scene !== 0; // 節点が実線＝仕組みが立ち上がっている
  const [nx, ny] = p.node;
  const diamond = `M0 -${p.half} L${p.half} 0 L0 ${p.half} L-${p.half} 0 Z`;

  // 節点（01 は破線の走り）につながっている方が左、もう一人が右
  const aLabel = scene === 1 ? "私" : "社員の方";
  const bLabel = scene === 1 ? "社員の方" : "私";
  const bActor = actor(p, p.slotB, bLabel, base, scene === 2, "b");

  return (
    <g key={transform} transform={transform}>
      {/* --- コマの番号（段の題は図のすぐ上の3段にある＝ここには書かない） --- */}
      <text
        className={`${styles.num} ${styles.fade}`}
        x={p.num[0]}
        y={p.num[1]}
        style={at(base + T.num)}
      >
        {NUMS[scene]}
      </text>

      {/* --- 書類（奥＝角の折れた頁／手前＝罫の入った紙） --- */}
      <path
        className={`${styles.d} ${styles.paper}`}
        pathLength={100}
        style={at(base + T.docBack)}
        d={p.docBack}
      />
      <path
        className={`${styles.d} ${styles.dFast} ${styles.grid}`}
        pathLength={100}
        style={at(base + T.docBack + 0.12)}
        d={p.docFold}
      />
      <path
        className={`${styles.d} ${styles.paper}`}
        pathLength={100}
        style={at(base + T.docFront)}
        d={p.docFront}
      />
      {p.csv.map((r, i) => (
        <path
          key={r.y}
          className={`${styles.d} ${styles.dFast} ${styles.data}`}
          pathLength={100}
          style={at(base + T.csv + i * T.csvStep)}
          d={seg(r.y, r.s)}
        />
      ))}

      {/* --- 管理表（4列×3行・見出し罫つき） --- */}
      <path
        className={`${styles.d} ${styles.paper}`}
        pathLength={100}
        style={at(base + T.table)}
        d={p.tableFrame}
      />
      <path
        className={`${styles.d} ${styles.grid}`}
        pathLength={100}
        style={at(base + T.grid)}
        d={p.tableGrid}
      />
      <path
        className={`${styles.d} ${styles.dFast} ${styles.headRule}`}
        pathLength={100}
        style={at(base + T.head)}
        d={p.tableHeadRule}
      />
      <path
        className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
        pathLength={100}
        style={at(base + T.headCells)}
        d={seg(p.headCellY, p.headCells)}
      />
      {p.rowCells.map((r, i) => (
        <g key={r.y} className={styles.row} style={at(base + T.row + i * T.rowStep)}>
          <path className={styles.cell} d={seg(r.y, r.s)} />
        </g>
      ))}

      {/* --- 01＝節点がまだ無い：書類と管理表を破線が直結し、その走りの真下に人が立つ --- */}
      {!solid && (
        <>
          <path className={`${styles.carry} ${styles.fade}`} style={at(base + T.wire)} d={p.carry} />
          <path className={`${styles.gaze} ${styles.fade}`} style={at(base + T.gaze)} d={p.gaze} />
        </>
      )}

      {/* --- 02・03＝配線が通る（書類→節点→管理表 ＋ 人→節点） --- */}
      {solid && (
        <g aria-hidden="true">
          <path
            className={`${styles.d} ${styles.dSlow} ${styles.wire}`}
            pathLength={100}
            style={at(base + T.wire)}
            d={p.wireIn}
          />
          <path
            className={`${styles.d} ${styles.dFast} ${styles.wire}`}
            pathLength={100}
            style={at(base + T.wire + 0.3)}
            d={p.wireOut}
          />
          <circle
            className={`${styles.pin} ${styles.fade}`}
            style={at(base + T.pin)}
            cx={p.pinIn[0]}
            cy={p.pinIn[1]}
            r={3}
          />
          <path
            className={`${styles.d} ${styles.dFast} ${styles.wire}`}
            pathLength={100}
            style={at(base + T.opWire)}
            d={p.opWire}
          />
          <circle
            className={`${styles.pin} ${styles.fade}`}
            style={at(base + T.opPin)}
            cx={p.opPin[0]}
            cy={p.opPin[1]}
            r={3}
          />
        </g>
      )}

      {/* --- 節点（01 は点線の輪郭だけ／02・03 は実線＋芯。03 だけ同心の輪がともる） --- */}
      <g transform={`translate(${nx} ${ny})`}>
        {scene === 2 && (
          <>
            <circle
              className={`${styles.ring} ${styles.ring1}`}
              cx={0}
              cy={0}
              r={p.ring1}
              style={at(base + T.spark)}
            />
            <circle
              className={`${styles.ring} ${styles.ring2}`}
              cx={0}
              cy={0}
              r={p.ring2}
              style={at(base + T.spark)}
            />
          </>
        )}
        {solid ? (
          <>
            <path
              className={`${styles.d} ${styles.dFast} ${styles.node}`}
              pathLength={100}
              style={at(base + T.node)}
              d={diamond}
            />
            <circle
              className={`${styles.dot} ${styles.fade}`}
              cx={0}
              cy={0}
              r={p.dotR}
              style={at(base + T.dot)}
            />
          </>
        ) : (
          <path className={`${styles.nodeGhost} ${styles.fade}`} style={at(base + T.node)} d={diamond} />
        )}
      </g>

      {/* --- 光の点（03＝常時 5s 周期／02＝入場の1回だけ 私→節点） --- */}
      {scene === 2 && (
        <g aria-hidden="true">
          <path
            className={`${styles.spark} ${styles.sparkIn}`}
            pathLength={100}
            style={at(base + T.spark)}
            d={p.wireIn}
          />
          <path
            className={`${styles.spark} ${styles.sparkOut}`}
            pathLength={100}
            style={at(base + T.spark)}
            d={p.wireOut}
          />
        </g>
      )}
      {scene === 1 && (
        <path
          className={`${styles.spark} ${styles.sparkOnce}`}
          pathLength={100}
          style={at(base + T.sparkOnce)}
          d={p.opWire}
          aria-hidden="true"
        />
      )}

      {/* --- 人（左＝節点／流れにつながっている方・右＝もう一人） --- */}
      {actor(p, p.slotA, aLabel, base, false, "a")}
      {scene === 2 ? (
        <g className={styles.ghostGroup} style={at(base + T.ghostDim)}>
          {bActor}
        </g>
      ) : (
        bActor
      )}
    </g>
  );
}

export default function HandoffDiagram() {
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
    <figure className={styles.fig} data-handoff-diagram>
      <figcaption className={styles.head}>
        <span className={styles.figLabel}>手を離すまで</span>
        <span className={styles.rule} aria-hidden="true" />
      </figcaption>

      <div className={styles.frame}>
        {/* 常時演出（光の点）の器：画面内のあいだだけ running。className は不変にしておく
            （state 由来のクラスを同じ要素に載せると、再レンダーで .live が消える） */}
        <InViewGate className={styles.gate} activeClassName={styles.live} threshold={0.1}>
          <div ref={ref} className={stageClass}>
            {/* ===== PC＝横に3コマ（真上の3段と同じ 1/3 ずつ） ===== */}
            <svg
              className={styles.svgPc}
              viewBox="0 0 1000 300"
              role="img"
              aria-label={ARIA}
              preserveAspectRatio="xMidYMid meet"
            >
              {[333.333, 666.667].map((x, i) => (
                <path
                  key={x}
                  className={`${styles.divider} ${styles.fade}`}
                  style={at((i + 1) * T.panel)}
                  d={`M${x} 64 V268`}
                  aria-hidden="true"
                />
              ))}
              {SCENES.map((s) => panel(PC, s, `translate(${s * 333.333} 0)`))}
            </svg>

            {/* ===== SP＝縦に3コマ（各240） ===== */}
            <svg
              className={styles.svgSp}
              viewBox="0 0 420 720"
              role="img"
              aria-label={ARIA}
              preserveAspectRatio="xMidYMid meet"
            >
              {[240, 480].map((y, i) => (
                <path
                  key={y}
                  className={`${styles.divider} ${styles.fade}`}
                  style={at((i + 1) * T.panel)}
                  d={`M16 ${y} H396`}
                  aria-hidden="true"
                />
              ))}
              {SCENES.map((s) => panel(SP, s, `translate(0 ${s * 240})`))}
            </svg>
          </div>
        </InViewGate>
      </div>
    </figure>
  );
}
