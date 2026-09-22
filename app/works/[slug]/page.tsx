import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllWorks, getWorkBySlug } from "@/lib/works";
import { SITE_ORIGIN } from "@/lib/site";
import {
  getDetailMetaFacts,
  getDetailDesignFacts,
  getDetailChipGroups,
  getDetailBooleanFlags,
  getDetailRebuild,
  hasDetailSummary,
  hasDetailChallenge,
  hasDetailDesignSection,
} from "@/lib/detail";
import ScrollReveal from "@/components/animation/ScrollReveal";
import WorkDetailClient from "./WorkDetailClient";
import styles from "./page.module.css";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  const works = getAllWorks();
  return works.map((work) => ({ slug: work.slug }));
}

// OGカード用の画像。@vercel/og は WebP を描画できないため専用の og.jpg を使う
// （thumbnail.webp を渡すと画像枠だけが空で描かれる）。
// ファイルが無い作品は img を渡さない＝空枠ではなく文字だけのカードにする。
function ogThumbUrl(slug: string): string | null {
  const rel = `/works/${slug}/og.jpg`;
  return fs.existsSync(path.join(process.cwd(), "public", rel))
    ? `${SITE_ORIGIN}${rel}`
    : null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const work = getWorkBySlug(slug);
  if (!work) return { title: "Work Not Found — AKASHIKI" };

  const ogBase = `/api/og?title=${encodeURIComponent(work.title)}&sub=${encodeURIComponent(work.category.join(" / "))}`;
  const thumb = ogThumbUrl(work.slug);
  const ogImg = thumb ? `${ogBase}&img=${encodeURIComponent(thumb)}` : ogBase;

  return {
    title: `${work.title} — AKASHIKI Works`,
    description: work.description,
    openGraph: {
      images: [{ url: ogImg, width: 1200, height: 630 }],
    },
  };
}

