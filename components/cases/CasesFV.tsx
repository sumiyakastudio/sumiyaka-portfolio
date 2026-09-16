import type { CSSProperties } from "react";
import type { CaseStudy, FdeIntro } from "@/types/case";
import styles from "./CasesFV.module.css";

/**
 * /cases の FV（SubPageFVAnim の中に置く＝収縮と位相は共通の舞台が持つ）。
 *
 * 演出＝「導入前の長い帯が、導入後の短い帯へ縮む」。
 * 帯の本数は事例の件数、縮んだ先の長さは各事例の (AI＋人)÷導入前。
 * 数字は data/cases.ts から計算した比率だけで、新しい数字は作らない。
 * 帯は装飾（aria-hidden）＝同じ内容は一覧のカードで文字として読める。
 *
 * 実装は CSS アニメーション（transform: scaleX と opacity）のみ。
 * JS は持たない／filter・blend・3D・vw フォントは使わない（iOS/WebKit 安全）。
 * prefers-reduced-motion では終端値を即置きする。
 */
export default function CasesFV({
  intro,
  cases,
}: {
  intro: FdeIntro;
  cases: CaseStudy[];
}) {
  const bars = cases.map((c) => {
    const after = c.after.ai.minutes + (c.after.human?.minutes ?? 0);
    const raw = c.before.minutes > 0 ? after / c.before.minutes : 0;
    return { slug: c.slug, ratio: Math.min(1, Math.max(0, raw)) };
  });

  return (
    <div className={styles.fvInner}>
      <p className={styles.eyebrow}>
        <span className={styles.eyebrowNo}>{intro.eyebrow}</span>
        <span className={styles.eyebrowRule} aria-hidden="true" />
        <span className={styles.eyebrowEn}>{intro.titleEn}</span>
      </p>

      <h1 className={styles.title}>{intro.title}</h1>
      <p className={styles.tagline}>{intro.tagline}</p>
      <p className={styles.count}>{cases.length} CASES</p>

      <div className={styles.chart} data-fv-depth="0.5">
        <ul className={styles.bars} aria-hidden="true">
          {bars.map((b, i) => (
            <li key={b.slug} className={styles.bar}>
              <span
                className={styles.barTrack}
                style={{ "--case-ratio": b.ratio, "--case-i": i } as CSSProperties}
              >
                <span className={styles.barFill} />
              </span>
            </li>
          ))}
        </ul>
        {/* 帯が何を表すかは、この1行で常に読める（灰と墨の区別が付かないのを防ぐ） */}
        <p className={styles.legend}>
          <span className={styles.legendItem}>薄い帯＝導入前（手作業・見積）</span>
          <span className={styles.legendSep} aria-hidden="true">／</span>
          <span className={styles.legendItem}>濃い帯＝導入後（人の時間＋AIの稼働）</span>
        </p>
      </div>
    </div>
  );
}
