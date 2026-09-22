import type { Metadata } from "next";
import Link from "next/link";
import SubPageFVAnim from "@/components/animation/SubPageFVAnim";
import ScrollReveal from "@/components/animation/ScrollReveal";
import CasesFV from "@/components/cases/CasesFV";
import CaseCard from "@/components/cases/CaseCard";
import MeasureDiagram from "@/components/cases/MeasureDiagram";
import DecideDiagram from "@/components/cases/DecideDiagram";
import HashLanding from "@/components/cases/HashLanding";
import PhotoFigure from "@/components/photo/PhotoFigure";
import { observePhoto, reviewPhoto } from "@/data/photos";
import { getAllCases, getFdeIntro } from "@/lib/caseCatalog";
import { SITE_ORIGIN } from "@/lib/site";
import styles from "./page.module.css";

/**
 * /cases — FDE（Forward Deployed Engineer）の導入事例。
 *
 * ページ名は「FDE」（2026-09-16 あおきさん指示。ナビにも FDE で並ぶ）。
 * 地＝「墨の館に置かれた白い紙」（/tools の各ツールページと同じ型）。
 * FV だけ「暖黒の現場に灯が入り、紙色へ転調する」＝ページ名の意味そのものを見せる。
 *
 * ⚠ 文言・数字は data/cases.ts と lib/caseCatalog.ts だけを通す。
 *   件数もここでハードコードしない（事例を足せば自動で追従する）。
 * ⚠ 開示の線＝数字と業務の名前まで。仕組みは書かない。
 *
 * 本人写真は2枚だけ（ロードマップ 4-13・契約＝data/photos.ts）。
 *   C-2 observePhoto … 「FDEとは」の右（PC は2カラム・写真の上端を h2 の上端にそろえる）
 *   C-5 reviewPhoto  … 「人が決めるところ」の見出しの右に1枚だけ
 * 紙の地なので額は tone="paper"（沈み込みなし・髪の毛ほどの縁）。
 */

const intro = getFdeIntro();
const caseCount = getAllCases().length;

/** C-2 の実表示幅。PC＝右カラム 414px から額のオフセット罫ぶん 14px を引いた 400px。
 *  1023px 以下は版面いっぱい（上限 560px＝左右 20px 余白で 600px から頭打ち） */
const LEAD_PHOTO_SIZES = "(min-width: 1024px) 400px, (min-width: 600px) 560px, calc(100vw - 40px)";

/** C-5 の実表示幅。PC＝見出し帯の右端に 320px。1023px 以下は上限 480px（2026-09-22 あおき指示で拡大） */
const KEEPS_PHOTO_SIZES = "(min-width: 1024px) 320px, (min-width: 520px) 480px, calc(100vw - 40px)";

export const metadata: Metadata = {
  // 型は /tools・/works・/about と同じ「{ページ名} — AKASHIKI | {日本語}」
  title: `${intro.pageTitle} — AKASHIKI | ${intro.title} 導入事例`,
  description: `${intro.explain}実際の業務で計測した導入事例${caseCount}件。`,
  alternates: { canonical: "/cases" },
  openGraph: {
    // 1200×630。数字カードの型（紙色の地に業務名と削減率）
    images: [{ url: "/cases/og-3.jpg", width: 1200, height: 630 }],
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

      {/* ============ FDEとは＝説明＋仕事の3段 ============ */}
      <section className={styles.lead} aria-label="FDEとは">
        <div className={styles.leadInner}>
          {/* PC は2カラム（左＝言葉／右＝観察の写真）。1023px 以下は縦積み */}
          <div className={styles.leadGrid}>
            <div className={styles.leadText}>
              <ScrollReveal>
                <p className={styles.leadEyebrow}>{intro.pageTitleEn}</p>
                <h2 className={styles.leadTitle}>FDEとは</h2>
              </ScrollReveal>

              <ScrollReveal delay={0.06}>
                <p className={styles.leadBody}>{intro.explain}</p>
              </ScrollReveal>

              {/* 結びの1文＝少し目立たせる（2026-09-16 あおきさん指示） */}
              <ScrollReveal delay={0.12}>
                <p className={styles.leadClose}>
                  <span className={styles.leadCloseRule} aria-hidden="true" />
                  {intro.closing}
                </p>
              </ScrollReveal>
            </div>

            {/* 文字が先・絵が後（入場は ScrollReveal 側だけに持たせる） */}
            <ScrollReveal className={styles.leadPhoto} delay={0.18}>
              <PhotoFigure photo={observePhoto} sizes={LEAD_PHOTO_SIZES} tone="paper" />
            </ScrollReveal>
          </div>

          <ol className={styles.steps}>
            {intro.steps.map((s, i) => (
              <ScrollReveal
                as="li"
                key={s.no}
                className={styles.step}
                delay={0.12 + i * 0.08}
              >
                <p className={styles.stepNo}>{s.no}</p>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepBody}>{s.body}</p>
              </ScrollReveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ============ 数字の測り方（朱の「実測」印） ============ */}
      <section className={styles.measure} aria-label="数字の測り方">
        <div className={styles.measureInner}>
          <ScrollReveal>
            <div className={styles.measured}>
              <span className={styles.seal} aria-hidden="true">
                <span className={styles.sealText}>実測</span>
              </span>
              <p className={styles.measuredLabel}>数字の測り方</p>
              <p className={styles.measuredText}>{intro.measured}</p>
              <p className={styles.measuredText}>{intro.deployedIn}</p>
            </div>
          </ScrollReveal>

          {/* 測り方そのものを1枚で見せる図（数字は data/cases.ts の1事例の実測値）。
              自前の入場を持つので ScrollReveal では包まない（transform の二重掛けを避ける） */}
          <MeasureDiagram cases={all} />
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

      {/* ============ 人が決めるところ（12件ぶん・正直さの根拠） ============ */}
      <section className={styles.keeps} aria-label="人が決めるところ">
        <div className={styles.keepsInner}>
          {/* PC は2列（左＝見出し行／その下に図・右＝写真が2行を縦断）。
              1023px 以下は DOM の順のまま縦に積む＝見出し行→図→写真→一覧 */}
          <div className={styles.keepsHead}>
            <div className={styles.keepsTitleRow}>
              <h2 className={styles.keepsTitle}>人が決めるところ</h2>
              <span className={styles.keepsCount}>
                {caseCount} CASE{caseCount > 1 ? "S" : ""}
              </span>
            </div>

            {/* 「機械が出し、人が決める」の図。自前の入場を持つので ScrollReveal では包まない
                （transform の二重掛けを避ける） */}
            <div className={styles.keepsFigure}>
              <DecideDiagram />
            </div>

            {/* 最終確認の1枚。PC は見出し帯の右端・1023px 以下は見出しの下へ回り込む */}
            <ScrollReveal className={styles.keepsPhoto} delay={0.12}>
              <PhotoFigure photo={reviewPhoto} sizes={KEEPS_PHOTO_SIZES} tone="paper" />
            </ScrollReveal>
          </div>

          <ul className={styles.keepsList}>
            {ordered.map((c, i) => (
              <ScrollReveal
                as="li"
                key={c.slug}
                className={styles.keepItem}
                delay={(i % 2) * 0.06}
              >
                <p className={styles.keepName}>
                  <span className={styles.keepNo}>{c.no}</span>
                  {c.title}
                </p>
                <p className={styles.keepText}>{c.humanKeeps}</p>
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
              御社の業務の形に合わせて、同じやり方を組み立てます。まずは現場の話から。
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
