import type { Metadata } from "next";
import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import InvoiceBatchTool from "@/components/tools/invoice/InvoiceBatchTool";
import ToolMark from "@/components/tools/_marks/ToolMark";
import { SITE_ORIGIN } from "@/lib/site";
import styles from "./page.module.css";

// OGカードのサムネイル。@vercel/og は WebP を描画できないため専用の og-2.jpg を渡す
// （版付きファイル名＝白ベース化で差し替えた画像。data/tools.ts の og と同じ値）
const OG_URL =
  "/api/og?title=INVOICE%20BATCH&sub=Excel%20to%20Invoice%20PDF%20%E2%80%94%20runs%20in%20your%20browser" +
  `&img=${encodeURIComponent(`${SITE_ORIGIN}/tools/invoice/og-2.jpg`)}`;

export const metadata: Metadata = {
  title: "請求書PDF 一括作成 — AKASHIKI Tools",
  description:
    "Excelの台帳を読み込むと、取引先ごとの請求書PDFがまとめて出ます。適格請求書（インボイス）の記載項目に対応。ファイルはブラウザの中だけで処理され、外部へ送信されません。",
  alternates: { canonical: "/tools/invoice-batch" },
  openGraph: {
    title: "請求書PDF 一括作成 — AKASHIKI Tools",
    description:
      "Excelの台帳から、取引先ごとの請求書PDFをまとめて作ります。データは端末の外に出ません。",
    // @vercel/og は日本語フォント未搭載のため、カードの文字は英字にしている
    images: [{ url: OG_URL, width: 1200, height: 630 }],
  },
};

const CAN_DO = [
  {
    title: "一つの台帳から、何十枚でも",
    body: "請求書番号でまとめ、取引先ごとの1枚に組み替えます。10社でも50社でも、操作は一度きりです。",
  },
  {
    title: "適格請求書（インボイス）の形で",
    body: "登録番号、税率ごとに区分した対価と消費税額、軽減税率の対象である旨。記載項目が入っているかを画面で確かめられます。適格請求書として有効かどうかの判断は代われません。",
  },
  {
    title: "端数の扱いを、御社の運用に合わせて",
    body: "消費税の端数は切り捨て・四捨五入・切り上げから選べます。税率ごとに一度だけ丸めます。",
  },
];

const CANNOT_DO = [
  {
    title: "スキャンした画像やPDFの読み取り",
    body: "紙をスキャンしたPDFや写真から文字を起こすことは、このツールではしません。読むのは Excel（.xlsx）と CSV だけです。",
  },
  {
    title: "人の判断の置き換え",
    body: "何をいくらで請求するかは決められません。決まったことを、速く正確に形にするための道具です。",
  },
  {
    title: "全業務の一括自動化",
    body: "請求書の作成という一工程だけを引き受けます。前後の工程まで含めるなら、業務そのものを一緒に設計します。",
  },
];

export default function InvoiceBatchPage() {
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "請求書PDF 一括作成",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    url: "https://akashiki.com/tools/invoice-batch",
    description:
      "Excelの台帳から取引先ごとの請求書PDFを一括生成するブラウザ内完結のツール。適格請求書（インボイス）の記載項目に対応。",
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
    author: {
      "@type": "Organization",
      name: "灯敷（AKASHIKI）",
      alternateName: "墨家 / SUMIYAKA",
    },
  };

  // data-tools-paper＝紙のテーマ（app/tools/tools-paper.css）／data-tool＝1本1色のテーマ色
  return (
    <main className={styles.page} data-tools-paper data-tool="invoice">
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
            <span>INVOICE BATCH</span>
          </nav>

          <div className={styles.headRow}>
            {/* 図像＝線が引かれていく描画アニメ（見出しでだけ animate） */}
            <ToolMark tool="invoice" size={68} animate className={styles.headMark} />
            <div className={styles.headText}>
              <p className={styles.no}>T-01</p>
              <h1 className={styles.title}>請求書PDF 一括作成</h1>
              <p className={styles.titleEn}>Invoice Batch</p>
            </div>
          </div>

          <p className={styles.lead}>
            Excelの台帳を読み込むと、取引先ごとの請求書PDFがまとめて出ます。
            <br className={styles.brPc} />
            ファイルはこの端末の中だけで処理され、どこにも送信されません。
          </p>

          <ul className={styles.badges}>
            <li>ブラウザの中だけで完結</li>
            <li>適格請求書の記載項目に対応</li>
            <li>Excel（.xlsx）／ CSV</li>
          </ul>
        </div>
      </header>

      {/* ============ ツール本体 ============ */}
      {/* data-shot-target＝サムネイル撮影の基準（掲載用スクショの位置合わせに使う） */}
      <section
        className={styles.toolSection}
        aria-label="請求書PDF 一括作成"
        data-shot-target
      >
        <div className={styles.toolInner}>
          <InvoiceBatchTool />
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
      <section className={styles.custom} aria-label="御社の台帳に合わせる">
        <div className={styles.customInner}>
          <ScrollReveal>
            <p className={styles.customLead}>
              ここに置いているのは、整った台帳を前提にしたお試し版です。
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className={styles.customBody}>
              実際の台帳は、会社ごとに形が違います。列の並び、表記のゆれ、結合されたセル、例外の行。
              そこを読み解いて御社の形に合わせる部分は、一社ずつ作ります。
              請求書に限らず、毎月くり返している事務作業があれば、同じやり方で仕組みに変えられます。
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
