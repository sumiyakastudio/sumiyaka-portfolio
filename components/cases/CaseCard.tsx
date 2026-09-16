import Image from "next/image";
import type { CSSProperties } from "react";
import type { CaseStudy } from "@/types/case";
import { formatDuration } from "@/lib/caseCatalog";
import CountUp from "./CountUp";
import styles from "./CaseCard.module.css";

/**
 * 導入事例のカード（/cases）。
 *
 * 白い紙の上に、1件1色のテーマ色（data/cases.ts の accent）を点と線だけに使う。
 * 数字・文言は data/cases.ts と lib/caseCatalog.ts の整形関数だけを通す
 * （新しい数字・新しい主張をここで作らない）。
 *
 * 数字は「導入前／導入後／削減率」の3行。導入後と削減率は、画面に入った時に
 * 一度だけ立ち上がる（CountUp＝終わりは正本の整形関数と一字一句同じ）。
 * 帯グラフはサムネイル画像と FV が持っているので、本文では描かない
 * （同じ図を2つ並べると同じ情報が二重に出る＝2026-09-16 撮影QCの指摘）。
 *
 * サムネはホバーでゆっくりパンする（transform のみ・マウスのある端末だけ）。
 * 互換：filter・backdrop-filter のアニメ・mix-blend-mode・3D transform は使わない。
 */

export default function CaseCard({ item }: { item: CaseStudy }) {
  const human = item.after.human;

  return (
    <article
      id={item.slug}
      className={styles.card}
      style={{ "--case-accent": item.accent } as CSSProperties}
    >
      <div className={styles.thumb}>
        <Image
          src={item.thumbnail}
          alt={`${item.title}｜導入前と導入後の比較`}
          fill
          sizes="(max-width: 767px) 92vw, (max-width: 1399px) 46vw, 420px"
          className={styles.thumbImg}
        />
      </div>

      <div className={styles.body}>
        <p className={styles.head}>
          <span className={styles.no}>{item.no}</span>
          {item.isPickUp ? <span className={styles.pickUp}>PICK UP</span> : null}
          <span className={styles.rule} aria-hidden="true" />
        </p>

        <h3 className={styles.title}>{item.title}</h3>
        <p className={styles.titleEn}>{item.titleEn}</p>
        <p className={styles.headline}>{item.headline}</p>

        {/* 導入前／導入後／削減率。図（帯）はサムネと FV が持っているので、ここは数字だけ */}
        <div className={styles.metrics}>
          <p className={styles.metricRow}>
            <span className={styles.metricLabel}>導入前</span>
            <span className={styles.metricBefore}>
              {formatDuration(item.before)}（見積）
            </span>
          </p>

          <p className={styles.metricRow}>
            <span className={styles.metricLabel}>導入後</span>
            <span className={styles.metricAfter}>
              {human ? (
                <>
                  人 <CountUp kind="minutes" value={human.minutes} display={human.display} />
                  （AI{" "}
                  <CountUp
                    kind="minutes"
                    value={item.after.ai.minutes}
                    display={item.after.ai.display}
                  />
                  ）
                </>
              ) : (
                <>
                  <CountUp
                    kind="minutes"
                    value={item.after.ai.minutes}
                    display={item.after.ai.display}
                  />
                  （AIが動いた時間）
                </>
              )}
            </span>
          </p>

          <p className={`${styles.metricRow} ${styles.metricRowBig}`}>
            <span className={styles.metricLabel}>削減率</span>
            <strong className={styles.metricValue}>
              <span className={styles.metricMinus}>−</span>
              <CountUp
                kind="percent"
                value={item.reduction}
                className={styles.metricNumber}
              />
            </strong>
          </p>
        </div>

        {item.reductionNote ? (
          <p className={styles.reductionNote}>※ {item.reductionNote}</p>
        ) : null}

        <dl className={styles.meta}>
          <dt className={styles.metaLabel}>計測の単位</dt>
          <dd className={styles.metaValue}>{item.unit}</dd>
          <dt className={styles.metaLabel}>どんな仕事か</dt>
          <dd className={styles.metaValue}>{item.task}</dd>
        </dl>

        {/* 詳細＝ネイティブの開閉（JS なしで開く・検索と読み上げは常に全文が対象） */}
        <details className={styles.details}>
          <summary className={styles.summary}>
            <span className={styles.summaryLine} aria-hidden="true" />
            <span className={styles.summaryLabel}>導入前と導入後を詳しく</span>
            <span className={styles.summaryMark} aria-hidden="true">
              <span className={styles.summaryMarkH} />
              <span className={styles.summaryMarkV} />
            </span>
          </summary>
          <div className={styles.detailsBody}>
            <dl className={styles.story}>
              <dt className={styles.storyLabel}>導入前</dt>
              <dd className={styles.storyText}>{item.story.before}</dd>
              <dt className={styles.storyLabel}>導入後</dt>
              <dd className={styles.storyText}>{item.story.after}</dd>
              <dt className={styles.storyLabel}>人の判断が残る箇所</dt>
              <dd className={styles.storyText}>{item.humanKeeps}</dd>
              <dt className={`${styles.storyLabel} ${styles.storyLabelCaveat}`}>注意</dt>
              <dd className={`${styles.storyText} ${styles.storyTextCaveat}`}>{item.caveat}</dd>
            </dl>
          </div>
        </details>
      </div>
    </article>
  );
}
