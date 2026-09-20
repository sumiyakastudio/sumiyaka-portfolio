import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import CountUp from "@/components/animation/CountUp";
import SectionMark from "@/components/fv/top-body/SectionMark";
import tb from "@/components/fv/top-body/top-body.module.css";
import { measuredCopy } from "@/data/pillars";
import { getMeasuredSummary } from "@/lib/pillarCatalog";
import styles from "./Measured.module.css";

/**
 * 02 実測（MEASURED）— **P17「トップのハブ化」(2026-09-20)**。
 *
 * 数字は2行だけ。出典は /cases と同じ data/cases.ts（lib/pillarCatalog.ts が毎回集計）＝
 * **このファイルに数字を書かない**（事例を足せばトップも自動で追従する）。
 * 文言は data/pillars.ts の measuredCopy が正本。
 *
 * 型：章番号 → 見出し＋朱の「実測」印 → 数字2行 → 注記（小さく・必ず出す）→ /cases への導線。
 * ★ 朱（#b3382b）は **トップで色を使う唯一の1点**（P17 計画書§3）。
 *   これ以外の新規要素に色を足さない（金 --color-accent も足さない）。
 * 1画面に収める（節の高さは 02 だけ PC 1画面が目標）。
 */

/** 読点で句に割る（行末に「。」だけが残るのを防ぐ）。文字は足さない・削らない */
function phrases(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if (ch === "、") {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

export default function Measured() {
  const m = getMeasuredSummary();
  const reductionMin = Number(m.reductionMin);
  const reductionMax = Number(m.reductionMax);

  return (
    <section
      id="measured"
      data-top-section="02"
      data-top-label={measuredCopy.labelEn}
      className={`${tb.section} ${tb.washDown} ${styles.section}`}
    >
      <div className={tb.inner}>
        <ScrollReveal>
          <SectionMark no="02" label={measuredCopy.labelEn} />
        </ScrollReveal>

        <div className={styles.head}>
          <h2 className={`${tb.h2} ${styles.title}`}>
            {phrases(measuredCopy.title).map((t, i) => (
              <ScrollReveal as="span" key={`${t}-${i}`} className={tb.phrase} delay={0.14 * i}>
                {t}
              </ScrollReveal>
            ))}
          </h2>

          {/* ★ 朱の落款＝トップで色を使う唯一の1点 */}
          <ScrollReveal className={styles.sealWrap} delay={0.24}>
            <span className={styles.seal} aria-hidden="true">
              <span className={styles.sealText}>{measuredCopy.seal}</span>
            </span>
          </ScrollReveal>
        </div>

        {/* 数字2行（値・件数ともデータ由来） */}
        <div className={styles.figures}>
          <ScrollReveal className={styles.row} delay={0.06}>
            <span className={styles.rowText}>
              <span className={styles.rowLabel}>{measuredCopy.humanLabel}</span>
              <span className={styles.rowNote}>{measuredCopy.humanNote}</span>
            </span>
            <span className={styles.rowFigure}>
              <span className={styles.rowValue}>
                <CountUp value={m.humanMedianMinutes} duration={1.2} delay={0.1} />
                <span className={styles.rowUnit}>分</span>
              </span>
              <span className={styles.rowCount}>（{m.humanMeasuredCount}事例）</span>
            </span>
          </ScrollReveal>

          <ScrollReveal className={styles.row} delay={0.14}>
            <span className={styles.rowText}>
              <span className={styles.rowLabel}>{measuredCopy.reductionLabel}</span>
              <span className={styles.rowNote}>{measuredCopy.reductionNote}</span>
            </span>
            <span className={styles.rowFigure}>
              <span className={styles.rowValue}>
                <CountUp value={reductionMin} decimals={1} duration={1.2} delay={0.16} />
                <span className={styles.rowRange}>〜</span>
                <CountUp value={reductionMax} decimals={1} duration={1.2} delay={0.24} />
                <span className={styles.rowUnit}>%</span>
              </span>
              <span className={styles.rowCount}>（{m.caseCount}事例）</span>
            </span>
          </ScrollReveal>
        </div>

        {/* 注記＝小さく、必ず出す（正直さの担保） */}
        <ScrollReveal as="p" className={styles.caveat} delay={0.1}>
          {measuredCopy.caveat}
        </ScrollReveal>

        <ScrollReveal as="p" className={`${tb.more} ${styles.more}`} delay={0.14}>
          <Link href={measuredCopy.href} className={tb.moreLink}>
            {measuredCopy.cta} → {measuredCopy.href}
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}
