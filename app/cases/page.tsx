import type { Metadata } from "next";
import Link from "next/link";
import SubPageFVAnim from "@/components/animation/SubPageFVAnim";
import ScrollReveal from "@/components/animation/ScrollReveal";
import CasesFV from "@/components/cases/CasesFV";
import CaseCard from "@/components/cases/CaseCard";
import HashLanding from "@/components/cases/HashLanding";
import { getAllCases, getFdeIntro } from "@/lib/caseCatalog";
import { SITE_ORIGIN } from "@/lib/site";
import styles from "./page.module.css";

/**
 * /cases — FDE事業（導入事例）の一覧。
 *
 * 地＝「墨の館に置かれた白い紙」（/tools の各ツールページと同じ型）。
 * 数字が読めることが第一なので、演出は FV の帯だけに留める。
 *
 * ⚠ 文言・数字は data/cases.ts と lib/caseCatalog.ts だけを通す。
 *   件数もここでハードコードしない（事例を足せば自動で追従する）。
 * ⚠ 開示の線＝数字と業務の名前まで。仕組みは書かない。
 */

const intro = getFdeIntro();
const caseCount = getAllCases().length;

export const metadata: Metadata = {
  title: "FDE事業 導入事例 ｜ 墨家 / SUMIYAKA — 灯敷（AKASHIKI）",
  description:
    "FDE（Forward Deployed Engineer）は、ツールを納めて終わりにしない技術者です。御社の現場に入り、仕事のやり方をAIに教え込みます。実際の業務で計測した導入事例" +
    `${caseCount}件。`,
  alternates: { canonical: "/cases" },
  openGraph: {
    // 1200×630。数字カードの型（紙色の地に業務名と削減率）
    images: [{ url: "/cases/og.jpg", width: 1200, height: 630 }],
  },
};

export default function CasesPage() {
  const all = getAllCases();
  // 6選（トップの枠に出している事例）を先に、残りを後に。どちらも order 順
  const ordered = [...all.filter((c) => c.isPickUp), ...all.filter((c) => !c.isPickUp)];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${intro.title} 導入事例`,
    description: intro.explain,
    numberOfItems: all.length,
    itemListElement: ordered.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.title,
      url: `${SITE_ORIGIN}/cases#${c.slug}`,
    })),
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* /cases#slug への着地。読み込み直後はページ高が足りず標準のハッシュ移動が
          空振りするため、レイアウトが落ち着いてから移動する（描画物なし） */}
      <HashLanding slugs={all.map((c) => c.slug)} />

      {/* ============ FV ============ */}
      <SubPageFVAnim className={styles.fv} customEntrance>
        <CasesFV intro={intro} cases={all} />
      </SubPageFVAnim>

      {/* ============ FDE の説明＋測り方の帯 ============ */}
      <section className={styles.lead} aria-label="FDE事業について">
        <div className={styles.leadInner}>
          <ScrollReveal>
            <p className={styles.leadBody}>{intro.explain}</p>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <div className={styles.measured}>
              <p className={styles.measuredLabel}>数字の測り方</p>
              <p className={styles.measuredText}>{intro.measured}</p>
              <p className={styles.measuredText}>{intro.deployedIn}</p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ============ 事例の一覧 ============ */}
      <section className={styles.list} aria-label="導入事例の一覧">
        <div className={styles.listInner}>
          <div className={styles.listHead}>
            <h2 className={styles.listTitle}>導入事例</h2>
            <span className={styles.listCount}>
              {caseCount} CASE{caseCount > 1 ? "S" : ""}
            </span>
          </div>

          <ul className={styles.cards}>
            {ordered.map((c, i) => (
              <ScrollReveal
                as="li"
                key={c.slug}
                className={styles.cardItem}
                delay={(i % 3) * 0.08}
              >
                <CaseCard item={c} />
              </ScrollReveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ============ 末尾＝測り方の再掲と導線 ============ */}
      <section className={styles.closing} aria-label="ご相談">
        <div className={styles.closingInner}>
          <p className={styles.closingNote}>{intro.measured}</p>

          <ScrollReveal>
            <p className={styles.closingLead}>
              同じやり方が御社の業務で効くかどうかは、業務の形を見ないと分かりません。
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <div className={styles.ctas}>
              <Link href="/contact" className={styles.ctaPrimary}>
                まず現場の話から
                <span className={styles.ctaArrow} aria-hidden="true">
                  →
                </span>
              </Link>
              <Link href="/service" className={styles.ctaSecondary}>
                進め方と料金の考え方
                <span className={styles.ctaArrow} aria-hidden="true">
                  →
                </span>
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </main>
  );
}
