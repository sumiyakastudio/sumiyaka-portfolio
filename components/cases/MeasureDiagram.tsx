"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CaseStudy } from "@/types/case";
import { formatDuration, formatReduction } from "@/lib/caseCatalog";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import CountUp from "./CountUp";
import styles from "./MeasureDiagram.module.css";

/**
 * 「数字の測り方」の図（/cases）。
 *
 * ◆ 何を見せるか
 *   このページの数字が何と何を比べたものか＝測り方そのものを1枚で見せる。
 *     上段＝導入前（見積）…… 破線の輪郭＋斜線。長さは手作業の見積
 *     下段＝導入後（実測）…… 人の手（塗り）＋AIの稼働（輪郭）。端に朱の「実測」印
 *     寸法線 …… 2段の差＝削減率にあたる区間
 *     拡大窓 …… 下段は上段の 1/16 ほどしかないので、下段だけ時間軸を引き伸ばす
 *     式 …… 1 −（人の手＋AIの稼働）÷ 導入前 ＝ 削減率
 *
 * ◆ 数字は実在の1事例の実測値だけ。ハードコードはしない（data/cases.ts → lib の整形関数）。
 *   事例の選び方は CasesFV の代表と同じ（6選のうち手作業との差が最も大きいもの）。
 *   ただし図は「人の手／AIの稼働」に分かれるので、人の時間が分けて計測できている事例に限る。
 *   文言は既存の語だけ（導入前・導入後・見積・実測・人の手・AIの稼働・削減率）。
 *
 * ◆ 互換：動きは transform（2D）と opacity だけ。filter・backdrop-filter のアニメ・
 *   mix-blend-mode・3D transform・SMIL・offset-path・vw は使わない。
 *   棒は「紙色の幕（curtain）を transform: scaleX() で右へ畳む」ことで引かれる
 *   （棒そのものを scaleX すると破線と枠線が横に伸びて歪むため）。
 * ◆ JS が無い環境・prefers-reduced-motion では data-phase="static" のまま＝完成形を静止表示。
 *   入場は「armed（初期値を置く）→ play（アニメ）」の2段。命令的にクラスを足さず state で持つ。
 * ◆ ScrollReveal では包まない（この図は自前の入場を持つ＝transform の二重掛けを避ける）。
 */

/** 時間軸の目盛り（位置％・値は書かない＝数字は棒の側に置く） */
const AXIS_TICKS = [0, 25, 50, 75, 100];

/** 導入後の棒が短すぎて消えないための下限（％）。拡大窓が本体なのでごく小さく取る */
const MIN_AFTER_PCT = 1.6;

/** 式の数字が立ち上がり始める時刻（ms）＝寸法線が引かれたあと */
const COUNT_AT_MS = 2560;

/** 導入後の合計（人＋AI）。棒の比率にだけ使う */
function afterTotal(c: CaseStudy): number {
  return c.after.ai.minutes + (c.after.human?.minutes ?? 0);
}

/**
 * 図に使う1件。CasesFV.pickRepresentative と同じ選び方（6選のうち差が最大）を、
 * 「人の時間が分けて計測できている事例」の中で行う。事例を足し引きしても自動で決まる。
 */
function pickCase(cases: CaseStudy[]): CaseStudy | null {
  const split = cases.filter((c) => c.after.human !== null && c.before.minutes > 0);
  if (split.length === 0) return null;
  const pool = split.filter((c) => c.isPickUp);
  const src = pool.length > 0 ? pool : split;
  return src.reduce(
    (best, c) =>
      c.before.minutes - afterTotal(c) > best.before.minutes - afterTotal(best) ? c : best,
    src[0]
  );
}

type Phase = "static" | "armed" | "play";

