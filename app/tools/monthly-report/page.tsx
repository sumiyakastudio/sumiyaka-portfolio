import type { Metadata } from "next";
import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import MonthlyReportTool from "@/components/tools/report/MonthlyReportTool";
import ToolMark from "@/components/tools/_marks/ToolMark";
import { SITE_ORIGIN } from "@/lib/site";
import styles from "./page.module.css";

// OGカードのサムネイル。@vercel/og は WebP を描画できないため専用の og-2.jpg を渡す
// （版付きファイル名＝白ベース化で差し替えた画像。data/tools.ts の og と同じ値）
const OG_URL =
  "/api/og?title=MONTHLY%20REPORT&sub=Excel%20to%20Monthly%20Report%20PDF%20%E2%80%94%20runs%20in%20your%20browser" +
  `&img=${encodeURIComponent(`${SITE_ORIGIN}/tools/report/og-2.jpg`)}`;

export const metadata: Metadata = {
  title: "月次レポートPDF — AKASHIKI Tools",
  description:
    "Excelの売上表を読み込むと、前月比・前年同月比つきのレポートPDFがA4横1枚で出ます。グラフも要約文も同じ集計から作るので数字が食い違いません。ファイルはブラウザの中だけで処理され、外部へ送信されません。",
  alternates: { canonical: "/tools/monthly-report" },
  openGraph: {
    title: "月次レポートPDF — AKASHIKI Tools",
    description:
      "Excelの売上表から、前月比・前年同月比つきのレポートPDFを1枚作ります。データは端末の外に出ません。",
    // @vercel/og は日本語フォント未搭載のため、カードの文字は英字にしている
    images: [{ url: OG_URL, width: 1200, height: 630 }],
  },
};

const CAN_DO = [
  {
    title: "Excelを読み込むと、レポートが1枚出る",
    body: "日付と金額の列があれば、月へ畳んで前月比・前年同月比・年度累計まで計算します。日々の明細でも、月次に集計済みの表でも、同じ読み取り方で扱えます。",
  },
  {
    title: "数字とグラフと文章が、同じ集計から出る",
    body: "棒グラフ・ランキング・要約文はすべて同じ計算結果を使っています。グラフと本文で数字が食い違うことがありません。",
  },
  {
    title: "出せない数字は「—」と書く",
    body: "前年同月のデータが無ければ、前年同月比は出しません。0% で埋めたり、無かったことにしたりしません。データの無い月を、売上0円の月として描くこともしません。",
  },
];

const CANNOT_DO = [
  {
    title: "予算・目標との対比",
    body: "集計するのは売上の実績だけです。予算表を取り込んで予実を突き合わせることは、このツールではしません。",
  },
  {
    title: "増減の理由や評価",
    body: "要約文は「前月比 +4.8%（+¥530,000）」のような事実だけを組み立てています。なぜそうなったか、良いか悪いかは書きません（生成AIは使っていません）。",
  },
  {
    title: "スキャンした画像やPDFの読み取り",
    body: "読むのは Excel（.xlsx）と CSV だけです。紙の売上表を写真から起こすことはしません。",
  },
];

export default function MonthlyReportPage() {
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "月次レポートPDF",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    url: "https://akashiki.com/tools/monthly-report",
    description:
      "Excelの売上表から、前月比・前年同月比つきの月次レポートPDF（A4横1枚）を作るブラウザ内完結のツール。棒グラフ・3か月移動平均・区分別ランキング・事実だけの要約文つき。",
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
    author: {
      "@type": "Organization",
      name: "灯敷（AKASHIKI）",
      alternateName: "墨家 / SUMIYAKA",
    },
  };

  // data-tools-paper＝紙のテーマ（app/tools/tools-paper.css）／data-tool＝1本1色のテーマ色
  return (
    <main className={styles.page} data-tools-paper data-tool="report">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />

      {/* ============ 見出し ============ */}
      {/* data-fv＝Smart Header のしきい値。これが無いと 100vh 分スクロールするまで
          サイトのヘッダーが出てこない（Header.tsx の handleScroll を参照） */}
      <header className={styles.head} data-fv>
        <div className={styles.headInner}>
          <nav className={styles.crumb} aria-label="パンくず">
            <Link href="/tools">TOOLS</Link>
            <span aria-hidden="true">/</span>
            <span>MONTHLY REPORT</span>
          </nav>

          <div className={styles.headRow}>
            {/* 図像＝線が引かれていく描画アニメ（見出しでだけ animate） */}
            <ToolMark tool="report" size={68} animate className={styles.headMark} />
            <div className={styles.headText}>
              <p className={styles.no}>T-06</p>
              <h1 className={styles.title}>月次レポートPDF</h1>
              <p className={styles.titleEn}>Monthly Report</p>
            </div>
          </div>

          <p className={styles.lead}>
            Excelの売上表を読み込むと、前月比・前年同月比つきのレポートがA4横1枚で出ます。
            <br className={styles.brPc} />
            ファイルはこの端末の中だけで処理され、どこにも送信されません。
          </p>

          <ul className={styles.badges}>
            <li>ブラウザの中だけで完結</li>
            <li>前月比・前年同月比・年度累計</li>
            <li>Excel（.xlsx）／ CSV</li>
          </ul>
        </div>
      </header>

      {/* ============ ツール本体 ============ */}
      {/* data-shot-target＝サムネイル撮影の基準（掲載用スクショの位置合わせに使う） */}
      <section
        className={styles.toolSection}
        aria-label="月次レポートPDF"
        data-shot-target
      >
        <div className={styles.toolInner}>
          <MonthlyReportTool />
        </div>
      </section>

      {/* ============ できること／できないこと ============ */}
      <section className={styles.scope} aria-label="できることとできないこと">
        <div className={styles.scopeInner}>
          <div className={styles.scopeCol}>
            <ScrollReveal>
              <h2 className={styles.scopeTitle}>できること</h2>
            </ScrollReveal>
            <ul className={styles.scopeList}>
              {CAN_DO.map((item, i) => (
                <ScrollReveal as="li" key={item.title} delay={i * 0.08}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </ScrollReveal>
              ))}
            </ul>
          </div>

          <div className={styles.scopeCol}>
            <ScrollReveal>
              <h2 className={styles.scopeTitle}>できないこと</h2>
            </ScrollReveal>
            <ul className={`${styles.scopeList} ${styles.scopeListMuted}`}>
              {CANNOT_DO.map((item, i) => (
                <ScrollReveal as="li" key={item.title} delay={i * 0.08}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </ScrollReveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ============ 特注への導線 ============ */}
      <section className={styles.custom} aria-label="御社の売上表に合わせる">
        <div className={styles.customInner}>
          <ScrollReveal>
            <p className={styles.customLead}>
              ここに置いているのは、整った売上表を前提にしたお試し版です。
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className={styles.customBody}>
              実際の月次報告は、会社ごとに見たいものが違います。部門別の内訳、予算との対比、
              複数システムから出てくる表の突き合わせ。そこを読み解いて御社の形に合わせる部分は、一社ずつ作ります。
              全業務をまとめて自動化する話ではなく、毎月くり返している集計と清書の一工程を、仕組みに変える話です。
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <Link href="/contact" className={styles.customLink}>
              相談してみる →
            </Link>
          </ScrollReveal>
        </div>
      </section>

      <p className={styles.credit}>
        PDFの日本語表示に Noto Sans JP（SIL Open Font License 1.1）を使用しています。
      </p>
    </main>
  );
}
