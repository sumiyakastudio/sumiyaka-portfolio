"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import InViewGate from "@/components/animation/InViewGate";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./ScopeDiagram.module.css";

/**
 * /about 05 SCOPE OF WORK ＝「途中で担当が変わることはありません」
 * （2026-09-22・図解の憲法 §9-B＝v2 の作り直し。v1 の「線と点と『私』」は廃止）
 *
 * 描くもの＝**5つの工程を、それぞれ見て分かる形のカードで描き、一本の線が途切れず通る**。
 *   企画 … 角の折れた紙に箇条書き3行（行頭に点）
 *   設計 … 画面の割り付け（外枠＋上の帯＋2つの箱＝袖と本体）
 *   実装 … コードの行（左の縦罫＋字下げの違う4本の線）
 *   教育 … 手順書（行頭に小さな円3つ＋行）
 *   公開 … ブラウザの窓（上の帯に丸3つ＋中に1つの箱）
 * 形はすべて FIG. 03-A（components/service/UnifyDiagram）の紙片・升目・罫と同じ線種で、
 * 新しい記号は作らない。人は描かない（「私」の文字も置かない＝v1 の指摘）。
 *
 * 一本の線＝カードの中央の高さを左から右へ通る。カードの内側では描かない＝
 * 「カードの後ろを通っている」姿になる（塗りを使わずに前後関係を出す）。
 * 両端は端子（小円）。線は 5 枚を貫いて一度も切れない＝担当が替わらないこと。
 *
 * 動き（画面に入ったら1回）：
 *   ①線が左→右へ一筆で引かれる（6区間 × 0.23s ＝ 1.4s）
 *   ②線が届いた順にカードの枠→中の絵→工程名が描かれる（0.23s 刻み）
 *   ③入場が済んだら常時演出に入る＝光の点が線を端から端まで走る（6秒周期）。
 *     点はカードに入ると見えなくなり、そのあいだカードの枠が一瞬明るくなって、
 *     次の区間へ出てくる＝途切れずに 企画 → 公開 まで通る。
 *   InViewGate で画面内かつ前面タブのときだけ running（CSS の既定は paused）。
 *
 * 互換：動かすのは opacity・stroke-dashoffset だけ（transform も使わない）。
 *   filter / blend / 3D / SMIL / offset-path / clip-path は使わない。点の移動は
 *   「線に重ねた短いダッシュを stroke-dashoffset で流す」方式。線は pathLength="100"
 *   で正規化し、太さは vector-effect="non-scaling-stroke" で幅に依らず 1px／2px の二段。
 *   （光の点だけは絵と同じ比率で縮めたいので non-scaling-stroke を付けない）
 *   JS 無し・prefers-reduced-motion: reduce ＝ 完成形の静止表示。
 */

const ARIA =
  "企画・設計・実装・教育・公開の5つの工程が、一本の途切れない線でつながっている図。";

/** 工程名＝節の既存語だけ（新しい言い回しを図の中で発明しない） */
const LABELS = ["企画", "設計", "実装", "教育", "公開"] as const;

/** カードの大きさ（PC・SP 共通＝縮小ではなく並べ替えで組み替える） */
const CARD_W = 96;
const CARD_H = 68;
/** 工程名のベースライン＝カード上端からの距離 */
const LABEL_DY = 90;

/** アニメーションの開始時刻（秒）。インライン style は CSS より強いので遅延だけ上書きできる */
const at = (sec: number): CSSProperties => ({ animationDelay: `${sec}s` });
/** 区間ごとに長さが違う線は、尺（秒）も一緒に渡す */
const atd = (sec: number, dur: number): CSSProperties => ({
  animationDelay: `${sec}s`,
  animationDuration: `${dur}s`,
});

/** 入場と周期の時刻表（秒） */
const T = {
  /** カードの枠が引かれたあと、中の絵が描かれるまで */
  art: 0.16,
  /** 中の絵の「点・円」が現れるまで */
  mark: 0.26,
  /** 工程名が現れるまで */
  label: 0.3,
};

/* ======================================================================
   カードの中の絵（FIG. 03-A の紙片・升目・罫と同じ線種で描く）
   座標はカードの左上（X, Y）からの相対。カードは 96 × 68。
   ====================================================================== */

/** 線（stroke-dashoffset で描かれる） */
const STROKE = {
  paper: styles.paper,
  grid: styles.grid,
  box: styles.box,
  data: styles.data,
  dataStrong: styles.dataStrong,
} as const;

