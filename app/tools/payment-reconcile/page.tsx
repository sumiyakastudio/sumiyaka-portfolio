import type { Metadata } from "next";
import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import ReconcileTool from "@/components/tools/reconcile/ReconcileTool";
import ToolMark from "@/components/tools/_marks/ToolMark";
import { SITE_ORIGIN } from "@/lib/site";
import styles from "./page.module.css";

// OGカードのサムネイル。@vercel/og は WebP を描画できないため専用の og-2.jpg を渡す
// （版付きファイル名＝白ベース化で差し替えた画像。data/tools.ts の og と同じ値）
const OG_URL =
  "/api/og?title=PAYMENT%20RECONCILE&sub=Bank%20CSV%20x%20Invoice%20Ledger%20%E2%80%94%20runs%20in%20your%20browser" +
  `&img=${encodeURIComponent(`${SITE_ORIGIN}/tools/reconcile/og-2.jpg`)}`;

export const metadata: Metadata = {
  title: "入金消込 突合 — AKASHIKI Tools",
  description:
    "銀行の入出金明細CSVと請求台帳を読み込むと、自動一致・要確認・未入金の三つに分かれます。振込名義のカナのゆれ、手数料の差引、合算入金、分割入金にも理由つきで対応。ファイルはブラウザの中だけで処理され、外部へ送信されません。",
  alternates: { canonical: "/tools/payment-reconcile" },
  openGraph: {
    title: "入金消込 突合 — AKASHIKI Tools",
    description:
      "銀行の入出金明細と請求台帳を突き合わせ、自動一致・要確認・未入金に分けます。データは端末の外に出ません。",
    // @vercel/og は日本語フォント未搭載のため、カードの文字は英字にしている
    images: [{ url: OG_URL, width: 1200, height: 630 }],
  },
};

const CAN_DO = [
  {
    title: "名義のカナのゆれを吸収して突き合わせる",
    body: "半角カナ・全角カナ、「カ)」と「株式会社」、小さい「ョ」と大きい「ヨ」、長音や空白の有無。銀行の明細と台帳で書き方が違っても、同じ会社として結びつけます。",
  },
  {
    title: "手数料差引・合算・分割を、理由つきで拾う",
    body: "振込手数料が引かれた入金、3件の請求を1本にまとめた入金、2回に分けて届いた入金。金額が合わない理由を1行で示します。",
  },
  {
    title: "判定の根拠が画面に出る",
    body: "どの行がなぜその色になったのか、照合に使ったキーまで開いて見られます。結果は突合表（CSV）で書き出せます。",
  },
];

const CANNOT_DO = [
  {
    title: "通帳や紙の明細の読み取り",
    body: "通帳をスキャンした画像やPDFから入金を読み取ることは、このツールではしません。読むのは銀行が出したCSVと、Excel・CSVの請求台帳だけです。",
  },
  {
    title: "会計ソフトへの登録",
    body: "消込の判定までを引き受けます。仕訳を作ることも、会計ソフトへ書き込むことも行いません。",
  },
  {
    title: "人の判断の置き換え",
    body: "「要確認」に分けた行を最後に決めるのは人です。取引先に確認すべきことを、機械が代わりに決めることはしません。",
  },
];

export default function PaymentReconcilePage() {
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "入金消込 突合",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    url: "https://akashiki.com/tools/payment-reconcile",
    description:
      "銀行の入出金明細CSVと請求台帳を突き合わせ、自動一致・要確認・未入金に分けるブラウザ内完結のツール。振込名義のカナのゆれ、振込手数料の差引、合算入金、分割入金に対応。",
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
    author: {
      "@type": "Organization",
      name: "灯敷（AKASHIKI）",
      alternateName: "墨家 / SUMIYAKA",
    },
  };

  // data-tools-paper＝紙のテーマ（app/tools/tools-paper.css）／data-tool＝1本1色のテーマ色
  return (
    <main className={styles.page} data-tools-paper data-tool="reconcile">
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
            <span>PAYMENT RECONCILE</span>
          </nav>

          <div className={styles.headRow}>
            {/* 図像＝線が引かれていく描画アニメ（見出しでだけ animate） */}
            <ToolMark tool="reconcile" size={68} animate className={styles.headMark} />
            <div className={styles.headText}>
              <p className={styles.no}>T-02</p>
              <h1 className={styles.title}>入金消込 突合</h1>
              <p className={styles.titleEn}>Payment Reconcile</p>
            </div>
          </div>

          <p className={styles.lead}>
            銀行の入出金明細と請求台帳を読み込むと、自動一致・要確認・未入金の三つに分かれます。
            <br className={styles.brPc} />
            ファイルはこの端末の中だけで処理され、どこにも送信されません。
          </p>

          <ul className={styles.badges}>
            <li>ブラウザの中だけで完結</li>
            <li>銀行の入出金CSV×請求台帳</li>
            <li>判定の根拠が見える</li>
          </ul>
        </div>
      </header>

      {/* ============ ツール本体 ============ */}
      {/* data-shot-target＝サムネイル撮影の基準（掲載用スクショの位置合わせに使う） */}
      <section className={styles.toolSection} aria-label="入金消込 突合" data-shot-target>
        <div className={styles.toolInner}>
          <ReconcileTool />
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
      <section className={styles.custom} aria-label="御社の消込に合わせる">
        <div className={styles.customInner}>
          <ScrollReveal>
            <p className={styles.customLead}>
              ここに置いているのは、1口座ぶんの明細と整った台帳を前提にしたお試し版です。
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className={styles.customBody}>
              実際の消込には、まだ先があります。支店名や営業所名まで入った振込名義の名寄せ、
              いくつもの口座にまたがった明細、過去の入金実績から当てにいく照合、
              販売管理システムから出てくる台帳の形。
              そこを読み解いて御社の形に合わせる部分は、一社ずつ作ります。
              入金消込に限らず、毎月くり返している突き合わせの作業があれば、同じやり方で仕組みに変えられます。
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
