"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import InViewGate from "@/components/animation/InViewGate";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./DecideDiagram.module.css";

/**
 * 「機械が出し、人が決める」の図（/cases「人が決めるところ」）。
 *
 * ◆ 何を見せるか（節の主張をそのまま1枚に）
 *   左＝3つの駅「集める」「揃える」「出す」。上に細い括弧線を掛け、mono で「機械」。
 *       ＝ここまでは機械の受け持ち。
 *   中＝大きなひし形の節点「人が決める」。流れはここで必ず一度止まる。
 *   右＝最後の駅「使う」。人が通した分だけが先へ進む。
 *   光の点が 集める→揃える→出す と走り、ひし形の手前で 0.8 秒止まる。
 *   そのあいだに同心の輪が一度ふっと明るくなり、ひし形の中に小さな「✓」が描かれ、
 *   そこで初めて点が「使う」へ進んで消える。周期 5.5 秒（残りは休む）。
 *
 * ◆ 文言は節の既存の語だけ（集める・揃える・出す・機械・人が決める・使う）。
 *   社名・金額・日付・道具名は描かない。数字も置かない（数字は「測り方」の図の担当）。
 *
 * ◆ 色は /cases の紙のトークンだけ（--cs-ink / --cs-ink-2 / --cs-ink-3 /
 *   --cs-line / --cs-line-strong / --cs-paper）。朱 --cs-seal は「実測」の印だけの
 *   決まりなので、この図では使わない。器は MeasureDiagram と同じ紙の板＋罫の枠。
 *
 * ◆ 互換：動かすのは transform(2D)・opacity・stroke-dashoffset だけ。
 *   filter / backdrop-filter のアニメ・mix-blend-mode・3D transform・SMIL・
 *   offset-path・複雑な clip-path・vw フォントは使わない。線は pathLength={100} で
 *   正規化し、太さは vector-effect: non-scaling-stroke で拡大率に依らず一定。
 *   輪は scale ではなく opacity で光らせる（WebKit で線が太るため）。
 *
 * ◆ 既定（クラス無し・SSR・JS 無し・prefers-reduced-motion: reduce）＝完成形の静止。
 *   「✓」も描かれた状態で止まる。JS が載って useMotionAllowed() が true のときだけ
 *   .armed（初期状態）を被せ、画面に 18% 入ったら .play。常時演出は InViewGate の
 *   .live が付いているあいだだけ running（CSS の既定は animation-play-state: paused）。
 *
 * ◆ ScrollReveal では包まない（自前の入場を持つ＝transform の二重掛けを避ける）。
 */

const ARIA =
  "集める・揃える・出すの3つは機械が受け持ち、その結果を使うかどうかは人が決める、という流れの図。";

/** アニメーションの開始時刻（秒）を渡す。インライン style は CSS より強いので遅延だけ上書きできる */
const at = (sec: number): CSSProperties => ({ animationDelay: `${sec}s` });

/** 入場の時刻表（秒）。左→右の順に駅と配線が描かれ、最後にひし形と「使う」が出る */
const T = {
  st1: 0,
  lb1: 0.18,
  w1: 0.22,
  st2: 0.44,
  lb2: 0.6,
  w2: 0.64,
  st3: 0.86,
  lb3: 1.02,
  brace: 1.14,
  tag: 1.3,
  w3: 1.34,
  node: 1.66,
  nodeName: 1.88,
  w4: 2.0,
  st4: 2.26,
  lb4: 2.42,
  /** 常時演出（光の点・輪・✓）の開始＝入場が描き終わるころ */
  cycle: 2.6,
};

