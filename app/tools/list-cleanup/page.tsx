import type { Metadata } from "next";
import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import ListCleanupTool from "@/components/tools/cleanup/ListCleanupTool";
import ToolMark from "@/components/tools/_marks/ToolMark";
import { SITE_ORIGIN } from "@/lib/site";
import styles from "./page.module.css";

// OGカードのサムネイル。@vercel/og は WebP を描画できないため専用の og-2.jpg を渡す
// （版付きファイル名＝白ベース化で差し替えた画像。data/tools.ts の og と同じ値）
const OG_URL =
  "/api/og?title=LIST%20CLEANUP&sub=Clean%20up%20your%20contact%20list%20%E2%80%94%20runs%20in%20your%20browser" +
  `&img=${encodeURIComponent(`${SITE_ORIGIN}/tools/cleanup/og-2.jpg`)}`;

export const metadata: Metadata = {
  title: "名簿クレンジング — AKASHIKI Tools",
  description:
    "顧客名簿や取引先リストのExcel・CSVを読み込むと、表記のゆれを種類ごとに数えて、直す規則を選んでまとめて整えます。修正前と修正後を並べて確かめられます。名簿はブラウザの中だけで処理され、外部へ送信されません。",
  alternates: { canonical: "/tools/list-cleanup" },
  openGraph: {
    title: "名簿クレンジング — AKASHIKI Tools",
    description:
      "名簿の表記ゆれを診断して、選んだ規則だけでまとめて整えます。データは端末の外に出ません。",
    // @vercel/og は日本語フォント未搭載のため、カードの文字は英字にしている
    images: [{ url: OG_URL, width: 1200, height: 630 }],
  },
};

const CAN_DO = [
  {
    title: "何が汚れているかを、先に数える",
    body: "読み込んだ瞬間に、半角カナ・全角英数・法人格の略記・余分な空白・重複の疑いを種類ごとに数えます。どこから手を付ければいいかが、開いた時点で分かります。",
  },
  {
    title: "直す規則を、一つずつ選べる",
    body: "18の規則を個別に切り替えられます。既定で入っているのは、意味が変わらない安全な規則だけ。人名の旧字体のように「直すと別人になりうる」ものは、既定では触りません。",
  },
  {
    title: "修正前と修正後を、並べて確かめられる",
    body: "変わった箇所は文字単位で色が付きます。どこを何の規則で直したかは、修正レポートとして書き出せます。後から上長に説明できる形で残ります。",
  },
];

const CANNOT_DO = [
  {
    title: "正しい表記を教えること",
    body: "企業データベースを持っていないので、「この会社の正式名称はこちらです」とは言えません。このツールがするのは表記を揃えることまでで、正解に直すことではありません。",
  },
  {
    title: "重複を自動で消すこと",
    body: "同じ相手に見える行を候補として並べるところまでです。どちらを残すか、そもそも別人・別法人なのかは、人が決めることです。行を勝手に消すことはしません。",
  },
  {
    title: "スキャンした画像やPDFの読み取り",
    body: "紙をスキャンした画像や PDF から文字を起こすことはしません。読むのは Excel（.xlsx）と CSV だけです。",
  },
];

export default function ListCleanupPage() {
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "名簿クレンジング",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    url: "https://akashiki.com/tools/list-cleanup",
    description:
      "顧客名簿・取引先リストの表記ゆれを診断し、選んだ規則だけでまとめて整えるブラウザ内完結のツール。修正前後の対比と修正レポートを出せる。",
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
    author: {
      "@type": "Organization",
      name: "灯敷（AKASHIKI）",
      alternateName: "墨家 / SUMIYAKA",
    },
  };

  // data-tools-paper＝紙のテーマ（app/tools/tools-paper.css）／data-tool＝1本1色のテーマ色
  return (
    <main className={styles.page} data-tools-paper data-tool="cleanup">
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
            <span>LIST CLEANUP</span>
          </nav>

          <div className={styles.headRow}>
            {/* 図像＝線が引かれていく描画アニメ（見出しでだけ animate） */}
            <ToolMark tool="cleanup" size={68} animate className={styles.headMark} />
            <div className={styles.headText}>
              <p className={styles.no}>T-05</p>
              <h1 className={styles.title}>名簿クレンジング</h1>
              <p className={styles.titleEn}>List Cleanup</p>
            </div>
          </div>

          <p className={styles.lead}>
            顧客名簿や取引先リストを読み込むと、表記のゆれを種類ごとに数えて、直す規則を選んでまとめて整えます。
            <br className={styles.brPc} />
            読み込んだ名簿はこの端末の中だけで処理され、どこにも送信されません。
          </p>

          <ul className={styles.badges}>
            <li>ブラウザの中だけで完結</li>
            <li>Excel（.xlsx）／ CSV</li>
            <li>18の規則を個別に選べる</li>
          </ul>
        </div>
      </header>

      {/* ============ ツール本体 ============ */}
      {/* data-shot-target＝サムネイル撮影の基準（掲載用スクショの位置合わせに使う） */}
      <section
        className={styles.toolSection}
        aria-label="名簿クレンジング"
        data-shot-target
      >
        <div className={styles.toolInner}>
          <ListCleanupTool />
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
      <section className={styles.custom} aria-label="御社の名簿に合わせる">
        <div className={styles.customInner}>
          <ScrollReveal>
            <p className={styles.customLead}>
              ここに置いているのは、整った形の表を前提にしたお試し版です。
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className={styles.customBody}>
              実際の名簿は、会社ごとに形が違います。列の並び、社内だけで通じる略記、結合されたセル、例外の行。
              そこを読み解いて御社の形に合わせる部分は、一社ずつ作ります。
              名簿に限らず、毎月くり返している事務作業があれば、同じやり方で仕組みに変えられます。
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <Link href="/contact" className={styles.customLink}>
              相談してみる →
            </Link>
          </ScrollReveal>
        </div>
      </section>
    </main>
  );
}
