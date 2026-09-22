"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import InViewGate from "@/components/animation/InViewGate";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./ScopeDiagram.module.css";

/**
 * /about 05 SCOPE OF WORK ＝「途中で担当が変わることはありません」（2026-09-22・図解の憲法 §8-B）
 *
 * /about の世界観（濃＝墨）に合わせ、線画（ストローク）だけで描く。金は使わない。
 *   一本の横線に5つの駅＝「企画」「設計」「実装」「教育」「公開」（この5語は節の既存語）。
 *   線の上を1つの点（＝「私」）が左から右へ進み、駅を通るたびその駅がふっと明るくなる。
 *   ＝担当が入れ替わらない（線が一本・点が一つ）ことだけを描く図。
 *
 * 動き（画面に入ったら1回）：
 *   ①線が左→右へ引かれる（0.8s）→ ②「私」の引き出しと文字 → ③5つの駅が 0.1s 刻みで現れる →
 *   ④1.5s から点が 企画→公開 へ 2.22s で進む。総尺 約3.7秒。
 *   以後の常時演出＝同じ動き（点が 6 秒周期で 企画→公開 を進み、右端で消えて左端から出直す）。
 *   入場の1周目がそのまま常時演出の1周目＝点は1つだけ（二重に出さない）。
 *   InViewGate で画面内かつ前面タブのときだけ running（CSS の既定は animation-play-state: paused）。
 *
 * 互換：動かすのは transform(2D)・opacity・stroke-dashoffset のみ。
 *   filter / blend / 3D / SMIL / offset-path は使わない。点の移動は「線に重ねた短いダッシュを
 *   stroke-dashoffset で流す」方式。線は pathLength="100" で正規化し、太さは
 *   vector-effect="non-scaling-stroke" で幅に依らず一定（点だけは駅の円と同じ比率で縮めたいので除く）。
 *   JS 無し・prefers-reduced-motion: reduce ＝ 完成形の静止表示（点は消えたまま）。
 */

const ARIA =
  "企画・設計・実装・教育・公開の5つの工程が一本の線でつながり、私を表す1つの点が左から右へ一度も途切れずに進む図。";

/** アニメーションの開始時刻（秒）を渡す。インライン style は CSS より強いので遅延だけ上書きできる */
const at = (sec: number): CSSProperties => ({ animationDelay: `${sec}s` });

/** 駅＝節の既存語だけ（新しい言い回しを図の中で発明しない） */
const STATIONS = ["企画", "設計", "実装", "教育", "公開"] as const;

/** 入場と周期の時刻表（秒／割合） */
const T = {
  rail: 0, // 一本の線が引かれる（dSlow＝0.8s）
  tick: 0.52, // 「私」の引き出し線
  me: 0.64, // 「私」の文字
  station: 0.8, // 駅の円（0.1s 刻み）
  stationStep: 0.1,
  label: 0.9, // 駅名（円の 0.1s 後）
  loop: 1.5, // 点が動き出す＝常時演出の1周目の開始
  cycle: 6, // 常時演出の周期（秒）
  travel: 0.37, // 1周のうち点が走る割合（6s × 0.37 ＝ 2.22s）
};

/** 駅 i に点が着く時刻（＝その駅が明るくなる時刻） */
const flashAt = (i: number) =>
  Math.round((T.loop + (i / (STATIONS.length - 1)) * T.travel * T.cycle) * 1000) / 1000;

type Geo = {
  /** viewBox の幅・高さ */
  w: number;
  h: number;
  /** 5つの駅の x */
  x: readonly [number, number, number, number, number];
  /** 線の y */
  rail: number;
  /** 「私」のベースライン */
  me: number;
  /** 「私」の引き出し線（上→下） */
  tick: readonly [number, number];
  /** 駅名のベースライン */
  label: number;
};

/* PC＝右カラム 416px を除いた左の空き（1080 − 416 − 48 ＝ 616px）にちょうど収まる幅 */
const PC: Geo = {
  w: 620,
  h: 150,
  x: [50, 180, 310, 440, 570],
  rail: 80,
  me: 44,
  tick: [52, 68],
  label: 110,
};

/* SP＝同じ構造のまま間隔だけ詰める（縮小ではなく組み替え） */
const SP: Geo = {
  w: 420,
  h: 170,
  x: [38, 124, 210, 296, 382],
  rail: 96,
  me: 52,
  tick: [62, 82],
  label: 132,
};

function Plot({ geo, svgClass }: { geo: Geo; svgClass: string }) {
  const rail = `M${geo.x[0]} ${geo.rail} H${geo.x[4]}`;

  return (
    <svg
      className={svgClass}
      viewBox={`0 0 ${geo.w} ${geo.h}`}
      role="img"
      aria-label={ARIA}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* --- 一本の線（企画から公開まで途切れない） --- */}
      <path
        className={`${styles.d} ${styles.dSlow} ${styles.rail}`}
        pathLength={100}
        style={at(T.rail)}
        d={rail}
      />

      {/* --- 「私」＝線の始点の上 --- */}
      <path
        className={`${styles.d} ${styles.dFast} ${styles.tick}`}
        pathLength={100}
        style={at(T.tick)}
        d={`M${geo.x[0]} ${geo.tick[0]} V${geo.tick[1]}`}
        aria-hidden="true"
      />
      <text className={`${styles.me} ${styles.fade}`} x={geo.x[0]} y={geo.me} style={at(T.me)}>
        私
      </text>

      {/* --- 5つの駅 --- */}
      {STATIONS.map((name, i) => (
        <g key={name}>
          <circle
            className={`${styles.station} ${styles.fade}`}
            style={at(T.station + i * T.stationStep)}
            cx={geo.x[i]}
            cy={geo.rail}
            r={4}
          />
          <text
            className={`${styles.label} ${styles.fade}`}
            style={at(T.label + i * T.stationStep)}
            x={geo.x[i]}
            y={geo.label}
          >
            {name}
          </text>
          {/* 点が通ったときだけ、ふっと明るくなる（周期のうち 0.6 秒だけ） */}
          <circle
            className={styles.halo}
            style={at(flashAt(i))}
            cx={geo.x[i]}
            cy={geo.rail}
            r={8.5}
            aria-hidden="true"
          />
          <circle
            className={styles.flash}
            style={at(flashAt(i))}
            cx={geo.x[i]}
            cy={geo.rail}
            r={4}
            aria-hidden="true"
          />
        </g>
      ))}

      {/* --- 「私」の点＝同じ線に重ねた短いダッシュを流す（offset-path 不使用） --- */}
      <path
        className={styles.runner}
        pathLength={100}
        style={at(T.loop)}
        d={rail}
        aria-hidden="true"
      />
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

      {/* 常時演出（点・駅の明滅）の器：画面内のあいだだけ running。className は不変にしておく
          （state 由来のクラスを同じ要素に載せると、再レンダーで .live が消える） */}
      <InViewGate className={styles.gate} activeClassName={styles.live} threshold={0.1}>
        <div ref={ref} className={stageClass}>
          <Plot geo={PC} svgClass={styles.svgPc} />
          <Plot geo={SP} svgClass={styles.svgSp} />
        </div>
      </InViewGate>
    </figure>
  );
}
