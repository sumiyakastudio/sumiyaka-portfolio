import Image from "next/image";
import type { CSSProperties } from "react";
import type { CaseStudy } from "@/types/case";
import { formatAfter, formatDuration, formatReduction } from "@/lib/caseCatalog";
import styles from "./CaseCard.module.css";

/**
 * 導入事例のカード（/cases）。
 *
 * 白い紙の上に、1件1色のテーマ色（data/cases.ts の accent）を点と線だけに使う。
 * 数字・文言は data/cases.ts と lib/caseCatalog.ts の整形関数だけを通す
 * （新しい数字・新しい主張をここで作らない）。
 *
 * 数字は「導入前 → 導入後 ｜ 削減率」の1行だけを文字で出す。
 * 帯グラフはサムネイル画像が持っているので、本文では描かない
 * （同じ図を2つ並べると同じ情報が二重に出る＝2026-09-16 撮影QCの指摘）。
 * 動きは付けない（iOS/WebKit で確実に読めることを優先）。
 */

export default function CaseCard({ item }: { item: CaseStudy }) {
  const beforeLabel = `導入前 ${formatDuration(item.before)}（見積）`;
  const afterLabel = `導入後 ${formatAfter(item)}`;

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
          <span className={styles.rule} aria-hidden="true" />
        </p>

        <h3 className={styles.title}>{item.title}</h3>
        <p className={styles.titleEn}>{item.titleEn}</p>
        <p className={styles.headline}>{item.headline}</p>

        {/* 導入前→導入後→削減率。図（帯）はサムネが持っているので、ここは数字の1行だけ
            （同じ図を本文でもう一度描くと、同じ情報が二重に出る） */}
        <p className={styles.metrics}>
          <span className={styles.metricPart}>{beforeLabel}</span>
          <span className={styles.metricArrow} aria-hidden="true">
            {" → "}
          </span>
          <span className={styles.metricPart}>{afterLabel}</span>
          <span className={styles.metricSep} aria-hidden="true">
            {" ｜ "}
          </span>
          <span className={`${styles.metricPart} ${styles.metricReduction}`}>
            削減率{" "}
            <strong className={styles.metricValue}>−{formatReduction(item.reduction)}</strong>
          </span>
        </p>

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
