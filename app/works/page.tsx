import type { Metadata } from "next";
import Link from "next/link";
import SubPageFVAnim from "@/components/animation/SubPageFVAnim";
import ScrollReveal from "@/components/animation/ScrollReveal";
import DrawRule from "@/components/animation/DrawRule";
import WorksFVStack from "@/components/fv/works/WorksFVStack";
import { pickFVSheets } from "@/components/fv/works/fvSheets";
import WorksExplorer from "@/components/works/WorksExplorer";
import WorksAio from "@/components/works/WorksAio";
import WorksPrice from "@/components/works/WorksPrice";
import { getAllWorks } from "@/lib/works";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "WEB — AKASHIKI | Web制作",
  description:
    "LP・コーポレートサイト・ブランドサイト・多言語サイトなど、Web制作の全実績を掲載。企画・設計からデザイン・コーディング・公開まで、すべて私一人で一貫して対応します。AI検索最適化（AIO）は全案件に標準搭載。カテゴリ・使用技術で絞り込み可能。",
  openGraph: {
    images: [{ url: `/api/og?title=WEB&sub=${encodeURIComponent("Web制作の実績")}`, width: 1200, height: 630 }],
  },
};

const MEDIA = ["静的サイト", "WordPress", "STUDIO", "Figma"];

const FLOW = ["企画", "設計", "デザイン", "コーディング", "実装", "公開"];

export default function WorksPage() {
  const works = getAllWorks();

  return (
    <main className={styles.page}>
      {/* Hero — 清・紙。掲載サイトのフルスクショが差し込まれて束になり、
          手前の一枚（題箋）に題字が押し込まれる。マウスを載せると束が広がり、
          広がった札のすべてが縦に流れる（入場は WorksFVStack が持つ＝
          customEntrance。収縮と位相は舞台のまま）。
          ★ 束に使う作品は data の tier / order から選ぶ＝ハードコードしない */}
      <SubPageFVAnim className={styles.fv} customEntrance>
        <WorksFVStack count={works.length} sheets={pickFVSheets(works)}>
          <h1 data-wk-title className={styles.fvTitle}>WEB制作</h1>
          <p data-wk-sub className={styles.fvSub}>
            LP・コーポレート・ブランド・多言語 —{" "}
            {works.length}作品
          </p>
          <div data-wk-rule className={styles.fvHr} aria-hidden="true" />
        </WorksFVStack>
      </SubPageFVAnim>

      {/* ========== 担当範囲＝0→100 ＋ 対応できる媒体 ========== */}
      <section className={styles.scope} aria-labelledby="works-scope-title">
        <div className={styles.scopeInner}>
          <ScrollReveal>
            <span className={styles.scopeLabel}>WEB PRODUCTION</span>
            <h2 id="works-scope-title" className={styles.scopeTitle}>
              Web制作は、企画から公開まで、
              <br className={styles.brSp} />
              すべて私一人で。
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <ol className={styles.flow} aria-label="担当する工程">
              {FLOW.map((step, i) => (
                <li key={step} className={styles.flowItem}>
                  <span className={styles.flowNum}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.flowName}>{step}</span>
                </li>
              ))}
            </ol>
          </ScrollReveal>

          <ScrollReveal delay={0.15}>
            <p className={styles.scopeText}>
              企画・設計・デザイン・コーディング・実装・公開まで、すべて私一人で一貫して対応します。
              <strong className={styles.scopeStrong}>分業も外注もありません。</strong>
              このページに掲載しているすべての作品が、同じ体制で作られています。
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className={styles.media}>
              <span className={styles.mediaLabel}>対応できる媒体</span>
              <ul className={styles.mediaList}>
                {MEDIA.map((m) => (
                  <li key={m} className={styles.mediaItem}>{m}</li>
                ))}
              </ul>
              <p className={styles.mediaNote}>
                掲載作品はすべて静的データで制作しているため、WordPress・STUDIO・Figma など、他の媒体へ丸ごと移植できます。
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== 料金（PRICE）— /service から移設（C4・P6-1）。トップから /works#price で到達 ========== */}
      <WorksPrice />

      {/* ========== AIO（AI検索最適化） ========== */}
      <WorksAio />

      {/* 掲載作品についてのアナウンス */}
      <section className={styles.notice} aria-labelledby="works-notice-label">
        <div className={styles.noticeInner}>
          <span id="works-notice-label" className={styles.noticeLabel}>
            ABOUT THESE SITES
          </span>
          <p className={styles.noticeText}>
            本ページに掲載しているサイトは、
            <span className={styles.noticeStrong}>
              実際の案件をベースに制作したもの
            </span>
            です（自社で使うために作った AKASHIKI WORKS FINDER と AOKI MITUMORI の2件を除きます）。掲載にあたっては、クライアントを特定できる情報と、権利上掲載できない素材のみを差し替えています。
          </p>
        </div>
      </section>

      {/* Works Explorer */}
      <section className={styles.content}>
        <WorksExplorer works={works} />
      </section>

      {/* ========== 末尾CTA ========== */}
      <section className={styles.cta} aria-labelledby="works-cta-title">
        <div className={styles.ctaInner}>
          <ScrollReveal className={styles.ctaGrid}>
            <span className={styles.ctaLabel}>CONTACT</span>
            <h2 id="works-cta-title" className={styles.ctaTitle}>
              Web制作のご相談
            </h2>
            <p className={styles.ctaText}>
              ご予算や納期が決まっていない段階でも構いません。
              <br className={styles.brSp} />
              通常24時間以内にご返信します。
            </p>
            <Link href="/contact" className={styles.ctaButton}>
              お問い合わせ
              <span className={styles.ctaArrow} aria-hidden="true">→</span>
            </Link>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== もうひとつの仕事への導線 ========== */}
      <section className={styles.bridge} aria-labelledby="works-bridge-title">
        <div className={styles.bridgeInner}>
          <DrawRule className={styles.bridgeRule} />
          <ScrollReveal>
            <h2 id="works-bridge-title" className={styles.bridgeTitle}>
              Web制作のほかに、社内の事務作業を仕組みに変える仕事もしています。
            </h2>
            <p className={styles.bridgeText}>
              業務の自動化と、AIを使いこなせる人材の育成。
              <br className={styles.brSp} />
              「毎月この転記に何日もかかっている」——そういう作業を、ひとりでに回る形に変えます。
            </p>
            <Link href="/" className={styles.bridgeLink}>
              詳しく見る
              <span className={styles.ctaArrow} aria-hidden="true">→</span>
            </Link>
          </ScrollReveal>
        </div>
      </section>
    </main>
  );
}
