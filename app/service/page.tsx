import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import CountUp from "@/components/animation/CountUp";
import Disclose from "@/components/animation/Disclose";
import DrawRule from "@/components/animation/DrawRule";
import Highlight from "@/components/animation/Highlight";
import ScrollReveal from "@/components/animation/ScrollReveal";
import { inventoryPhoto } from "@/data/photos";
import FigRail from "@/components/fv/service/FigRail";
import ServiceFV from "@/components/fv/service/ServiceFV";
import StageSteps, { type Stage } from "@/components/fv/service/StageSteps";
import WireSteps from "@/components/fv/service/WireSteps";
import Atari from "@/components/home/Atari";
import CtaSection from "@/components/home/CtaSection";
import Steps from "@/components/home/Steps";
import Trust from "@/components/home/Trust";
import Way from "@/components/home/Way";
import PhotoFigure from "@/components/photo/PhotoFigure";
import InsideDiagram from "@/components/service/InsideDiagram";
import UnifyDiagram from "@/components/service/UnifyDiagram";
import styles from "./page.module.css";

/**
 * /service — AIスペシャリストとしてのサービス（P6・2026-08-27 → P9・2026-08-27 → P10・2026-09-02 → P12・2026-09-06）
 * 文言は `P12_原稿_減量差分.md` Service 節 → `P10_原稿_三段.md` S10節 → `P9_原稿_top_service_about.md` A節 →
 * `P6_原稿_service_about.md` A節の順が正本（一言一句不変）。
 * P12＝減量：各セクションを「要約（表題欄プレート・3秒で読める）＋根拠（数字は CountUp）＋詳細（Disclose・既定は閉）」
 *      の型に組み直した。詳細は DOM に残る（SEO・読み上げは全文）。削除＝①「パソコンの中だけで動き…」／
 *      ②「御社の仕事のやり方を教え込みます。」／TRUST 03「自分の仕事で…」／04「仕事は、人と人との間に…」／
 *      PROCESS の締め帯。⚠ TRUST 02 見出し「専門知識で防ぎます」→「設計で防ぎます」は言い換え（あおきさん確認事項）。
 * 構成：FV → 言い当て（INSIGHT）→ 働き方（THE WAY）
 *       → できること（第1の柱＝AI導入の設計・教育／第2の柱＝業務の自動化・ツール開発）
 *       → 三段の梯子（THREE STEPS）→ できないこと → 安心（ASSURANCE）
 *       → AIへの不安（TRUST） → データの扱い → 進め方 → 料金の考え方 → FAQ → CTA
 *
 * P17（2026-09-20・トップのハブ化）＝トップにあった4節を、文言を一言一句変えずに移設した。
 *   INSIGHT＝components/home/Atari／THE WAY＝同 Way（+WaySteps）／
 *   THREE STEPS＝同 Steps（+StepsLadder）／ASSURANCE＝同 Trust。
 *   節の枠（section の id・図番見出し・版面）はこのページが持ち、部品は中身だけを返す。
 *   移設した部品の共通語彙は components/service/service-body.module.css（板・要約・本文・詳細）。
 *
 * 2026-09-05 五彩改修＝重（じゅう）「線・図面」：
 *   ページ全体を「製図台の上の一枚の図面」として組み直した。FV は components/fv/service/ServiceFV
 *   （床面グリッド→構築線→題字が部材のように収まる→表題欄）、本文は図番付きのプレート・配線図（PROCESS）・
 *   見積図面の表（PRICING）・索引カード（TRUST/FAQ）・破線枠（引き受けないこと）。
 * 2026-09-06 読み進める装置：左端の図番の進捗線（FigRail・PC のみ）、3段階は現在地の段が灯り
 *   「私がすること」が段ごとに着地する（StageSteps）。演出は transform/opacity/stroke のみ。金は使わない。
 */

// /api/og は日本語フォント搭載済み。sub は日本語のまま渡す（URL用に符号化するだけ）
const OG_URL = `/api/og?title=SERVICE&sub=${encodeURIComponent("AI導入支援・業務の自動化")}`;

export const metadata: Metadata = {
  title: "SERVICE — AKASHIKI | AI導入支援・業務の自動化",
  description:
    "墨家 / SUMIYAKA のサービス。御社の仕事のやり方をAIに教え込み、社員の方が自分で回せる状態まで伴走するAI導入の設計・教育と、Excel・CSV・PDFのあいだの転記をなくす業務の自動化・ツール開発。できること・できないこと、AIへの不安に対する答え、進め方、料金の考え方をご案内します。",
  openGraph: {
    images: [{ url: OG_URL, width: 1200, height: 630 }],
  },
};

