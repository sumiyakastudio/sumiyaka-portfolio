import Link from "next/link";
import HomeIntro from "@/components/home/HomeIntro";
import TopProgress from "@/components/fv/top-body/TopProgress";
import SectionMark from "@/components/fv/top-body/SectionMark";
import Way from "@/components/home/Way";
import Trust from "@/components/home/Trust";
import Steps from "@/components/home/Steps";
import Atari from "@/components/home/Atari";
import Deguchi from "@/components/home/Deguchi";
import PickUpWorks from "@/components/home/PickUpWorks";
import PriceAnim from "@/components/home/PriceAnim";
import PriceRunner from "@/components/home/PriceRunner";
import BoundaryFigure from "@/components/home/BoundaryFigure";
import Person from "@/components/home/Person";
import CtaSection from "@/components/home/CtaSection";
import { getPickUpWorks } from "@/lib/works";
import { getPickUpTools } from "@/lib/toolCatalog";
import { getPickUpCases } from "@/lib/caseCatalog";
import styles from "./page.module.css";

export default function Home() {
  // 件数はハードコードせず、作品データから毎回集計する（作品追加で自動追従）
  const pickupWorks = getPickUpWorks();
  // 02 ツール制作の枠。0件なら PickUpWorks 側が「準備中」プレートに戻る
  const pickupTools = getPickUpTools();
  // 01 FDE事業（導入事例）の枠。0件なら PickUpWorks 側が枠ごと出さない
  const pickupCases = getPickUpCases();

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

      {/* P12「1画面1メッセージ」(2026-09-06)：
          - 進捗線＝画面左端の細い縦線。[data-top-section] を持つセクションの並びが目盛（01…09）。
            PC（1280px 以上・マウス）だけ。FV のあいだは出ない。
          - 各セクション＝章番号 → 要約（大きく）→ 根拠1つ → 詳細は Disclose。
          - 地は暖黒 × 灯 × 墨で通し、白転調（紙）は「いくら浮くか」(#value) だけ */}
      <TopProgress />

      {/* 2. 働き方（01 THE WAY・#way）＝FV「その意味を、見る」の飛び先 */}
      <Way />

      {/* 2b. 安心（02 TRUST・#trust-top）＝Way から独立させた短いブロック */}
      <Trust />

      {/* 2c. 三段（03 THREE STEPS・#steps）＝梯子 */}
      <Steps />

      {/* 3. 言い当て（04 INSIGHT）＝不変 */}
      <Atari />

      {/* 4. できること（05 EXITS）＝不変 */}
      <Deguchi />

      {/* 5. 制作実績（06 WORKS）＝不変 */}
      <PickUpWorks works={pickupWorks} tools={pickupTools} cases={pickupCases} />

      {/* 6. いくら浮くか（07 VALUE・#value）＝地に「紙が挟まる」白転調（トップで唯一の紙）
          - id="value" は PriceAnim が section を描画する都合上、ラッパー div に付与（PriceAnim は変更禁止）
          - PriceRunner の動き・発火・[data-price-header]/[data-price-card]/[data-price-amount] 契約は不変
          - P12＝注記を1文に短縮し、導線は小さな2リンクへ */}
      <div
        id="value"
        className={styles.valueAnchor}
        data-top-section="07"
        data-top-label="VALUE"
        data-top-tone="paper"
      >
        <PriceAnim className={styles.priceSection}>
          <PriceRunner />
          <div className={styles.priceInner}>
            {/* 1. 中見出し（既存・[data-price-header] 契約維持） */}
            <div data-price-header className={styles.priceHead}>
              <SectionMark no="07" label="VALUE" onPaper className={styles.priceMark} />
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

            {/* 3. 注記（P12＝1文）＋小さな3リンク（2026-09-16 実測の導入事例 /cases を追加＝逆算の根拠） */}
            <p className={styles.priceNote}>価格は、削減額から逆算してご提案します。</p>
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

      {/* 7. Boundary Easter Egg（位置・動き不変） */}
      <BoundaryFigure />

      {/* 8. マーキー帯B＝削除（2026-08-17 あおきさん決定「帯は全廃」） */}

      {/* 9. どんな人か（08 PERSON） */}
      <Person />

      {/* 10. CTA（09 CONTACT）＝共通部品（/about /service と共用）。進捗線の目盛のためだけに包む */}
      <div data-top-section="09" data-top-label="CONTACT">
        <CtaSection />
      </div>
    </main>
  );
}
