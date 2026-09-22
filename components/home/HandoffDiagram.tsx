"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import InViewGate from "@/components/animation/InViewGate";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./HandoffDiagram.module.css";

/**
 * 「手を離すまで」＝トップ 01「何をする人か」の仕事の3段（01 現場に入る／02 仕事のやり方を
 * 教え込む／03 社員の方が回せる状態にする）を、時間の軸の上の2本の線で描く図（2026-09-22）。
 *
 * 図が言っていること＝**3段の文言が言っていることだけ**。
 *   底の横線 … 時間の軸。上を縦の点線で3つに割り、頭に mono の「01」「02」「03」だけ置く
 *              （段の題は図のすぐ上の3段にあるので図には書かない）。
 *   「私」の線 … 左端の高い位置から始まり、01 では高いまま、02 で下がり、03 の終わりで軸に着く。
 *              着地点は小さな白抜きの円＝手を離す。着いたあと線は opacity 0.35 へ静かに落ちる。
 *   「社員の方」の線 … 左端の軸から始まり、02 で上がり、03 では高いまま右端へ。右端は塗りの点。
 * 図の中の語は「私」「社員の方」「01」「02」「03」だけ（どちらも節の既存語）。
 *
 * 横軸の3区分は viewBox のちょうど 1/3 ずつ＝PC では真上の3段（3列）の続きに見える。
 *
 * 動き（画面に 18% 入ったら1回）：
 *   軸 → 区分線 → 「私」の線（左→右へ 0.9s）→ 「社員の方」の線（0.9s）→ 白抜きの円 →
 *   「私」の線だけ opacity 0.35 へ落ちる。総尺 約3.9秒。
 *   以後の常時演出＝「社員の方」の線の上だけを光の点が 5 秒周期で左→右へ流れる
 *   （動くのは周期の 1/4＝1.25 秒だけ。InViewGate で画面内かつ前面タブのときだけ running）。
 *
 * 互換：動かすのは transform(2D)・opacity・stroke-dashoffset だけ。
 *   filter / blend / 3D / SMIL / offset-path は使わない。線は pathLength="100" で正規化し、
 *   太さは vector-effect="non-scaling-stroke" で幅に依らず一定。
 *   JS 無し・SSR・prefers-reduced-motion: reduce ＝ 完成形の静止（「私」の線は 0.35 の終端値）。
 *
 * 色：トップは色を使わない（朱は 02 実測の1点だけ）。白と灰のトークンだけ。
 */

const ARIA =
  "時間の軸を01・02・03の3つに分けた図。「私」の線は左端の高い位置から始まり、02で下がり、03の終わりで軸に着く。「社員の方」の線は左端の軸から始まり、02で上がり、03では高いまま右端まで伸びる。";

/** アニメーションの開始時刻（秒）を渡す。インライン style は CSS より強いので遅延だけ上書きできる */
const at = (sec: number): CSSProperties => ({ animationDelay: `${sec}s` });

/** 入場の時刻表（秒） */
const T = {
  axis: 0,
  divider: 0.3,
  dividerStep: 0.1,
  zone: 0.42,
  zoneStep: 0.1,
  me: 0.62, // 0.9s かけて描く → 1.52 に着地
  meLabel: 0.68,
  staff: 1.48, // 0.9s かけて描く → 2.38 に右端へ
  staffLabel: 1.56,
  staffDot: 2.32,
  drop: 2.4,
  mark: 2.46, // 白抜きの円（＝手を離す）
  meDim: 2.95, // 0.9s かけて opacity 1 → 0.35
  spark: 2.5, // 常時演出の始まり（以後 5s 周期）
};

/* ---------- 版（PC＝viewBox 1000×240／SP＝420×260） ----------
   d1・d2 ＝ 3区分の境（viewBox のちょうど 1/3・2/3）。
   hi ＝ 手を動かしている高さ／lo ＝ 手を離している高さ／axis ＝ 時間の軸 */

const PC = {
  x0: 36, x1: 964, ax0: 20, ax1: 980,
  hi: 62, mid: 132, lo: 192, axis: 214, top: 42,
  d1: 333.3, d2: 666.7,
};
const SP = {
  x0: 16, x1: 398, ax0: 6, ax1: 410,
  hi: 78, mid: 148, lo: 206, axis: 230, top: 46,
  d1: 140, d2: 280,
};

type Plan = typeof PC;

/** 「私」＝高いまま（01）→ 下がる（02）→ 軸に着く（03 の終わり） */
const mePath = (p: Plan) => `M${p.x0} ${p.hi} H${p.d1} L${p.d2} ${p.mid} L${p.x1} ${p.lo}`;