/** 印（opacity で現れる） */
const MARK = {
  dot: styles.dot,
  step: styles.step,
} as const;

type Piece =
  | { t: "p"; cls: keyof typeof STROKE; d: string }
  | { t: "c"; cls: keyof typeof MARK; cx: number; cy: number; r: number };

function art(kind: number, X: number, Y: number): readonly Piece[] {
  const h = (n: number) => X + n;
  const v = (n: number) => Y + n;

  switch (kind) {
    /* 企画＝角の折れた紙（03-A の PDF 頁と同じ作り）に箇条書き3行 */
    case 0:
      return [
        { t: "p", cls: "paper", d: `M${h(23)} ${v(9)} H${h(65)} L${h(73)} ${v(17)} V${v(59)} H${h(23)} Z` },
        { t: "p", cls: "grid", d: `M${h(65)} ${v(9)} V${v(17)} H${h(73)}` },
        {
          t: "p",
          cls: "data",
          d: `M${h(36)} ${v(24)} h28 M${h(36)} ${v(34)} h23 M${h(36)} ${v(44)} h30`,
        },
        { t: "c", cls: "dot", cx: h(31), cy: v(24), r: 1.5 },
        { t: "c", cls: "dot", cx: h(31), cy: v(34), r: 1.5 },
        { t: "c", cls: "dot", cx: h(31), cy: v(44), r: 1.5 },
      ];

    /* 設計＝画面の割り付け（外枠＋上の帯＋袖と本体の2つの箱） */
    case 1:
      return [
        { t: "p", cls: "paper", d: `M${h(20)} ${v(12)} H${h(76)} V${v(56)} H${h(20)} Z` },
        { t: "p", cls: "grid", d: `M${h(20)} ${v(21)} H${h(76)}` },
        { t: "p", cls: "dataStrong", d: `M${h(25)} ${v(17)} h16` },
        {
          t: "p",
          cls: "box",
          d: `M${h(25)} ${v(27)} H${h(39)} V${v(51)} H${h(25)} Z M${h(43)} ${v(27)} H${h(71)} V${v(51)} H${h(43)} Z`,
        },
      ];

    /* 実装＝コードの行（左の縦罫＋字下げの違う4本） */
    case 2:
      return [
        { t: "p", cls: "grid", d: `M${h(27)} ${v(12)} V${v(56)}` },
        { t: "p", cls: "dataStrong", d: `M${h(34)} ${v(20)} h32` },
        {
          t: "p",
          cls: "data",
          d: `M${h(40)} ${v(30)} h28 M${h(46)} ${v(40)} h22 M${h(40)} ${v(50)} h26`,
        },
      ];

    /* 教育＝手順書（行頭に小さな円3つ＋行） */
    case 3:
      return [
        { t: "p", cls: "paper", d: `M${h(18)} ${v(13)} H${h(78)} V${v(55)} H${h(18)} Z` },
        {
          t: "p",
          cls: "data",
          d: `M${h(36)} ${v(22)} h32 M${h(36)} ${v(34)} h26 M${h(36)} ${v(46)} h30`,
        },
        { t: "c", cls: "step", cx: h(28), cy: v(22), r: 3 },
        { t: "c", cls: "step", cx: h(28), cy: v(34), r: 3 },
        { t: "c", cls: "step", cx: h(28), cy: v(46), r: 3 },
      ];

    /* 公開＝ブラウザの窓（上の帯に丸3つ＋中に1つの箱） */
    default:
      return [
        { t: "p", cls: "paper", d: `M${h(20)} ${v(12)} H${h(76)} V${v(56)} H${h(20)} Z` },
        { t: "p", cls: "grid", d: `M${h(20)} ${v(22)} H${h(76)}` },
        { t: "p", cls: "box", d: `M${h(27)} ${v(29)} H${h(69)} V${v(49)} H${h(27)} Z` },
        { t: "c", cls: "dot", cx: h(27), cy: v(17), r: 1.6 },
        { t: "c", cls: "dot", cx: h(33), cy: v(17), r: 1.6 },
        { t: "c", cls: "dot", cx: h(39), cy: v(17), r: 1.6 },
      ];
  }
}

/* ======================================================================
   版面
   ====================================================================== */