export default function MeasureDiagram({ cases }: { cases: CaseStudy[] }) {
  const rootRef = useRef<HTMLElement>(null);
  const timerRef = useRef<number | null>(null);
  // 入場を仕込んでよいか。サーバーと「動きを抑える」設定では false＝SSR が描いた完成形のまま。
  // effect 内の同期 setState を避けるため、共通フック（useSyncExternalStore）から読む
  const allowed = useMotionAllowed();
  const [played, setPlayed] = useState(false);
  const [counting, setCounting] = useState(false);
  const phase: Phase = !allowed ? "static" : played ? "play" : "armed";

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !allowed) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        setPlayed(true);
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          setCounting(true);
        }, COUNT_AT_MS);
      },
      { threshold: 0.3 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [allowed]);

  const item = pickCase(cases);
  const human = item?.after.human ?? null;
  if (!item || !human) return null;

  const total = human.minutes + item.after.ai.minutes;
  const afterPct = Math.max(MIN_AFTER_PCT, (total / item.before.minutes) * 100);
  const humanPct = (human.minutes / total) * 100;

  const beforeText = formatDuration(item.before);
  const humanText = formatDuration(human);
  const aiText = formatDuration(item.after.ai);
  const reductionText = formatReduction(item.reduction);

  const ariaLabel =
    `導入前は手作業の見積${beforeText}、` +
    `導入後は人の手${humanText}とAIの稼働${aiText}の実測。` +
    `削減率${reductionText}`;

  return (
    <figure
      ref={rootRef}
      data-measure-diagram=""
      data-phase={phase}
      className={styles.fig}
    >
      <figcaption className={styles.cap}>導入前（見積）と導入後（実測）</figcaption>

      <div
        className={styles.plot}
        role="img"
        aria-label={ariaLabel}
        style={
          {
            "--after": `${afterPct.toFixed(2)}%`,
            "--human": `${humanPct.toFixed(2)}%`,
          } as CSSProperties
        }
      >
        {/* ---- ① 共通の時間軸 ---- */}
        <div className={styles.axis} aria-hidden="true">
          <span className={styles.axisLine} />
          {AXIS_TICKS.map((p) => (
            <span key={p} className={styles.axisTick} style={{ left: `${p}%` }} />
          ))}
        </div>

        {/* ---- ② 導入前＝見積（破線の輪郭＋斜線） ---- */}
        <p className={styles.head}>
          <span className={styles.label}>導入前</span>
          <span className={styles.value}>
            <span className={styles.num}>{beforeText}</span>
            <span className={styles.chip}>見積</span>
          </span>
        </p>
        <div className={styles.beforeBar} aria-hidden="true">
          <span className={styles.hatch} />
          <span className={`${styles.curtain} ${styles.curtainBefore}`} />
        </div>

        {/* ---- ③ 寸法線＝2段の差 ---- */}
        <div className={styles.bracket} aria-hidden="true">
          <span className={styles.bracketLabel}>削減率</span>
          <span className={styles.bracketLine} />
          <span className={`${styles.bracketTick} ${styles.bracketTickL}`} />
          <span className={`${styles.bracketTick} ${styles.bracketTickR}`} />
        </div>

        {/* ---- ④ 導入後＝実測（人の手＋AIの稼働） ---- */}
        <p className={`${styles.head} ${styles.headAfter}`}>
          <span className={styles.label}>導入後</span>
        </p>
        <div className={styles.afterRow}>
          <div className={styles.afterBar} aria-hidden="true">
            <span className={styles.segHuman} />
            <span className={styles.segAi} />
            <span className={`${styles.curtain} ${styles.curtainAfter}`} />
          </div>
          <span className={styles.seal} aria-hidden="true">
            <span className={styles.sealText}>実測</span>
          </span>
        </div>

        {/* ---- ⑤ 拡大窓＝導入後だけ時間軸を引き伸ばす ---- */}
        <div className={styles.cone} aria-hidden="true">
          <svg
            className={styles.coneSvg}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            focusable="false"
            aria-hidden="true"
          >
            <polygon
              className={styles.conePoly}
              points={`0,0 ${afterPct.toFixed(2)},0 100,100 0,100`}
            />
          </svg>
        </div>
        <div className={styles.zoom}>
          <div className={styles.zoomBar}>
            <span className={styles.zHuman}>
              <span className={styles.zText}>人の手 {humanText}</span>
            </span>
            <span className={styles.zAi}>
              <span className={styles.zText}>AIの稼働 {aiText}</span>
            </span>
            <span className={`${styles.curtain} ${styles.curtainZoom}`} />
          </div>
          {/* 狭い画面では棒の中に入らないので下へ逃がす（CSS で出し分け） */}
          <p className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={`${styles.swatch} ${styles.swatchHuman}`} />
              人の手 {humanText}
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.swatch} ${styles.swatchAi}`} />
              AIの稼働 {aiText}
            </span>
          </p>
        </div>
      </div>

      {/* ---- 式＝その事例の実数で計算が追える ---- */}
      <p className={styles.formula}>
        <span className={styles.fTerm}>削減率</span>
        <span className={styles.fOp}>＝</span>
        <span className={styles.fTerm}>1</span>
        <span className={styles.fOp}>−</span>
        <span className={styles.fTerm}>
          （人の手 {humanText} ＋ AIの稼働 {aiText}）
        </span>
        <span className={styles.fOp}>÷</span>
        <span className={styles.fTerm}>導入前 {beforeText}</span>
        <span className={styles.fOp}>＝</span>
        <strong className={styles.fValue}>
          {counting ? (
            <CountUp kind="percent" value={item.reduction} className={styles.fNum} />
          ) : (
            <span className={styles.fNum}>{reductionText}</span>
          )}
        </strong>
      </p>

      {/* ---- どの事例の数字か ---- */}
      <p className={styles.source}>
        <a className={styles.sourceLink} href={`#${item.slug}`}>
          {item.title}
        </a>
        <span className={styles.sourceSep} aria-hidden="true">
          ／
        </span>
        <span className={styles.sourceUnit}>{item.unit}</span>
      </p>
    </figure>
  );
}