export default async function WorkDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const work = getWorkBySlug(slug);
  if (!work) notFound();

  const allWorks = getAllWorks();
  const currentIndex = allWorks.findIndex((w) => w.slug === slug);
  const prevWork = currentIndex > 0 ? allWorks[currentIndex - 1] : null;
  const nextWork =
    currentIndex < allWorks.length - 1 ? allWorks[currentIndex + 1] : null;

  const metaFacts = getDetailMetaFacts(work);
  const designFacts = getDetailDesignFacts(work);
  const chipGroups = getDetailChipGroups(work);
  const booleanFlags = getDetailBooleanFlags(work);
  const showDesign = hasDetailDesignSection(work);
  // 移植版。公開URLが未設定なら null＝下の節ごと描画しない
  const rebuild = getDetailRebuild(work);

  return (
    <main className={styles.page}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <Link href="/works" className={styles.backLink}>
            <span className={styles.backArrow}>&#8592;</span>
            <span className={styles.backLabel}>
              <span className={styles.backEn}>一覧へ戻る</span>
            </span>
          </Link>

          <div className={styles.heroBreadcrumb}>
            <Link href="/works" className={styles.breadcrumbLink}>
              WEB
            </Link>
            <span className={styles.breadcrumbSep}>/</span>
            <span className={styles.breadcrumbCurrent}>{work.title}</span>
          </div>

          <div className={styles.heroPills}>
            {work.isFeatured && (
              <span className={`${styles.pill} ${styles.pillAccent}`}>
                Featured
              </span>
            )}
            {work.category.map((cat) => (
              <span key={cat} className={styles.categoryTag}>
                {cat}
              </span>
            ))}
          </div>

          <h1 className={styles.heroTitle}>{work.title}</h1>
          <p className={styles.heroKicker}>
            {work.genre} / {work.siteType}
          </p>
          <p className={styles.heroDesc}>{work.description}</p>
        </div>
      </section>

      {/* ── Gallery ── */}
      <WorkDetailClient work={work} />

      {/* ── Overview (Summary + Challenge) ── */}
      {hasDetailSummary(work) && (
        <section className={styles.overviewSection}>
          <div className={styles.overviewInner}>
            <ScrollReveal>
              <span className={styles.sectionLabel}>コンセプト</span>
              <p className={styles.overviewText}>{work.summary}</p>
            </ScrollReveal>

            {hasDetailChallenge(work) && (
              <ScrollReveal delay={0.1}>
                <div className={styles.challengeBlock}>
                  <span className={styles.challengeLabel}>背景・課題</span>
                  <p className={styles.challengeText}>{work.challenge}</p>
                </div>
              </ScrollReveal>
            )}
          </div>
        </section>
      )}

      {/* ── Rebuild（同じデザインを別プラットフォームで組み直した版） ──
          rebuild が null＝公開URL未設定のときは節ごと出さない */}
      {rebuild && (
        <section className={styles.rebuildSection}>
          <div className={styles.rebuildInner}>
            <ScrollReveal>
              <span className={styles.sectionLabel}>REBUILD</span>
              {/* 前後の空白を JSX の行トリムに委ねると落ちるので、文字列側で持つ */}
              <h2 className={styles.rebuildTitle}>
                {`同じデザインを ${rebuild.platform} で再構築`}
              </h2>
              {rebuild.note !== "" && (
                <p className={styles.rebuildText}>{rebuild.note}</p>
              )}
            </ScrollReveal>

            {rebuild.facts.length > 0 && (
              <ScrollReveal delay={0.1}>
                <ul className={styles.rebuildFacts}>
                  {rebuild.facts.map((fact) => (
                    <li key={fact} className={styles.rebuildFact}>
                      {fact}
                    </li>
                  ))}
                </ul>
              </ScrollReveal>
            )}

            <ScrollReveal delay={0.2}>
              <a
                href={rebuild.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.rebuildLink}
              >
                {`${rebuild.platform} 版を見る ↗`}
              </a>
            </ScrollReveal>
          </div>
        </section>
      )}

      {/* ── Meta Facts ── */}
      <section className={styles.metaSection}>
        <div className={styles.metaInner}>
          <ScrollReveal>
            <span className={styles.sectionLabel}>プロジェクト情報</span>
          </ScrollReveal>
          <dl className={styles.metaGrid}>
            {metaFacts.map((fact, i) => (
              <ScrollReveal
                key={fact.label}
                delay={i * 0.05}
                as="div"
                className={styles.metaItem}
              >
                <dt className={styles.metaDt}>{fact.label}</dt>
                <dd className={styles.metaDd}>{fact.value}</dd>
              </ScrollReveal>
            ))}

            {/* 担当範囲。掲載作品はすべて同じ体制なので Work 型には持たせず固定表現で出す。
                既存6項目の並び・文言は変えず、最終行に全幅で1行だけ足している */}
            <ScrollReveal
              delay={metaFacts.length * 0.05}
              as="div"
              className={`${styles.metaItem} ${styles.metaItemWide}`}
            >
              <dt className={styles.metaDt}>担当範囲</dt>
              <dd className={styles.metaDd}>
                企画・設計・デザイン・コーディング・実装・公開（すべて私一人）
              </dd>
            </ScrollReveal>
          </dl>
        </div>
      </section>

      {/* ── Design Perspective ── */}
      {showDesign && designFacts.length > 0 && (
        <section className={styles.designSection}>
          <div className={styles.designInner}>
            <ScrollReveal>
              <span className={styles.sectionLabel}>DESIGN PERSPECTIVE</span>
            </ScrollReveal>
            <dl className={styles.designGrid}>
              {designFacts.map((fact) => (
                <ScrollReveal
                  key={fact.label}
                  as="div"
                  className={styles.designItem}
                >
                  <dt className={styles.metaDt}>{fact.label}</dt>
                  <dd className={styles.metaDd}>{fact.value}</dd>
                </ScrollReveal>
              ))}
            </dl>
          </div>
        </section>
      )}

      {/* ── Tech & Features ── */}
      <section className={styles.techSection}>
        <div className={styles.techInner}>
          <ScrollReveal>
            <span className={styles.sectionLabel}>TECHNOLOGIES & FEATURES</span>
          </ScrollReveal>

          {/* Chip Groups */}
          {chipGroups.map((group, gi) => (
            <ScrollReveal key={group.label} delay={gi * 0.08}>
              <div className={styles.chipGroup}>
                <span className={styles.chipGroupLabel}>{group.label}</span>
                <div className={styles.chipItems}>
                  {group.items.map((item) => (
                    <span key={item} className={styles.techItem}>
                      {item}
                    </span>
                  ))}
                  {group.truncatedCount > 0 && (
                    <span className={styles.chipMore}>
                      ほか{group.truncatedCount}件
                    </span>
                  )}
                </div>
              </div>
            </ScrollReveal>
          ))}

          {/* Boolean Flags */}
          <ScrollReveal delay={chipGroups.length * 0.08}>
            <div className={styles.flagsRow}>
              {booleanFlags.map((flag) => (
                <div key={flag.label} className={styles.flagItem}>
                  <span className={styles.flagLabel}>{flag.label}</span>
                  <span className={styles.flagValue}>{flag.value}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Prev / Next Navigation ── */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          {prevWork ? (
            <Link
              href={`/works/${prevWork.slug}`}
              className={styles.navLink}
            >
              <span className={styles.navDir}>&#8592; 前へ</span>
              <span className={styles.navTitle}>{prevWork.title}</span>
            </Link>
          ) : (
            <div />
          )}

          <Link href="/works" className={styles.navAll}>
            ALL SITES
          </Link>

          {nextWork ? (
            <Link
              href={`/works/${nextWork.slug}`}
              className={`${styles.navLink} ${styles.navLinkRight}`}
            >
              <span className={styles.navDir}>次へ &#8594;</span>
              <span className={styles.navTitle}>{nextWork.title}</span>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </nav>
    </main>
  );
}