/** 駅＝小さな四角。中心と半辺からパスを作る */
const box = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy - r} H${cx + r} V${cy + r} H${cx - r} Z`;

type Station = {
  /** 四角の中心 */
  x: number;
  y: number;
  /** 半辺 */
  r: number;
  /** ラベルのベースライン */
  ly: number;
  label: string;
  /** 四角・ラベルの入場時刻 */
  d: number;
  l: number;
};

type Wire = { d: string; t: number; slow?: boolean };

/* ---------- PC（viewBox 800×200） ----------
   線路は y=96 の一直線。左の3駅に括弧線を掛けて「機械」、
   x=530 に大きなひし形、右端 x=700 に「使う」。 */

const PC_STATIONS: readonly Station[] = [
  { x: 108, y: 96, r: 8, ly: 128, label: "集める", d: T.st1, l: T.lb1 },
  { x: 248, y: 96, r: 8, ly: 128, label: "揃える", d: T.st2, l: T.lb2 },
  { x: 388, y: 96, r: 8, ly: 128, label: "出す", d: T.st3, l: T.lb3 },
  { x: 700, y: 96, r: 8, ly: 128, label: "使う", d: T.st4, l: T.lb4 },
];

const PC_WIRES: readonly Wire[] = [
  { d: "M116 96 H240", t: T.w1 },
  { d: "M256 96 H380", t: T.w2 },
  { d: "M396 96 H502", t: T.w3 },
  { d: "M558 96 H692", t: T.w4 },
];

/** 機械の受け持ちを囲う括弧線（3駅の上） */
const PC_BRACE = "M84 60 V48 H412 V60";
/** ひし形の節点＝人が決めるところ */
const PC_NODE = "M530 68 L558 96 L530 124 L502 96 Z";
/** ひし形の中に描かれる小さな「✓」 */
const PC_CHECK = "M519 96 L527 105 L543 87";
/** 光の点：集める→ひし形の手前（ここで止まる） */
const PC_RUN = "M108 96 H502";
/** 光の点：ひし形→使う（進んで消える） */
const PC_EXIT = "M558 96 H700";

/* ---------- SP（viewBox 420×300） ----------
   横に並べきれないので2段に折る。上段＝機械の3駅、
   右で折り返して下段へ降り、ひし形→「使う」。 */

const SP_STATIONS: readonly Station[] = [
  { x: 66, y: 82, r: 7, ly: 114, label: "集める", d: T.st1, l: T.lb1 },
  { x: 186, y: 82, r: 7, ly: 114, label: "揃える", d: T.st2, l: T.lb2 },
  { x: 306, y: 82, r: 7, ly: 114, label: "出す", d: T.st3, l: T.lb3 },
  { x: 306, y: 200, r: 7, ly: 232, label: "使う", d: T.st4, l: T.lb4 },
];

const SP_WIRES: readonly Wire[] = [
  { d: "M73 82 H179", t: T.w1 },
  { d: "M193 82 H299", t: T.w2 },
  // 折り返し＝駅のラベルを避けて右へ抜け、下段の中央へ降りる
  { d: "M313 82 H366 V150 H150 V172", t: T.w3, slow: true },
  { d: "M178 200 H299", t: T.w4 },
];

const SP_BRACE = "M40 60 V52 H332 V60";
const SP_NODE = "M150 172 L178 200 L150 228 L122 200 Z";
const SP_CHECK = "M139 200 L147 209 L163 191";
const SP_RUN = "M66 82 H366 V150 H150 V172";
const SP_EXIT = "M178 200 H306";

export default function DecideDiagram() {
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
    <figure className={styles.fig} data-decide-diagram>
      <figcaption className={styles.head}>
        <span className={styles.figLabel}>機械が出し、人が決める</span>
        <span className={styles.rule} aria-hidden="true" />
      </figcaption>

      {/* 常時演出（光の点・輪・✓）の器：画面内かつ前面タブのあいだだけ running。
          className は不変にしておく（state 由来のクラスを同じ要素に載せると、
          再レンダーで .live が消える） */}
      <InViewGate className={styles.gate} activeClassName={styles.live} threshold={0.1}>
        <div ref={ref} className={stageClass}>
          {/* ===== PC ===== */}
          <svg
            className={styles.svgPc}
            viewBox="0 0 800 200"
            role="img"
            aria-label={ARIA}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* --- 機械の受け持ち（括弧線＋mono の見出し） --- */}
            <text className={`${styles.tag} ${styles.fade}`} x={248} y={38} style={at(T.tag)}>
              機械
            </text>
            <path
              className={`${styles.d} ${styles.dFast} ${styles.brace}`}
              pathLength={100}
              style={at(T.brace)}
              d={PC_BRACE}
              aria-hidden="true"
            />

            {/* --- 配線 --- */}
            <g aria-hidden="true">
              {PC_WIRES.map((w) => (
                <path
                  key={w.d}
                  className={`${styles.d} ${styles.wire}`}
                  pathLength={100}
                  style={at(w.t)}
                  d={w.d}
                />
              ))}
            </g>

            {/* --- 駅（小さな四角＋名前） --- */}
            {PC_STATIONS.map((s) => (
              <g key={s.label}>
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.box}`}
                  pathLength={100}
                  style={at(s.d)}
                  d={box(s.x, s.y, s.r)}
                />
                <text className={`${styles.st} ${styles.fade}`} x={s.x} y={s.ly} style={at(s.l)}>
                  {s.label}
                </text>
              </g>
            ))}

            {/* --- 節点＝人が決めるところ --- */}
            <g aria-hidden="true">
              <circle
                className={`${styles.ring} ${styles.ring1}`}
                style={at(T.cycle)}
                cx={530}
                cy={96}
                r={36}
              />
              <circle
                className={`${styles.ring} ${styles.ring2}`}
                style={at(T.cycle)}
                cx={530}
                cy={96}
                r={45}
              />
              <path
                className={`${styles.d} ${styles.node}`}
                pathLength={100}
                style={at(T.node)}
                d={PC_NODE}
              />
              <path className={styles.check} pathLength={100} style={at(T.cycle)} d={PC_CHECK} />
            </g>
            <text className={`${styles.nodeName} ${styles.fade}`} x={530} y={166} style={at(T.nodeName)}>
              人が決める
            </text>

            {/* --- 光の点（常時演出） --- */}
            <g aria-hidden="true">
              <path
                className={`${styles.spark} ${styles.sparkRun}`}
                pathLength={100}
                style={at(T.cycle)}
                d={PC_RUN}
              />
              <path
                className={`${styles.spark} ${styles.sparkExit}`}
                pathLength={100}
                style={at(T.cycle)}
                d={PC_EXIT}
              />
            </g>
          </svg>

          {/* ===== SP ===== */}
          <svg
            className={styles.svgSp}
            viewBox="0 0 420 300"
            role="img"
            aria-label={ARIA}
            preserveAspectRatio="xMidYMid meet"
          >
            <text className={`${styles.tag} ${styles.fade}`} x={186} y={34} style={at(T.tag)}>
              機械
            </text>
            <path
              className={`${styles.d} ${styles.dFast} ${styles.brace}`}
              pathLength={100}
              style={at(T.brace)}
              d={SP_BRACE}
              aria-hidden="true"
            />

            <g aria-hidden="true">
              {SP_WIRES.map((w) => (
                <path
                  key={w.d}
                  className={`${styles.d} ${w.slow ? styles.dSlow : ""} ${styles.wire}`}
                  pathLength={100}
                  style={at(w.t)}
                  d={w.d}
                />
              ))}
            </g>

            {SP_STATIONS.map((s) => (
              <g key={s.label}>
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.box}`}
                  pathLength={100}
                  style={at(s.d)}
                  d={box(s.x, s.y, s.r)}
                />
                <text className={`${styles.st} ${styles.fade}`} x={s.x} y={s.ly} style={at(s.l)}>
                  {s.label}
                </text>
              </g>
            ))}

            <g aria-hidden="true">
              <circle
                className={`${styles.ring} ${styles.ring1}`}
                style={at(T.cycle)}
                cx={150}
                cy={200}
                r={36}
              />
              <circle
                className={`${styles.ring} ${styles.ring2}`}
                style={at(T.cycle)}
                cx={150}
                cy={200}
                r={45}
              />
              <path
                className={`${styles.d} ${styles.node}`}
                pathLength={100}
                style={at(T.node)}
                d={SP_NODE}
              />
              <path className={styles.check} pathLength={100} style={at(T.cycle)} d={SP_CHECK} />
            </g>
            <text className={`${styles.nodeName} ${styles.fade}`} x={150} y={270} style={at(T.nodeName)}>
              人が決める
            </text>

            <g aria-hidden="true">
              <path
                className={`${styles.spark} ${styles.sparkRun}`}
                pathLength={100}
                style={at(T.cycle)}
                d={SP_RUN}
              />
              <path
                className={`${styles.spark} ${styles.sparkExit}`}
                pathLength={100}
                style={at(T.cycle)}
                d={SP_EXIT}
              />
            </g>
          </svg>
        </div>
      </InViewGate>
    </figure>
  );
}