type Rail = { d: string; delay: number; dur: number };
type Spark = { d: string; delay: number; long: boolean };
type Pin = { cx: number; cy: number; delay: number };

type Layout = {
  w: number;
  h: number;
  /** カードの左上（5枚・工程の順） */
  cards: readonly { x: number; y: number }[];
  /** カードの枠が引かれる時刻（5枚） */
  cardAt: readonly number[];
  /** 一本の線のうち「カードの外に見えている」6区間（左→右の順・描く向きもこの向き） */
  rail: readonly Rail[];
  /** 光の点（区間と同じ道）。delay は常時演出の周期内の位置 */
  spark: readonly Spark[];
  /** カードの枠がともる時刻（周期内・点がそのカードの後ろにいるあいだ） */
  glow: readonly number[];
  pinA: Pin;
  pinB: Pin;
  /** 常時演出（光の点）の1周目が始まる時刻＝入場が済んだあと */
  loop: number;
};

/* ---- PC（viewBox 620×150・横一列） ----
   左端の端子 22 →[16]→ カード5枚（96）を 16 の空きで並べ →[16]→ 右端の端子 598。
   6区間の長さをすべて 16 に揃えてあるので、光の点はどの区間も同じ速さで走る。 */
const PC: Layout = {
  w: 620,
  h: 150,
  cards: [
    { x: 38, y: 28 },
    { x: 150, y: 28 },
    { x: 262, y: 28 },
    { x: 374, y: 28 },
    { x: 486, y: 28 },
  ],
  cardAt: [0.29, 0.52, 0.75, 0.98, 1.21],
  rail: [
    { d: "M22 62 H38", delay: 0, dur: 0.23 },
    { d: "M134 62 H150", delay: 0.23, dur: 0.23 },
    { d: "M246 62 H262", delay: 0.46, dur: 0.23 },
    { d: "M358 62 H374", delay: 0.69, dur: 0.23 },
    { d: "M470 62 H486", delay: 0.92, dur: 0.23 },
    { d: "M582 62 H598", delay: 1.15, dur: 0.23 },
  ],
  spark: [
    { d: "M22 62 H38", delay: 0, long: false },
    { d: "M134 62 H150", delay: 0.36, long: false },
    { d: "M246 62 H262", delay: 0.72, long: false },
    { d: "M358 62 H374", delay: 1.08, long: false },
    { d: "M470 62 H486", delay: 1.44, long: false },
    { d: "M582 62 H598", delay: 1.8, long: false },
  ],
  glow: [0.16, 0.52, 0.88, 1.24, 1.6],
  pinA: { cx: 22, cy: 62, delay: 0.06 },
  pinB: { cx: 598, cy: 62, delay: 1.44 },
  loop: 2.1,
};

/* ---- SP（viewBox 420×280・3枚＋2枚の2段） ----
   **2段とも左→右に読む**（上段＝企画・設計・実装／下段＝教育・公開）。
   線は一度も切れない＝実装の右から出て、右端（x=392）で下に折れ、
   上段の工程名の下端（約115）と下段カードの上端（168）のあいだ（y=156）を左端（x=34）まで戻り、
   そこから下段の高さ（y=202）へ下りて、教育へ左から入る＝逆「コ」の字の戻り線。
   戻り線だけ道が長いので、尺も光の点も長め（long）にする。 */
const SP: Layout = {
  w: 420,
  h: 280,
  cards: [
    { x: 50, y: 20 },
    { x: 162, y: 20 },
    { x: 274, y: 20 },
    { x: 106, y: 168 },
    { x: 218, y: 168 },
  ],
  cardAt: [0.29, 0.52, 0.75, 1.37, 1.6],
  rail: [
    { d: "M34 54 H50", delay: 0, dur: 0.23 },
    { d: "M146 54 H162", delay: 0.23, dur: 0.23 },
    { d: "M258 54 H274", delay: 0.46, dur: 0.23 },
    { d: "M370 54 H392 V156 H34 V202 H106", delay: 0.69, dur: 0.62 },
    { d: "M202 202 H218", delay: 1.31, dur: 0.23 },
    { d: "M314 202 H330", delay: 1.54, dur: 0.23 },
  ],
  spark: [
    { d: "M34 54 H50", delay: 0, long: false },
    { d: "M146 54 H162", delay: 0.36, long: false },
    { d: "M258 54 H274", delay: 0.72, long: false },
    { d: "M370 54 H392 V156 H34 V202 H106", delay: 1.08, long: true },
    { d: "M202 202 H218", delay: 1.9, long: false },
    { d: "M314 202 H330", delay: 2.26, long: false },
  ],
  glow: [0.16, 0.52, 0.88, 1.7, 2.06],
  pinA: { cx: 34, cy: 54, delay: 0.06 },
  pinB: { cx: 330, cy: 202, delay: 1.77 },
  loop: 2.45,
};