/* ---------- 図番（FIG.）＝本文セクションの並び。FV のティック数・見出しの番号・進捗線はここから作る
   P17（2026-09-20）＝トップから移した4節（INSIGHT／THE WAY／THREE STEPS／ASSURANCE）を
   この並びに差し込んだ。読む順＝問題提起 → 働き方 → できること（現在地①②③）→ 提供の三段 →
   できないこと → 安心（問い）→ AIへの不安（答え）→ データ → 進め方 → 料金 → FAQ。
   ⚠ ASSURANCE（#trust-top）は既存の TRUST（#trust）と対になる節。図番ナビで同名が並ばないよう
     英字ラベルだけ分けている（可視の日本語は移設前と一言一句同じ）。 ---------- */
const FIGURES = [
  { id: "insight", label: "INSIGHT" },
  { id: "way", label: "THE WAY" },
  { id: "what-i-do", label: "WHAT I DO" },
  { id: "steps", label: "THREE STEPS" },
  { id: "what-i-dont", label: "WHAT I DON'T" },
  { id: "trust-top", label: "ASSURANCE" },
  { id: "trust", label: "TRUST" },
  { id: "data", label: "DATA" },
  { id: "process", label: "PROCESS" },
  { id: "pricing", label: "PRICING" },
  { id: "faq", label: "FAQ" },
] as const;
type FigureId = (typeof FIGURES)[number]["id"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const figIndex = (id: FigureId) => FIGURES.findIndex((f) => f.id === id);
const figNo = (id: FigureId) => pad2(figIndex(id) + 1);
const figLabel = (id: FigureId) => FIGURES[figIndex(id)].label;
const FIGURE_NUMBERS = FIGURES.map((_, i) => pad2(i + 1));
const RAIL_FIGURES = FIGURES.map((f, i) => ({ id: f.id, no: pad2(i + 1), label: f.label }));

/* ---------- A-2 できること：第1の柱（AI導入の設計・教育） ---------- */
const EDUCATION_POINTS = [
  "実際の現場で、業務の棚卸し",
  "AIに任せる作業と、人に残す判断の切り分け",
  "社員の方と一緒に実装し、手順書に落とす",
  "自分たちで回せるようになるまで伴走",
];

/* 詳細（Disclose の中・既定は閉） */
const EDUCATION_DETAIL = [
  "最初にやるのは、実際に作業している場所で業務を見ることです。ヒアリングで出てくるのは業務の半分で、残りは机の横で見て初めて分かります。誰が、どのファイルを、どの順で触っているか。そこから、AIに任せる作業と、人に残す判断を切り分けます。",
  "止まったときにどう対処するかを自分で考えられる社員の方を育てるところまでが、設計と教育です。",
];

/* 3段階（左に丸数字・右に題字＋補足・①にだけタグ）。「私がすること」は各1文 */
const STAGES: Stage[] = [
  {
    mark: "①",
    title: "社員が、生成AIを個人で使っている",
    sub: "文章の下書き・調べもの・壁打ち",
    tag: "ほとんどの会社",
    mine: "御社専用の道具をお渡しします。AIはまだ入れなくて構いません。",
  },
  {
    mark: "②",
    title: "社内のデータや既存システムと繋がった、業務専用のAIがある",
    sub: "見積・請求・台帳の照合などが、御社のファイルで動く",
    mine: "その道具をAIに使わせ、「〇〇をお願いします」で終わる状態にします。",
  },
  {
    mark: "③",
    title: "AIがあることを前提に、仕事の進め方そのものを組み直している",
    sub: "人は判断に集中し、集める・揃える・出すはAIが担う",
    mine: (
      <>
        社員の方が自分で作れるところまで教えます。
        <Highlight>ゴールは、私が要らなくなることです。</Highlight>
      </>
    ),
  },
];

/* ---------- A-2 できること：第2の柱（業務の自動化・ツール開発） ---------- */
const WHAT_I_DO = [
  {
    num: "01",
    title: "統合・突合",
    desc: "形式がバラバラな複数のExcel・CSVを一つの管理表にまとめ、金額や件数の食い違いも自動で照合します。",
  },
  {
    num: "02",
    title: "帳票の一括作成",
    desc: "Excelの台帳から、請求書・見積書などのPDFを一括で作成します。",
  },
  {
    num: "03",
    title: "データの下ごしらえ",
    desc: "会社名の表記ゆれ、重複、住所の分割など、人手で直しているデータの掃除を自動化します。",
  },
];

/* ---------- A-3 できないこと ---------- */
const WHAT_I_DONT = [
  {
    title: "手書き書類のスキャン画像の読み取り",
    desc: "読み取り精度を保証できないため、お受けしていません。",
  },
  {
    title: "人の判断そのものの置き換え",
    desc: "例外対応や承認の判断は、人に残すべき仕事です。",
  },
  {
    title: "全業務の一括自動化",
    desc: "一度にすべては失敗のもとです。効果の大きい作業から、一つずつ確実に進めます。",
  },
];

/* ---------- A-3b AIへの不安（TRUST）。detail は Disclose の中（02 のみ） ---------- */
type TrustItem = {
  num: string;
  title: string;
  desc: ReactNode;
  detail?: string;
};

const TRUST: TrustItem[] = [
  {
    num: "01",
    title: "AIに丸投げしません",
    desc: "AIが作ったものは、最後に必ず私の目で確認します。数字・宛名・金額のような間違えてはいけない箇所ほど、人が見ます。",
  },
  {
    num: "02",
    title: "暴走とデータ流出は、設計で防ぎます",
    desc: (
      <>
        何を渡し、何を渡さないか。どこまで自動で動かし、どこで止めるか。気合ではなく、
        <Highlight className={styles.nowrap}>設計の問題です。</Highlight>
      </>
    ),
    detail:
      "セキュリティの知識がないままAIでプログラムを組むと、動いてはいても穴が残ります。私は大手美容外科クリニックで正社員として7年、人体の情報という最上級のプライバシーを扱うシステムとサーバーのデータ保守、そしてセキュリティを担ってきました。高校・大学で体系立てて学んだ情報技術とその経験に、最新のAIを掛け合わせて仕事をしています。",
  },
  {
    num: "03",
    title: "私自身が、そう使っています",
    desc: "医療機関の中で使い始めた頃から、何を渡さないかを先に決めてきました。御社にお渡しするのは、私が自分で守ってきた使い方です。",
  },
  {
    num: "04",
    title: "効率だけでは、測れないものがある",
    desc: "AIで速くなった分は、お客様と向き合う時間に返す。AIは、そのための道具です。",
  },
];

/* ---------- A-4 データの扱い：数字（可視の文言と寸法バーの長さの正本）＋詳細 ---------- */
const STAT = { value: 30.0, decimals: 1, suffix: "%" };

const DATA_DETAIL = [
  "外部のサーバーにデータを送らないため、顧客名簿や売上データもそのまま安心してお使いいただけます。導入前のお試しも、実際のファイルでその場でご確認いただけます。",
  "AI導入でも、考え方は同じです。御社の環境の中で動く形を優先し、外に出す必要があるデータは、何をどこまで出すかを、出す前に必ず一緒に決めます。",
];

/* ---------- A-5 進め方 ---------- */
const PROCESS = [
  { num: "01", title: "ヒアリング", desc: "実際に作業している場所で、業務の流れとお使いのファイルを拝見します" },
  { num: "02", title: "可否の切り分け", desc: "できること・できないことを、理由とともに明示します" },
  { num: "03", title: "お見積り", desc: "削減できる時間を一緒に試算し、金額の根拠をお示しします" },
  { num: "04", title: "構築", desc: "御社のファイルと判断の基準に合わせて、仕組みを作り、AIに教え込みます" },
  { num: "05", title: "検収", desc: "実際のデータで動作をご確認いただきます" },
  { num: "06", title: "運用・定着", desc: "社員の方が使いこなせるようになるまで伴走します" },
];

/* ---------- A-6 料金の目安（value＝万円。寸法バーの長さはここから）
   ⚠ 金額は CountUp にしない：視界に入るまで「年 約0万円」と出る瞬間があり、料金表では誤読の元（2026-09-06 実測） ---------- */
const PRICE_ROWS = [
  { label: "月20時間の削減", amount: "年 約50万円", value: 50 },
  { label: "事務作業の30%を自動化", amount: "年 約120万円", value: 120 },
  { label: "1人分の業務を丸ごと", amount: "年 約400万円", value: 400 },
];
const PRICE_MAX = Math.max(...PRICE_ROWS.map((r) => r.value));

/* ---------- A-7 FAQ（可視・JSON-LD 共通の正本・計9問） ----------
   link を持つ項目は、可視側で回答文中の phrase を Link 化する。
   JSON-LD 側は a のテキストのみ（リンク無し）。 */
type FaqItem = {
  q: string;
  a: string;
  link?: { phrase: string; href: string };
};

const FAQ: FaqItem[] = [
  {
    q: "何から相談すればいいですか？",
    a: "いま手作業でやっていることを、そのままお聞かせください。「毎月この表を作るのに半日かかる」で十分です。お使いのファイルを拝見しながら、できる・できないを切り分けます。",
  },
  {
    q: "AIを入れたいのですが、何から手をつければいいですか？",
    a: "まず、御社がいまどの段階にいるかを一緒に確認します。①社員が個人で使っている ②業務専用のAIがある ③AI前提で仕事を組み直している。ほとんどの会社は①で、それは自然なことです。①から②へ進む最初の一つを、一緒に決めます。",
  },
  {
    q: "小さな会社でも頼めますか？",
    a: "はい。システム同士が繋がっておらず、人が転記している規模の会社ほど、効果が出やすい仕事です。",
  },
  {
    q: "いま使っているExcelのままで大丈夫ですか？",
    a: "はい。汎用ソフトに業務を合わせるのではなく、御社のファイルに合わせて仕組みを作ります。新しいシステムの導入を前提にはしません。",
  },
  {
    q: "データは外部に送られますか？",
    a: "お渡しする仕組みは、ブラウザの中だけで完結する設計です。データは御社のパソコンから外に出ません。AI導入で外に出す必要があるデータは、何をどこまで出すかを、出す前に必ず一緒に決めます。",
  },
  {
    q: "AIに詳しい社員がいなくても使えますか？",
    a: "使えるようになるまで教えるところまでが、私の仕事です。手順書を作り、社員の方が自分で回せる状態にしてから手を離します。",
  },
  {
    q: "AIが間違えたら、どうなりますか？",
    a: "AIが作ったものは、最後に必ず人の目で確認する工程を組み込みます。数字や金額のように間違えてはいけない箇所ほど、人が見る設計にします。どこまで自動で動かし、どこで止めるかは、最初に一緒に決めます。",
  },
  {
    q: "料金はどのように決まりますか？",
    a: "削減できる時間と人件費を一緒に試算し、削減額に見合う範囲でお見積りします。初回のお取引に限り、導入事例としてご紹介いただけることを条件に、優待価格をご用意しています。",
  },
  {
    q: "Web制作も頼めますか？",
    a: "はい。LP・コーポレートサイト・WordPressの制作は、企画から公開まで一人で対応します。実績と料金はWeb制作ページをご覧ください。",
    link: { phrase: "Web制作ページ", href: "/works" },
  },
];

/** 回答文中の phrase を Link 化して返す（文言は不変・リンクを被せるだけ） */
function renderAnswer(item: FaqItem) {
  if (!item.link) return item.a;
  const idx = item.a.indexOf(item.link.phrase);
  if (idx < 0) return item.a;
  const before = item.a.slice(0, idx);
  const after = item.a.slice(idx + item.link.phrase.length);
  return (
    <>
      {before}
      <Link href={item.link.href} className={styles.inlineLink}>
        {item.link.phrase}
      </Link>
      {after}
    </>
  );
}

/** 図番見出し：FIG. 0N（装飾）＋ 英字ラベル ＋ 右へ引かれる罫。id はラベル側に付ける（FAQ の aria-labelledby 用） */
function FigHead({ figure, id }: { figure: FigureId; id?: string }) {
  return (
    <div className={styles.figHead}>
      <span className={styles.figNo} aria-hidden="true">
        FIG. {figNo(figure)}
      </span>
      <span id={id} className={`${styles.label} ${styles.figLabel}`}>
        {figLabel(figure)}
      </span>
      <DrawRule className={styles.figRule} duration={1.1} />
    </div>
  );
}

/** 要約＝表題欄プレート（大きく・3秒で読める。落ち影で浮かせる）。extra＝同じ紙の裏面（Disclose）を続ける */
function Brief({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className={`${styles.plate} ${styles.brief}`}>
      <span className={styles.briefTag} aria-hidden="true">
        SUMMARY
      </span>
      <p className={styles.briefText}>{children}</p>
      {extra}
    </div>
  );
}

/** 詳細＝図面の裏面（Disclose の中身。段落の配列） */
function Detail({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className={styles.detail}>
      {paragraphs.map((p) => (
        <p key={p} className={styles.detailText}>
          {p}
        </p>
      ))}
    </div>
  );
}

export default function ServicePage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* ========== A-1 FV — 図面（床面グリッド・構築線・題字・表題欄）。文言はここに置く ========== */}
      <ServiceFV
        sheetName="SERVICE"
        figures={FIGURE_NUMBERS}
        sub="AI導入の設計と教育／業務の自動化・ツール開発"
        title={
          <>
            業務を、
            <br className={styles.brSp} />
            仕組みに変える。
          </>
        }
      />

      {/* 図番の進捗線（左端・PC のみ・fixed） */}
      <FigRail figures={RAIL_FIGURES} />

      {/* ========== P17-1 言い当て（INSIGHT）— トップから移設。中身は components/home/Atari ========== */}
      <section
        id="insight"
        className={`${styles.section} ${styles.sectionFirst}`}
        aria-labelledby="service-insight-title"
      >
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <FigHead figure="insight" />
          </ScrollReveal>

          <Atari titleId="service-insight-title" />
        </div>
      </section>

      {/* ========== P17-2 働き方（THE WAY）— トップから移設。中身は components/home/Way ========== */}
      <section id="way" className={styles.section} aria-labelledby="service-way-title">
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <FigHead figure="way" />
          </ScrollReveal>

          <Way titleId="service-way-title" />
        </div>
      </section>

      {/* ========== A-2 できること（WHAT I DO） ========== */}
      <section
        id="what-i-do"
        className={styles.section}
        aria-labelledby="service-do-title"
      >
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <FigHead figure="what-i-do" />
          </ScrollReveal>

          <div className={styles.headGrid}>
            <ScrollReveal className={styles.reveal}>
              <h2 id="service-do-title" className={styles.title}>
                御社の仕事を、AIに教える。
              </h2>
            </ScrollReveal>

            <ScrollReveal className={styles.reveal} delay={0.1}>
              <Brief>
                汎用のAIをそのまま渡しても、御社の業務は動きません。実際のファイルと判断の基準を一つずつ教え込み、
                <Highlight delay={0.2}>私がいなくても回る状態</Highlight>
                まで持っていきます。
              </Brief>
            </ScrollReveal>
          </div>

          {/* 第1の柱：AI導入の設計・教育＝部品プレート PART 01（4項目 → 一句 → 補足 → 裏面）
              本人写真（ロードマップ 4-13）＝ PC は右カラム（.pillarMain がグリッド化）、
              1023px 以下は pillarList の後・keyLine の前に自然に流れる（DOM 順はそのまま）。 */}
          <ScrollReveal className={styles.reveal} delay={0.15}>
            <div className={`${styles.plate} ${styles.pillar} ${styles.pillarFirst}`}>
              <span className={styles.partNo} aria-hidden="true">
                PART {pad2(1)}
              </span>

              <div className={styles.pillarMain}>
                <span className={styles.label}>AI導入の設計・教育</span>
                <ul className={styles.pillarList} aria-label="AI導入の設計・教育で行うこと">
                  {EDUCATION_POINTS.map((point) => (
                    <li key={point} className={styles.pillarItem}>{point}</li>
                  ))}
                </ul>

                <PhotoFigure
                  photo={inventoryPhoto}
                  tone="dark"
                  sizes="(max-width: 767px) calc(100vw - 80px), (max-width: 1023px) calc(100vw - 140px), 360px"
                  className={styles.pillarPhoto}
                />

                {/* 一句＝この図の主題。大きく置き、墨のマーカーが引かれる */}
                <p className={styles.keyLine}>
                  <Highlight className={styles.keyMark} delay={0.15}>点ではなく、線で。</Highlight>
                </p>
                <p className={styles.keyNote}>
                  一つの作業にだけ入れたAIは、想定外が起きたときに止まります。集めて、揃えて、出すまでの一連の流れを、まるごと任せられる形に組みます。
                </p>

                <Disclose className={styles.disclose} label="詳しく読む">
                  <Detail paragraphs={EDUCATION_DETAIL} />
                </Disclose>
              </div>
            </div>
          </ScrollReveal>

          {/* 3段階ブロック（第1の柱の中）＝縦の母線に端子 ①②③。現在地の段が灯る（StageSteps） */}
          <ScrollReveal className={styles.reveal}>
            <div className={styles.stage}>
              <h3 className={styles.stageTitle}>御社は、いまどの段階ですか。</h3>
              <StageSteps stages={STAGES} mineLabel="私がすること" />
              <p className={styles.stageClose}>
                ほとんどの会社は①で、それは自然なことです。①のままでも手作業は減らせます。①から②へ進む最初の一つを、一緒に決めるところから始めます。
              </p>
            </div>
          </ScrollReveal>

          {/* 第2の柱：業務の自動化・ツール開発＝部品プレート PART 02 */}
          <ScrollReveal className={styles.reveal}>
            <div className={`${styles.plate} ${styles.pillar}`}>
              <span className={styles.partNo} aria-hidden="true">
                PART {pad2(2)}
              </span>
              <span className={styles.label}>業務の自動化・ツール開発</span>
              <h3 className={styles.pillarTitle}>
                A社のCSVと、B社のExcelと、C社のPDF請求書を、
                <br className={styles.brPc} />
                御社の管理表の形に揃えます。
              </h3>
              <p className={styles.pillarBody}>
                御社がいま使っているファイルに合わせて、仕組みを作ります。AIを入れる前でも始められる、1段目の仕事です。
              </p>

              {/* 上の一句を図にする＝FIG. 03-A（線画・入場で1回描かれ、以後は光の点が周期で流れる） */}
              <UnifyDiagram />
            </div>
          </ScrollReveal>

          {/* 3項目＝寸法線の下に並ぶ部品 */}
          <ScrollReveal className={styles.reveal} delay={0.1}>
            <ol className={styles.doList}>
              {WHAT_I_DO.map((item) => (
                <li key={item.num} className={`${styles.plateDeep} ${styles.doItem}`}>
                  <span className={styles.doNum}>{item.num}</span>
                  <h4 className={styles.doName}>{item.title}</h4>
                  <p className={styles.doDesc}>{item.desc}</p>
                </li>
              ))}
            </ol>
          </ScrollReveal>

          {/* 見本＝主張のすぐ後ろに現物を置く（2026-09-05 追加）。プレートに現物を留める */}
          <ScrollReveal className={styles.reveal} delay={0.15}>
            <div className={`${styles.plate} ${styles.sample}`}>
              <div className={styles.sampleBody}>
                <span className={styles.label}>SAMPLE</span>
                <h4 className={styles.sampleTitle}>お渡しする形のまま、見本を公開しています。</h4>
                <p className={styles.sampleDesc}>
                  首都圏の中堅製造業100社を想定した架空データで作成した、リサーチ・リスト作成の見本。取得条件、重複の判定、証跡、品質チェックまで、納品物と同じ形でご覧いただけます。
                </p>
                <a
                  href="https://sumiyakastudio.github.io/research-list-sample/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${styles.arrowLink} ${styles.sampleLink}`}
                >
                  リサーチ・リスト作成の見本を見る
                  <span className={styles.arrow} aria-hidden="true">→</span>
                </a>
              </div>

              {/* 見本の現物。画像自体もリンクにする（本文のリンクと同じ行き先） */}
              <a
                href="https://sumiyakastudio.github.io/research-list-sample/"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.sampleShot}
                tabIndex={-1}
                aria-hidden="true"
              >
                <Image
                  src="/service/research-list-sample.webp"
                  alt=""
                  width={1282}
                  height={478}
                  sizes="(max-width: 1100px) 100vw, 900px"
                  className={styles.sampleShotImg}
                />
              </a>
            </div>
          </ScrollReveal>

          <ScrollReveal className={styles.reveal} delay={0.2}>
            <Link href="/tools" className={styles.arrowLink}>
              実際に動くツールを触る
              <span className={styles.arrow} aria-hidden="true">→</span>
            </Link>
            <p className={styles.note}>
              Web制作（LP・コーポレートサイト・WordPress）は、
              <Link href="/works" className={styles.inlineLink}>Web制作ページ</Link>
              でご案内しています。
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== P17-3 三段の梯子（THREE STEPS）— トップから移設。中身は components/home/Steps。
           直前の「御社は、いまどの段階ですか。」（現在地①②③）を受けて、提供の三段へ続く ========== */}
      <section id="steps" className={styles.section} aria-labelledby="service-steps-title">
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <FigHead figure="steps" />
          </ScrollReveal>

          {/* 締めの導線は /service 上では自己リンクになるため出さない（文言は書き換えない） */}
          <Steps titleId="service-steps-title" />
        </div>
      </section>

      {/* ========== A-3 できないこと（WHAT I DON'T）— 破線の枠＝不採用部品 ========== */}
      <section id="what-i-dont" className={styles.section} aria-labelledby="service-dont-title">
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <FigHead figure="what-i-dont" />
          </ScrollReveal>

          <div className={styles.headGrid}>
            <ScrollReveal className={styles.reveal}>
              <h2 id="service-dont-title" className={styles.title}>
                先に、できないことをお伝えします。
              </h2>
            </ScrollReveal>

            <ScrollReveal className={styles.reveal} delay={0.1}>
              <Brief>「何でも自動化できます」とは、言いません。</Brief>
            </ScrollReveal>
          </div>

          <ScrollReveal className={styles.reveal} delay={0.15}>
            <ul className={styles.dontList}>
              {WHAT_I_DONT.map((item) => (
                <li key={item.title} className={styles.dontItem}>
                  {/* 題字にトップFVと同じ「墨の一線」を静的に添える（::after・水平） */}
                  <h3 className={styles.dontName}>
                    <span className={styles.dontStrike}>{item.title}</span>
                  </h3>
                  <p className={styles.dontDesc}>{item.desc}</p>
                </li>
              ))}
            </ul>
          </ScrollReveal>

          <ScrollReveal className={styles.reveal} delay={0.2}>
            <p className={styles.dontClose}>
              できる・できないは、最初のヒアリングで正直に切り分けて、理由とともにお伝えします。
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== P17-4 安心（ASSURANCE）— トップから移設。中身は components/home/Trust。
           「安心して、任せられますか。」の問いを置き、直後の TRUST が答えになる ========== */}
      <section id="trust-top" className={styles.section} aria-labelledby="service-assurance-title">
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <FigHead figure="trust-top" />
          </ScrollReveal>

          <Trust titleId="service-assurance-title" />
        </div>
      </section>

      {/* ========== A-3b AIへの不安（TRUST）— 索引カード（02 の裏面に経歴） ========== */}
      <section id="trust" className={styles.section} aria-labelledby="service-trust-title">
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <FigHead figure="trust" />
          </ScrollReveal>

          <div className={styles.headGrid}>
            <ScrollReveal className={styles.reveal}>
              <h2 id="service-trust-title" className={styles.title}>
                AIへの不安に、先にお答えします。
              </h2>
            </ScrollReveal>

            <ScrollReveal className={styles.reveal} delay={0.1}>
              <Brief>「AIに任せて大丈夫か」は、正しい不安です。線の引き方を、先に書いておきます。</Brief>
            </ScrollReveal>
          </div>

          <ScrollReveal className={styles.reveal} delay={0.15}>
            <ol className={styles.trustList}>
              {TRUST.map((item) => (
                <li key={item.num} className={`${styles.plate} ${styles.trustItem}`}>
                  <span className={styles.trustNum}>{item.num}</span>
                  <h3 className={styles.trustName}>{item.title}</h3>
                  <div className={styles.trustBody}>
                    <p className={styles.trustDesc}>{item.desc}</p>
                    {item.detail && (
                      <Disclose className={`${styles.disclose} ${styles.discloseTight}`} label="詳しく読む">
                        <Detail paragraphs={[item.detail]} />
                      </Disclose>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </ScrollReveal>

          <ScrollReveal className={styles.reveal} delay={0.2}>
            <p className={styles.trustClose}>
              ほかに不安に思うことがあれば、最初のご相談でそのままお聞かせください。
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== A-4 データの扱い（DATA）— 要約＋計測プレート＋裏面 ========== */}
      <section id="data" className={styles.section} aria-labelledby="service-data-title">
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <FigHead figure="data" />
          </ScrollReveal>

          <div className={styles.dataGrid}>
            <div className={styles.dataText}>
              <ScrollReveal className={styles.reveal}>
                <h2 id="service-data-title" className={styles.title}>
                  データはお預かりしません。
                </h2>
              </ScrollReveal>
              <ScrollReveal className={styles.reveal} delay={0.1}>
                <Brief
                  extra={
                    <Disclose className={styles.disclose} label="詳しく読む">
                      <Detail paragraphs={DATA_DETAIL} />
                    </Disclose>
                  }
                >
                  お渡しする仕組みは、ブラウザの中だけで完結。
                  <Highlight delay={0.2}>データは御社のパソコンから外に出ません。</Highlight>
                </Brief>
              </ScrollReveal>
            </div>

            <ScrollReveal className={styles.reveal} delay={0.15}>
              <div className={`${styles.plate} ${styles.stat}`}>
                <p className={styles.statNum}>
                  <CountUp value={STAT.value} decimals={STAT.decimals} suffix={STAT.suffix} />
                </p>
                {/* 寸法バー：長さは STAT.value から（数字のハードコードなし） */}
                <span
                  className={styles.statTrack}
                  aria-hidden="true"
                  style={{ "--pct": `${STAT.value}%` } as CSSProperties}
                >
                  <DrawRule className={styles.statFill} duration={1.2} delay={0.2} />
                </span>
                <p className={styles.statLabel}>
                  クラウドを導入しない理由 第2位「セキュリティ面の不安」（第1位はコスト）
                </p>
                <p className={styles.statNote}>
                  この不安には、説明ではなく「データが外に出ない設計」そのもので答えます。
                </p>
                <p className={styles.statSrc}>
                  マネーフォワード調べ（2024年3月・法人事業者608名対象）
                </p>
              </div>
            </ScrollReveal>
          </div>

          {/* 上の一句「データは御社のパソコンから外に出ません。」を図にする＝FIG. 08-A
              （線画・入場で1回描かれ、以後は光の点が周期で流れて境界の内側で止まる）。
              版面いっぱいの図なので .dataGrid（2列）の外＝本文と統計の下に置く。
              自前で発火するため ScrollReveal で包まない（transform の二重掛けを避ける）。 */}
          <InsideDiagram />
        </div>
      </section>

      {/* ========== A-5 進め方（PROCESS）— 配線図 ========== */}
      <section id="process" className={styles.section} aria-labelledby="service-process-title">
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <FigHead figure="process" />
            <h2 id="service-process-title" className={styles.title}>進め方</h2>
          </ScrollReveal>

          {/* 配線は表示時に順に引かれる（WireSteps が自前で発火・ScrollReveal で包まない） */}
          <WireSteps steps={PROCESS} />
        </div>
      </section>

      {/* ========== A-6 料金の考え方（PRICING）— 見積図面の表 ========== */}
      <section id="pricing" className={styles.section} aria-labelledby="service-pricing-title">
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <FigHead figure="pricing" />
          </ScrollReveal>

          <div className={styles.headGrid}>
            <ScrollReveal className={styles.reveal}>
              <h2 id="service-pricing-title" className={styles.title}>
                「いくらかかるか」より先に、
                <br className={styles.brPc} />
                <Highlight className={styles.titleMark} delay={0.25}>「いくら浮くか」</Highlight>。
              </h2>
            </ScrollReveal>

            <ScrollReveal className={styles.reveal} delay={0.1}>
              <Brief>いま作業にかかっている時間と人件費を一緒に試算し、削減額に見合う範囲でお見積りします。</Brief>
            </ScrollReveal>
          </div>

          <ScrollReveal className={styles.reveal} delay={0.15}>
            <h3 className={styles.subTitle}>目指すのは、「新しく採用しなくても回る」状態。</h3>
            <p className={styles.text}>
              浮いた時間で、いまの社員の方が、より価値のある仕事に移れるようにします。
            </p>
          </ScrollReveal>

          <ScrollReveal className={styles.reveal} delay={0.2}>
            <ul className={styles.priceTable} aria-label="削減額の目安">
              {PRICE_ROWS.map((row, i) => (
                <li key={row.label} className={styles.priceRow}>
                  <span className={styles.priceMain}>
                    <span className={styles.priceLabel}>{row.label}</span>
                    <span className={styles.priceLeader} aria-hidden="true" />
                    <span className={styles.priceArrow} aria-hidden="true">→</span>
                    <span className={styles.priceAmount}>{row.amount}</span>
                  </span>
                  {/* 寸法バー：長さは value / 最大値（データから） */}
                  <span
                    className={styles.priceBar}
                    aria-hidden="true"
                    style={{ "--pct": `${(row.value / PRICE_MAX) * 100}%` } as CSSProperties}
                  >
                    <DrawRule className={styles.priceFill} duration={0.9} delay={0.1 * i} />
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.priceTableNote}>削減額の目安（人件費換算）</p>
          </ScrollReveal>

          <ScrollReveal className={styles.reveal} delay={0.25}>
            <h3 className={styles.subTitle}>初回のお取引に限り、優待価格をご用意しています。</h3>
            <p className={styles.text}>
              導入事例としてご紹介いただけることが、条件です。
            </p>
          </ScrollReveal>

          <ScrollReveal className={styles.reveal} delay={0.3}>
            <h3 className={styles.subTitle}>導入後は、月額の伴走も。</h3>
            <p className={styles.text}>
              仕組みが定着したあとも、月額でお付き合いを続けることができます。新しい業務への広げ方、社員の方からの質問、AIの更新への追従を、引き続き私が見ます。
            </p>
            {/* Web制作の料金＝小さな導線 */}
            <p className={`${styles.note} ${styles.noteSmall}`}>
              Web制作の料金は、
              <Link href="/works#price" className={styles.inlineLink}>Web制作ページ</Link>
              の料金表をご覧ください。
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== A-7 よくある質問（FAQ）— 索引カード（ネイティブ details/summary） ========== */}
      <section id="faq" className={styles.section} aria-labelledby="service-faq-label">
        <div className={styles.inner}>
          {/* 契約ファイル A-7 に h2 文言は無い（ラベル FAQ のみ）＝文言を足さない */}
          <ScrollReveal className={styles.reveal}>
            <FigHead figure="faq" id="service-faq-label" />
          </ScrollReveal>

          <ScrollReveal className={styles.reveal} delay={0.1}>
            <div className={styles.faqList}>
              {FAQ.map((item, i) => (
                <details key={item.q} className={styles.faqItem}>
                  <summary className={styles.faqQ}>
                    <span className={styles.faqNum}>{pad2(i + 1)}</span>
                    <span className={styles.faqQText}>{item.q}</span>
                  </summary>
                  <div className={styles.faqA}>
                    <p className={styles.faqAText}>{renderAnswer(item)}</p>
                  </div>
                </details>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== A-8 CTA — トップと同一コンポーネントをそのまま再利用 ========== */}
      <CtaSection />
    </main>
  );
}
