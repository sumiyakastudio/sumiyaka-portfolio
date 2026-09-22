import type { Metadata } from "next";
import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import EvidenceRenameTool from "@/components/tools/evidence/EvidenceRenameTool";
import ToolMark from "@/components/tools/_marks/ToolMark";
import { SITE_ORIGIN } from "@/lib/site";
import styles from "./page.module.css";

// OGカードのサムネイル。@vercel/og は WebP を描画できないため専用の og-2.jpg を渡す
// （版付きファイル名＝白ベース化で差し替えた画像。data/tools.ts の og と同じ値）
const OG_URL =
  "/api/og?title=EVIDENCE%20RENAME&sub=Bulk%20file%20rename%20%2B%20index%20CSV%20%E2%80%94%20runs%20in%20your%20browser" +
  `&img=${encodeURIComponent(`${SITE_ORIGIN}/tools/evidence/og-2.jpg`)}`;

export const metadata: Metadata = {
  title: "電帳法ファイル名 一括リネーム — AKASHIKI Tools",
  description:
    "台帳に書いた取引年月日・取引先・取引金額をもとに、PDFや画像のファイル名を一括で付け替え、索引簿と一緒にZIPで書き出します。ファイルはブラウザの中だけで処理され、外部へ送信されません。",
  alternates: { canonical: "/tools/evidence-rename" },
  openGraph: {
    title: "電帳法ファイル名 一括リネーム — AKASHIKI Tools",
    description:
      "証憑ファイルの束を、規則的なファイル名へまとめて付け替えます。データは端末の外に出ません。",
    // @vercel/og は日本語フォント未搭載のため、カードの文字は英字にしている
    images: [{ url: OG_URL, width: 1200, height: 630 }],
  },
};

const CAN_DO = [
  {
    title: "一問一答が示す形へ、まとめて",
    body: "国税庁の一問一答が例示している「20210131_㈱霞商店_110000」の形に合わせて、何十件でも一度に付け替えます。並び順・区切り文字・日付の書式は選べます。",
  },
  {
    title: "索引簿も一緒に",
    body: "ファイル名で管理する方法のほかに、連番を付けて索引簿（一覧表）で管理する方法も選べます。索引簿は国税庁が配布しているサンプルと同じ列（連番・日付・金額・取引先・備考）で書き出します。",
  },
  {
    title: "中身には触れません",
    body: "付け替えるのは名前だけです。PDFや画像のバイト列は1バイトも変えずに、そのままZIPへ詰め直します。読み込んだファイルは端末の外へ出ません。",
  },
];

const CANNOT_DO = [
  {
    title: "スキャンした画像やPDFの読み取り",
    body: "PDFや写真の中身から日付・取引先・金額を読み取ることはしません。3項目はご自身で台帳に書いていただきます。読むのは Excel（.xlsx）と CSV だけです。",
  },
  {
    title: "法令の要件を満たしているかの判断",
    body: "このツールはファイル名を付け替えて索引簿を作るだけです。要件を満たすかどうかの判断は代われません。改ざん防止措置や事務処理規程の備付けなど、ファイル名以外に必要な対応もあります。",
  },
  {
    title: "全業務の一括自動化",
    body: "証憑に名前を付ける一工程だけを引き受けます。メールから証憑を集める、PDFを取引ごとに分ける、会計ソフトと突き合わせる——その前後まで含めるなら、業務そのものを一緒に設計します。",
  },
];

export default function EvidenceRenamePage() {
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "電帳法ファイル名 一括リネーム",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    url: "https://akashiki.com/tools/evidence-rename",
    description:
      "証憑ファイルの束と台帳から、規則的なファイル名へ一括で付け替え、索引簿CSVと一緒にZIPで書き出すブラウザ内完結のツール。",
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
    author: {
      "@type": "Organization",
      name: "灯敷（AKASHIKI）",
      alternateName: "墨家 / SUMIYAKA",
    },
  };

  // data-tools-paper＝紙のテーマ（app/tools/tools-paper.css）／data-tool＝1本1色のテーマ色
  return (
    <main className={styles.page} data-tools-paper data-tool="evidence">
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
            <span>EVIDENCE RENAME</span>
          </nav>

          <div className={styles.headRow}>
            {/* 図像＝線が引かれていく描画アニメ（見出しでだけ animate） */}
            <ToolMark tool="evidence" size={68} animate className={styles.headMark} />
            <div className={styles.headText}>
              <p className={styles.no}>T-03</p>
              <h1 className={styles.title}>電帳法ファイル名 一括リネーム</h1>
              <p className={styles.titleEn}>Evidence Rename</p>
            </div>
          </div>

          <p className={styles.lead}>
            証憑の束と台帳を読み込むと、国税庁の一問一答が例示している形（20210131_㈱霞商店_110000）に合わせてファイル名を付け替えます。
            <br className={styles.brPc} />
            ファイルはこの端末の中だけで処理され、どこにも送信されません。
          </p>

          <ul className={styles.badges}>
            <li>ブラウザの中だけで完結</li>
            <li>ZIP＋索引簿CSV</li>
            <li>PDF・画像に対応</li>
          </ul>
        </div>
      </header>

      {/* ============ ツール本体 ============ */}
      {/* data-shot-target＝サムネイル撮影の基準（掲載用スクショの位置合わせに使う） */}
      <section
        className={styles.toolSection}
        aria-label="電帳法ファイル名 一括リネーム"
        data-shot-target
      >
        <div className={styles.toolInner}>
          <EvidenceRenameTool />
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
      <section className={styles.custom} aria-label="御社の証憑の集め方に合わせる">
        <div className={styles.customInner}>
          <ScrollReveal>
            <p className={styles.customLead}>
              ここに置いているのは、整った台帳を前提にしたお試し版です。
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className={styles.customBody}>
              実務で手が止まるのは、名前を付ける一工程よりも、その前後にあります。
              メールの添付を集める、一つのPDFを取引ごとに分ける、会計ソフトの仕訳と突き合わせる。
              そこは会社ごとに形が違うので、一社ずつ作ります。
              証憑に限らず、毎月くり返している事務作業があれば、同じやり方で仕組みに変えられます。
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
        ファイル名の例は国税庁「電子帳簿保存法一問一答【電子取引関係】」問19・問50に拠ります。
      </p>
    </main>
  );
}