function Plot({ lay, svgClass }: { lay: Layout; svgClass: string }) {
  return (
    <svg
      className={svgClass}
      viewBox={`0 0 ${lay.w} ${lay.h}`}
      role="img"
      aria-label={ARIA}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* --- 一本の線（カードの外に見えている区間だけを、左→右の順に引く） --- */}
      <g aria-hidden="true">
        {lay.rail.map((r) => (
          <path
            key={r.d}
            className={`${styles.d} ${styles.railLine}`}
            pathLength={100}
            style={atd(r.delay, r.dur)}
            d={r.d}
          />
        ))}
        <circle
          className={`${styles.fade} ${styles.pin}`}
          style={at(lay.pinA.delay)}
          cx={lay.pinA.cx}
          cy={lay.pinA.cy}
          r={3}
        />
        <circle
          className={`${styles.fade} ${styles.pin}`}
          style={at(lay.pinB.delay)}
          cx={lay.pinB.cx}
          cy={lay.pinB.cy}
          r={3}
        />
      </g>

      {/* --- 5つの工程のカード --- */}
      {lay.cards.map((c, i) => {
        const frame = `M${c.x} ${c.y} H${c.x + CARD_W} V${c.y + CARD_H} H${c.x} Z`;
        const base = lay.cardAt[i];

        return (
          <g key={LABELS[i]}>
            <path
              className={`${styles.d} ${styles.cardFrame}`}
              pathLength={100}
              style={at(base)}
              d={frame}
            />

            {art(i, c.x, c.y).map((p) =>
              p.t === "p" ? (
                <path
                  key={p.d}
                  className={`${styles.d} ${styles.dFast} ${STROKE[p.cls]}`}
                  pathLength={100}
                  style={at(base + T.art)}
                  d={p.d}
                />
              ) : (
                <circle
                  key={`${p.cls}${p.cx}-${p.cy}`}
                  className={`${styles.fade} ${MARK[p.cls]}`}
                  style={at(base + T.mark)}
                  cx={p.cx}
                  cy={p.cy}
                  r={p.r}
                />
              ),
            )}

            <text
              className={`${styles.label} ${styles.fade}`}
              style={at(base + T.label)}
              x={c.x + CARD_W / 2}
              y={c.y + LABEL_DY}
            >
              {LABELS[i]}
            </text>

            {/* 光の点がこのカードの後ろを通っているあいだ、枠だけがふっと明るくなる */}
            <path className={styles.glow} style={at(lay.loop + lay.glow[i])} d={frame} aria-hidden="true" />
          </g>
        );
      })}

      {/* --- 光の点（区間と同じ道を走る。カードの内側には道が無い＝見えなくなる） --- */}
      <g aria-hidden="true">
        {lay.spark.map((s) => (
          <path
            key={s.d}
            className={s.long ? `${styles.spark} ${styles.sparkLong}` : styles.spark}
            pathLength={100}
            style={at(lay.loop + s.delay)}
            d={s.d}
          />
        ))}
      </g>
    </svg>
  );
}

export default function ScopeDiagram() {
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
    <figure className={styles.fig} data-scope-diagram>
      {/* 図番なし＝一行の図名（節の既存文）＋右へ伸びる罫。枠は付けない（墨の洗いの上） */}
      <figcaption className={styles.head}>
        <span className={styles.figLabel}>途中で担当が変わることはありません</span>
        <span className={styles.rule} aria-hidden="true" />
      </figcaption>

      {/* 常時演出（光の点・枠のともり）の器：画面内のあいだだけ running。className は不変にしておく
          （state 由来のクラスを同じ要素に載せると、再レンダーで .live が消える） */}
      <InViewGate className={styles.gate} activeClassName={styles.live} threshold={0.1}>
        <div ref={ref} className={stageClass}>
          <Plot lay={PC} svgClass={styles.svgPc} />
          <Plot lay={SP} svgClass={styles.svgSp} />
        </div>
      </InViewGate>
    </figure>
  );
}
