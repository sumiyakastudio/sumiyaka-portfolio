import type { Metadata } from "next";
import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import TableUnifyTool from "@/components/tools/unify/TableUnifyTool";
import ToolMark from "@/components/tools/_marks/ToolMark";
import { SITE_ORIGIN } from "@/lib/site";
import styles from "./page.module.css";

// OGカードのサムネイル。@vercel/og は WebP を描画できないため専用の og-2.jpg を渡す
// （版付きファイル名＝白ベース化で差し替えた画像。data/tools.ts の og と同じ値）
const OG_URL =
  "/api/og?title=TABLE%20UNIFY&sub=Excel%20and%20CSV%20into%20One%20Table%20%E2%80%94%20runs%20in%20your%20browser" +
  `&img=${encodeURIComponent(`${SITE_ORIGIN}/tools/unify/og-2.jpg`)}`;

export const metadata: Metadata = {
  title: "列マッピング統合 — AKASHIKI Tools",
  description:
    "列の並びも見出し名もバラバラなExcel・CSVを、決めた管理表の形へ揃えて一つの表にまとめます。対応づけは見出しの名前から機械が下書きし、人が線を引き直して確定できます。読み込んだファイルはブラウザの中だけで処理され、外部へ送信されません。",
  alternates: { canonical: "/tools/table-unify" },
  openGraph: {
    title: "列マッピング統合 — AKASHIKI Tools",
    description:
      "A社のCSVとB社のExcelを、御社の管理表の形に揃えます。データは端末の外に出ません。",
    // @vercel/og は日本語フォント未搭載のため、カードの文字は英字にしている
    images: [{ url: OG_URL, width: 1200, height: 630 }],
  },
};

const CAN_DO = [
  {
    title: "列の名前が違っても、揃う",
    body: "「得意先名」「取引先」「会社名」——呼び方が違うだけの列を、機械が見つけて線でつなぎます。つながらなかったところだけを直せば終わりです。",
  },
  {
    title: "出力の形は、御社の管理表",
    body: "いつも使っている管理表を読み込ませると、その列の並びがそのまま出力の形になります。ツール側の決まった形に合わせる必要はありません。",
  },
  {
    title: "どこから来た行かが残る",
    body: "統合した表には、取り込み元のファイル名が入ります。行番号を足せば「どのファイルの何行目か」までたどれます。",
  },
];

const CANNOT_DO = [
  {
    title: "スキャンした画像やPDFの読み取り",
    body: "紙をスキャンしたPDFや写真から表を起こすことは、このツールではしません。読むのは Excel（.xlsx）と CSV だけです。",
  },
  {
    title: "値そのものの手直し",
    body: "「㈱」と「株式会社」を同じものに直したり、住所の表記を整えたり、同じ人物の重複を名寄せしたりはしません。列と列をつなぐところだけを引き受けます。",
  },
  {
    title: "人の判断の置き換え",
    body: "表を揃えるという一工程だけを引き受けます。どの列がどの列に当たるかを最後に決めるのは人です。機械が出すのは下書きです。",
  },
];

export default function TableUnifyPage() {
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "列マッピング統合",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    url: "https://akashiki.com/tools/table-unify",
    description:
      "列の並びも見出し名もバラバラな複数のExcel・CSVを、利用者が決めた一つの管理表の形へ揃えて統合するブラウザ内完結のツール。統合した表は Excel（.xlsx）と CSV で書き出せる。",
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
    author: {
      "@type": "Organization",
      name: "灯敷（AKASHIKI）",
      alternateName: "墨家 / SUMIYAKA",
    },
  };

  // data-tools-paper＝紙のテーマ（app/tools/tools-paper.css）／data-tool＝1本1色のテーマ色
  return (
    <main className={styles.page} data-tools-paper data-tool="unify">
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
            <span>TABLE UNIFY</span>
          </nav>

          <div className={styles.headRow}>
            {/* 図像＝線が引かれていく描画アニメ（見出しでだけ animate） */}
            <ToolMark tool="unify" size={68} animate className={styles.headMark} />
            <div className={styles.headText}>
              <p className={styles.no}>T-04</p>
              <h1 className={styles.title}>列マッピング統合</h1>
              <p className={styles.titleEn}>Table Unify</p>
            </div>
          </div>

          <p className={styles.lead}>
            列の並びも見出し名も違う複数の表を、決めた管理表の形へ揃えて一つにまとめます。
            <br className={styles.brPc} />
            読み込んだファイルはこの端末の中だけで処理され、どこにも送信されません。
          </p>

          <ul className={styles.badges}>
            <li>ブラウザの中だけで完結</li>
            <li>Excel（.xlsx）／ CSV</li>
            <li>最大10ファイル・合計20,000行</li>
          </ul>
        </div>
      </header>

      {/* ============ ツール本体 ============ */}
      {/* data-shot-target＝サムネイル撮影の基準（掲載用スクショの位置合わせに使う） */}
      <section
        className={styles.toolSection}
        aria-label="列マッピング統合"
        data-shot-target
      >
        <div className={styles.toolInner}>
          <TableUnifyTool />
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
      <section className={styles.custom} aria-label="御社の管理表に合わせる">
        <div className={styles.customInner}>
          <ScrollReveal>
            <p className={styles.customLead}>
              ここに置いているのは、整った表を前提にしたお試し版です。
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className={styles.customBody}>
              実際に集まってくる表は、取引先ごとに形が違います。列の並び、見出しの言い回し、結合されたセル、途中に挟まる小計行。
              そこを読み解いて御社の管理表へ落とし込む部分は、一社ずつ作ります。
              毎月くり返している転記があれば、表に限らず同じやり方で仕組みに変えられます。
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