/** 「社員の方」＝軸のまま（01）→ 上がる（02）→ 高いまま右端へ（03） */
const staffPath = (p: Plan) => `M${p.x0} ${p.lo} H${p.d1} L${p.d2} ${p.hi} H${p.x1}`;

const PC_ME = mePath(PC);
const PC_STAFF = staffPath(PC);
const SP_ME = mePath(SP);
const SP_STAFF = staffPath(SP);

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

  /** PC・SP で同じ順番・同じ役割の部品を描く（座標だけ差し替える） */
  const body = (p: Plan, me: string, staff: string) => (
    <>
      {/* --- 底の時間の軸 --- */}
      <path
        className={`${styles.d} ${styles.dSlow} ${styles.axis}`}
        pathLength={100}
        style={at(T.axis)}
        d={`M${p.ax0} ${p.axis} H${p.ax1}`}
      />

      {/* --- 3区分に分ける縦の点線（境は viewBox のちょうど 1/3・2/3） --- */}
      {[p.d1, p.d2].map((x, i) => (
        <path
          key={x}
          className={`${styles.fade} ${styles.divider}`}
          style={at(T.divider + i * T.dividerStep)}
          d={`M${x} ${p.top} V${p.axis}`}
        />
      ))}

      {/* --- 区分の頭の番号（段の題は図のすぐ上の3段にある＝ここには書かない） --- */}
      {[
        { t: "01", x: p.x0 },
        { t: "02", x: p.d1 + 8 },
        { t: "03", x: p.d2 + 8 },
      ].map((z, i) => (
        <text
          key={z.t}
          className={`${styles.zone} ${styles.fade}`}
          x={z.x}
          y={p.top - 18}
          style={at(T.zone + i * T.zoneStep)}
        >
          {z.t}
        </text>
      ))}

      {/* --- 「私」の線。着いたあと、この線だけ静かに落ちる（＝必要なくなる） --- */}
      <g className={styles.meGroup} style={at(T.meDim)}>
        <path
          className={`${styles.d} ${styles.dLine} ${styles.me}`}
          pathLength={100}
          style={at(T.me)}
          d={me}
        />
      </g>

      {/* --- 「社員の方」の線 --- */}
      <path
        className={`${styles.d} ${styles.dLine} ${styles.staff}`}
        pathLength={100}
        style={at(T.staff)}
        d={staff}
      />

      {/* 常時演出＝同じ線に重ねた短いダッシュを流す（offset-path を使わない） */}
      <path className={styles.spark} pathLength={100} style={at(T.spark)} d={staff} />

      {/* --- 着地点を軸へ落とす細い目盛り --- */}
      <path
        className={`${styles.d} ${styles.dFast} ${styles.drop}`}
        pathLength={100}
        style={at(T.drop)}
        d={`M${p.x1} ${p.lo + 6} V${p.axis}`}
      />

      {/* --- 手を離す＝白抜きの円／社員の方の右端＝塗りの点 --- */}
      <circle
        className={`${styles.mark} ${styles.fade}`}
        style={at(T.mark)}
        cx={p.x1}
        cy={p.lo}
        r={5.5}
      />
      <circle
        className={`${styles.dot} ${styles.fade}`}
        style={at(T.staffDot)}
        cx={p.x1}
        cy={p.hi}
        r={3.5}
      />

      {/* --- ラベル（線の始点に「私」・終点に「社員の方」） --- */}
      <text className={`${styles.label} ${styles.fade}`} x={p.x0} y={p.hi - 14} style={at(T.meLabel)}>
        私
      </text>
      <text
        className={`${styles.label} ${styles.fade}`}
        x={p.x1}
        y={p.hi - 14}
        textAnchor="end"
        style={at(T.staffLabel)}
      >
        社員の方
      </text>
    </>
  );

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
            <svg
              className={styles.svgPc}
              viewBox="0 0 1000 240"
              role="img"
              aria-label={ARIA}
              preserveAspectRatio="xMidYMid meet"
            >
              {body(PC, PC_ME, PC_STAFF)}
            </svg>

            <svg
              className={styles.svgSp}
              viewBox="0 0 420 260"
              role="img"
              aria-label={ARIA}
              preserveAspectRatio="xMidYMid meet"
            >
              {body(SP, SP_ME, SP_STAFF)}
            </svg>
          </div>
        </InViewGate>
      </div>
    </figure>
  );
}
