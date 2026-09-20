import Link from "next/link";
import HomeIntro from "@/components/home/HomeIntro";
import TopProgress from "@/components/fv/top-body/TopProgress";
import SectionMark from "@/components/fv/top-body/SectionMark";
import Who from "@/components/home/Who";
import Measured from "@/components/home/Measured";
import PriceAnim from "@/components/home/PriceAnim";
import PriceRunner from "@/components/home/PriceRunner";
import BoundaryFigure from "@/components/home/BoundaryFigure";
import Person from "@/components/home/Person";
import CtaSection from "@/components/home/CtaSection";
import { budgetLine } from "@/data/pillars";
import styles from "./page.module.css";

export default function Home() {
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "墨家 / SUMIYAKA — 灯敷（AKASHIKI）",
    url: "https://akashiki.com",
    description:
      "AIスペシャリスト 墨家 / SUMIYAKA。御社の仕事のやり方をAIに教え込み、社員の方が自分で回せる状態まで伴走します。業務の自動化・ツール開発、Web制作も、設計から公開まで一人で。",
    publisher: {
      "@type": "Organization",
      name: "灯敷（AKASHIKI）",
      alternateName: "墨家 / SUMIYAKA",
    },
    inLanguage: "ja",
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      {/* 1. Hero（OP→Hero の配線は HomeIntro＝子CC-E提供） */}
      <HomeIntro />

      {/* P17「トップのハブ化」(2026-09-20)：
          トップは活動を簡潔に伝え、興味のある部分へリンクで飛ばす役。詳細は各ページに置く。
          - 節は 5 つ（01 何をする人か → 02 実測 → 03 VALUE → 04 人 → 05 CONTACT）。
            THE WAY／TRUST／STEPS／INSIGHT／EXITS と制作実績の3デッキは /service・/cases・
            /tools・/works へ移した（部品ファイルは残してある）。
          - 進捗線＝画面左端の細い縦線。[data-top-section] を持つセクションの並びが目盛（01…05）。
            PC（1280px 以上・マウス）だけ。FV のあいだは出ない。
          - 地は暖黒 × 灯 × 墨で通し、白転調（紙）は「いくら浮くか」(#value) だけ。
            **色は 02 実測の朱の印1点だけ**（P17 計画書§3）。 */}
      <TopProgress />

      {/* 2. 何をする人か（01 WHAT I DO・#who）＝FV の宣言ボタンの飛び先。
          FDEの説明・仕事の3段・しないこと・結論の大キャッチ・3本柱のタイル */}
      <Who />

      {/* 3. 実測（02 MEASURED・#measured）＝数字2行と朱の「実測」印。飛び先は /cases */}
      <Measured />

      {/* 4. いくら浮くか（03 VALUE・#value）＝地に「紙が挟まる」白転調（トップで唯一の紙）
          - id="value" は PriceAnim が section を描画する都合上、ラッパー div に付与（PriceAnim は変更禁止）
          - PriceRunner の動き・発火・[data-price-header]/[data-price-card]/[data-price-amount] 契約は不変
          - P12＝注記を1文に短縮し、導線は小さな2リンクへ
          - P17＝章番号を 07 → 03 に振り直し、予算が先に決まっている場合の一文を注記に足した */}
      <div
        id="value"
        className={styles.valueAnchor}
        data-top-section="03"
        data-top-label="VALUE"
        data-top-tone="paper"
      >
        <PriceAnim className={styles.priceSection}>
          <PriceRunner />
          <div className={styles.priceInner}>
            {/* 1. 中見出し（既存・[data-price-header] 契約維持） */}
            <div data-price-header className={styles.priceHead}>
              <SectionMark no="03" label="VALUE" onPaper className={styles.priceMark} />
              <h2 className={styles.priceTitle}>
                <span className={styles.phrase}>いくらかかるかより先に、</span>
                <span className={styles.phrase}>いくら浮くか。</span>
              </h2>
            </div>

            {/* 2. 逆算3行（既存・[data-price-card]/[data-price-amount] 契約維持） */}
            <div className={styles.priceRows}>
              <div data-price-card className={styles.priceRow}>
                <span className={styles.priceLabel}>月20時間の削減</span>
                <span className={styles.priceLeader} aria-hidden="true" />
                <span className={styles.priceArrow}>→</span>
                <span data-price-amount className={styles.priceAmount}>年 約50万円</span>
              </div>
              <div data-price-card className={styles.priceRow}>
                <span className={styles.priceLabel}>事務作業の30%を自動化</span>
                <span className={styles.priceLeader} aria-hidden="true" />
                <span className={styles.priceArrow}>→</span>
                <span data-price-amount className={styles.priceAmount}>年 約120万円</span>
              </div>
              <div data-price-card className={styles.priceRow}>
                <span className={styles.priceLabel}>1人分の業務を丸ごと</span>
                <span className={styles.priceLeader} aria-hidden="true" />
                <span className={styles.priceArrow}>→</span>
                <span data-price-amount className={styles.priceAmount}>年 約400万円</span>
              </div>
            </div>

            {/* 3. 注記（P12＝1文）＋小さな3リンク（2026-09-16 実測の導入事例 /cases を追加＝逆算の根拠）
                   P17＝予算が先に決まっている場合の一文を1行足す（文言は data/pillars.ts の budgetLine） */}
            <p className={styles.priceNote}>価格は、削減額から逆算してご提案します。</p>
            <p className={`${styles.priceNote} ${styles.priceNoteSub}`}>{budgetLine}</p>
            <p className={styles.priceLinks}>
              <Link href="/cases" className={styles.priceLink}>
                削減の実測（導入事例） → /cases
              </Link>
              <Link href="/service" className={styles.priceLink}>
                進め方と料金の考え方 → /service
              </Link>
              <Link href="/works#price" className={styles.priceLink}>
                Web制作の料金 → /works#price
              </Link>
            </p>
          </div>
        </PriceAnim>
      </div>

      {/* 5. Boundary Easter Egg（位置・動き不変） */}
      <BoundaryFigure />

      {/* 6. マーキー帯B＝削除（2026-08-17 あおきさん決定「帯は全廃」） */}

      {/* 7. どんな人か（04 PERSON）＝P17 で章番号を 08 → 04。姿勢の宣言ブロックを足した */}
      <Person />

      {/* 8. CTA（05 CONTACT）＝共通部品（/about /service と共用）。進捗線の目盛のためだけに包む */}
      <div data-top-section="05" data-top-label="CONTACT">
        <CtaSection />
      </div>
    </main>
  );
}
