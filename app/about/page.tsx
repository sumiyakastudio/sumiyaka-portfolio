import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import SubPageFVAnim from "@/components/animation/SubPageFVAnim";
import DrawRule from "@/components/animation/DrawRule";
import Disclose from "@/components/animation/Disclose";
import Highlight from "@/components/animation/Highlight";
import CountUp from "@/components/animation/CountUp";
import DynamicInkFluid from "@/components/webgl/DynamicInkFluid";
import CtaSection from "@/components/home/CtaSection";
import AboutFVStage from "@/components/fv/about/AboutFVStage";
import InkMotes from "@/components/fv/about/InkMotes";
import InkTimeline from "@/components/about/InkTimeline";
import InkStroke from "@/components/about/InkStroke";
import AboutProgress from "@/components/about/AboutProgress";
import styles from "./page.module.css";

/* P12（2026-09-06）＝減量。文言の正本＝`P12_原稿_減量差分.md` About 節。
   各セクションを「要約（大きく）＋根拠（数字は CountUp）＋詳細は Disclose で畳む」の型に組み直し、
   要点の語句に Highlight（墨のマーカー）。原稿に無い部分（FV・BELIEF・WHAT I DON'T・SKILL SET・CTA）は現行のまま。
   読み進める装置＝左端の進捗線（AboutProgress・PC のみ）と、年表の「現在見ている年代」（InkTimeline focusClassName）。
   P10（2026-09-02）＝STANCE 段落2の末尾を「三段」の説明へ置換。P9/P6 の正本はコメント履歴として残す */

/**
 * /about — AIスペシャリスト 墨家 / SUMIYAKA の人物ページ（P6・2026-08-27）
 * 文言の正本＝`P12_原稿_減量差分.md` About 節（可視／詳細／削除）→ それ以前は `P9_原稿_top_service_about.md` B節・`P6_原稿_service_about.md` B節。
 * 構成：FV（DynamicInkFluid 維持）→ PROFILE → STANCE → TIMELINE → BELIEF →
 *       SCOPE OF WORK → WHAT I DON'T → SKILL SET → CTA（トップ CtaSection をそのまま再利用）
 *
 * 五彩改修（2026-09-05）＝「濃（のう）・墨」黒9:白1。人物ページを墨の濃淡で描く。
 *  - FV は奥（流体・data-fv-depth=1 で収縮時に沈む）と手前（墨の粒・題字）の2層
 *  - 題字は滲みの中から立ち上がる（AboutFVStage・customEntrance）
 *  - 本文は各セクションの背後に墨の洗い（静的な放射グラデ）、写真は墨の縁と台の落ち影、
 *    STANCE は筆の一線、TIMELINE は一本の筆致（SVG path）、BELIEF の番号は落款
 *  - 金 --color-accent は使わない（差し色は白系）。動きは transform/opacity/text-shadow/stroke のみ
 */

// /api/og は日本語フォント搭載済み（Geist + Noto Sans JP）。sub は日本語のまま渡す
const OG_SUB = "AI導入の設計と教育 — 墨家 / SUMIYAKA";

export const metadata: Metadata = {
  title: "ABOUT — AKASHIKI | 墨家 / SUMIYAKA",
  description:
    "墨家 / SUMIYAKA — AIスペシャリスト。大手美容外科クリニックで社内・院内SEを7年。止まれば診療が止まるシステムを守ってきた現場の当事者が、御社の仕事をAIに教え、社員の方が回せる状態まで伴走する。経歴・考え方・担当範囲・できないこと。",
  openGraph: {
    images: [
      {
        url: `/api/og?title=ABOUT&sub=${encodeURIComponent(OG_SUB)}`,
        width: 1200,
        height: 630,
      },
    ],
  },
};

/* ---- B-4 年表（P12＝各1行に短縮。数字は CountUp） ---- */
const TIMELINE: { when: string; text: ReactNode }[] = [
  {
    when: "9歳",
    text: "初めて触れたのは、スマホでもゲームでもなく、パソコンでした。インターネットはどう動いているのか——関心の始まり。",
  },
  {
    when: "15歳",
    text: (
      <>
        WordPressとHTML/CSS/JavaScriptを独学。サーバー契約からサイト公開、オリジナルテーマ作成まで自力でやり切り、「作る側」に。以来、
        <CountUp value={15} prefix="約" suffix="年" className={styles.num} />。
      </>
    ),
  },
  {
    when: "専攻",
    text: "高校（情報技術科）から理系大学まで、情報技術を専攻。22歳で卒業。",
  },
  {
    when: "22〜29歳",
    text: "大手美容外科クリニックで社内・院内SEを7年。止まれば診療が止まるシステムの導入・運用・障害対応。",
  },
  {
    when: "2022年12月",
    text: "ChatGPT公開初日に登録。趣味ではなく仕事で。",
  },
  {
    when: "29歳〜",
    text: "独立。AI導入の設計・教育、業務効率化の設計と実装、Web制作を、一人で。",
  },
];

/* ---- B-5 信条 ---- */
const BELIEFS = [
  {
    num: "01",
    heading: "主張は、証拠で裏取りする",
    text: "「効果があります」とは言いません。削減できる時間を一緒に試算し、数字で示せることだけを約束します。盛らない。裏取りする。誤りは、自分で訂正する。",
  },
  {
    num: "02",
    heading: "納品して終わりにしない",
    text: "仕組みを渡した日が、始まりです。社員の方が自分で回せるようになるまで教え、手順書を残し、定着してから手を離します。ゴールは、私が要らなくなることです。",
  },
  {
    num: "03",
    heading: "仕組みで速く、手で仕上げる",
    text: "まず動くものを作り、実際のファイルで確かめながらブラッシュアップする。構造から考え、設計で差をつけ、最後は人の目で一つひとつ確認します。AIが作ったものも、例外ではありません。",
  },
];

/* ---- B-7 引き受けないこと ---- */
const DONTS = [
  { name: "手書き書類のスキャン画像の読み取り", desc: "読み取り精度を保証できないため。" },
  { name: "人の判断そのものの置き換え", desc: "例外対応や承認は、人に残すべき仕事です。" },
  { name: "全業務の一括自動化", desc: "効果の大きい作業から、一つずつ確実に。" },
];

/* ---- B-8 スキル ---- */
const SKILLS = [
  {
    num: "01",
    name: "AI導入の設計・教育",
    desc: "御社の仕事をAIに教え込む実装。AIに任せる作業と人に残す判断の切り分け、手順書化、社内で回せるようになるまでの伴走",
  },
  {
    num: "02",
    name: "業務設計・ヒアリング",
    desc: "実際の現場で業務の流れとファイルを見て、転記が生まれる「あいだ」と、AIに任せられる作業を見つけ、順番を決める",
  },
  {
    num: "03",
    name: "業務ツール開発",
    desc: "Excel・CSV・PDFの統合・突合・帳票生成・データ整備。ブラウザの中だけで完結する設計",
  },
  {
    num: "04",
    name: "Web制作",
    desc: "HTML/CSS/JavaScript、React/Next.js、WordPress、STUDIO、Figma。企画から公開まで",
  },
  {
    num: "05",
    name: "AIO・構造化データ",
    desc: "AI検索・AIアシスタントに正確に読まれるための、セマンティックHTMLと構造化データ",
  },
  {
    num: "06",
    name: "システム運用・セキュリティ",
    desc: "院内システムの導入・運用・障害対応を7年。AIに何を渡し、何を渡さないか——止めない運用と、情報を守る設計",
  },
];

/* 各セクション先頭の「かすれた一線」（最初のセクションには置かない） */
function SectionRule() {
  return (
    <div className={styles.ruleRow}>
      <DrawRule className={styles.rule} />
    </div>
  );
}

export default function AboutPage() {
  return (
    <main className={styles.page}>
      {/* ========== B-1 FV（DynamicInkFluid・読み込み方とフォールバックは現行維持）
          奥＝流体（data-fv-depth=1・収縮で沈む）／手前＝墨の粒・題字（残る） ========== */}
      <SubPageFVAnim className={styles.fv} customEntrance>
        <AboutFVStage className={styles.fvStage} stillClassName={styles.fvStill}>
          <div className={styles.fvDeep} data-fv-depth="1">
            <DynamicInkFluid />
            <div className={styles.fvDeepVeil} aria-hidden="true" />
          </div>
          <InkMotes />
          <div className={styles.fvGrain} aria-hidden="true" />
          <div className={styles.fvContent}>
            <span data-about-fv="label" className={styles.fvLabel} aria-hidden="true">
              ABOUT
            </span>
            <h1 data-about-fv="title" className={styles.fvTitle}>
              机上ではなく、<br className={styles.brSp} />現場から。
            </h1>
            <p data-about-fv="sub" className={styles.fvSub}>
              AI導入の設計と教育 — 墨家 / SUMIYAKA
            </p>
            <span data-about-fv="hr" className={styles.fvHr} aria-hidden="true" />
          </div>
          <span data-about-fv="drip" className={styles.fvDrip} aria-hidden="true" />
        </AboutFVStage>
      </SubPageFVAnim>

      {/* 進捗線（左端・PC のみ・body へ portal）。対象＝下の各 section[data-about-sec] */}
      <AboutProgress />

      {/* ========== B-2 PROFILE — 墨の縁の写真＋本文の2カラム
          P12＝h2（7年＝CountUp）→ 要約（墨の台の上に浮かせる）→ 段落2つ（「繋がっていない」＝Highlight）→ 詳細は Disclose ========== */}
      <section
        className={`${styles.sec} ${styles.secProfile}`}
        aria-labelledby="about-profile-title"
        data-about-sec="01"
        data-about-label="PROFILE"
      >
        <div className={`${styles.inner} ${styles.innerFirst}`}>
          <ScrollReveal className={styles.reveal}>
            <span className={styles.label}>PROFILE</span>
          </ScrollReveal>

          <div className={styles.profileGrid}>
            <ScrollReveal as="figure" className={`${styles.reveal} ${styles.portrait}`} delay={0.1}>
              {/* 墨の縁＝四辺に内へ向かう墨のグラデ（overlay の疑似要素・CSS filter 不使用）＋台からの落ち影 */}
              <div className={styles.portraitFrame}>
                <Image
                  src="/about/profile.webp"
                  alt="SUMIYAKA"
                  width={800}
                  height={766}
                  sizes="(max-width: 767px) 92vw, (max-width: 1279px) 34vw, 420px"
                  className={styles.portraitImg}
                  priority
                />
              </div>
              <figcaption className={styles.portraitCaption}>SUMIYAKA — 墨家</figcaption>
            </ScrollReveal>

            <div className={styles.profileText}>
              <ScrollReveal className={styles.reveal}>
                <h2 id="about-profile-title" className={styles.title}>
                  事故が許されない現場で、システムを
                  <CountUp value={7} suffix="年" className={styles.num} />
                  守ってきました。
                </h2>
              </ScrollReveal>

              <ScrollReveal className={styles.reveal} delay={0.08}>
                <p className={styles.profileLead}>
                  机上のコンサルティングではなく、「現場の当事者」としての経験がもとになっています。
                </p>
              </ScrollReveal>

              <ScrollReveal className={styles.reveal} delay={0.14}>
                <p className={styles.body}>
                  大手美容外科クリニックで、予約・電子カルテ・会計——止まれば診療が止まるシステムを7年。求められたのは、一切の曖昧さを排した正確性と、絶対に止めない安定性でした。
                </p>
                <p className={styles.body}>
                  そこで見たのは、システムが「無い」現場ではなく、システム同士が
                  <Highlight>「繋がっていない」</Highlight>
                  現場です。だから人が転記し、照合し、月末に半日を失う。業務が止まる現場を見てきたから——それが、この仕事をしている理由です。
                </p>
              </ScrollReveal>

              <ScrollReveal className={styles.reveal} delay={0.2}>
                <Disclose className={styles.disclose}>
                  <p className={styles.detail}>
                    2022年12月、ChatGPTの公開初日に登録しました。趣味ではなく、仕事のためです。医療機関の中で使う以上、何を渡さないかから決めました。メールの返信案から、スケジュール管理、プログラミングの補助へと、任せる範囲を一つずつ広げ、その後29歳で独立。AIを実務で使い続けて、4年目になります。
                  </p>
                </Disclose>
              </ScrollReveal>

              <ScrollReveal className={styles.reveal} delay={0.25}>
                <div className={styles.profileSns}>
                  <a
                    href="https://github.com/sumiyakastudio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.snsLink}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                    </svg>
                    sumiyakastudio
                  </a>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* ========== B-3 STANCE — このページ最大級の見出し＋段落の左に筆の一線
          P12＝要約（白・大きく、「使う側」＝Highlight）→ 段落（三段）→ 強調の一行（最深の墨の帯の上に明朝で浮かせる）→ 詳細は Disclose（FDE／顔を合わせて） ========== */}
      <section
        className={`${styles.sec} ${styles.secStance}`}
        aria-labelledby="about-stance-title"
        data-about-sec="02"
        data-about-label="STANCE"
      >
        <SectionRule />
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <span className={styles.label}>STANCE</span>
            <h2 id="about-stance-title" className={styles.stanceTitle}>AIを使う側に、立つ。</h2>
          </ScrollReveal>
          <div className={styles.stanceBlock}>
            <InkStroke axis="y" className={styles.stanceStroke} duration={1.6} />
            <div className={styles.stanceText}>
              <ScrollReveal className={styles.reveal} delay={0.1}>
                <p className={styles.stanceLead}>
                  仕事は二つに分かれる。AIにできないことをする側か、AIを<Highlight>使う側</Highlight>か。私は、後者でありたい。
                </p>
              </ScrollReveal>
              <ScrollReveal className={styles.reveal} delay={0.15}>
                <p className={styles.stanceBody}>
                  会社の業務がどう回るかを分かった上で、技術を当てる。だから仕事を三段に分けています——御社専用の道具を渡す、その道具をAIに使わせる、社員の方が自分で作れるようにする。
                </p>
              </ScrollReveal>
            </div>
          </div>

          <ScrollReveal className={styles.reveal} delay={0.1}>
            <p className={styles.stanceStatement}>
              <span className={styles.stanceStatementText}>
                それでも、仕事は人と人との間に生まれる。<br />
                AIで速くなった分は、そこに使いたい。
              </span>
            </p>
          </ScrollReveal>

          {/* P9 B-3 段落3・4 → P12 で詳細へ（FDE の注釈はここだけ。欧文も和文段落と同じフォント指定のまま） */}
          <ScrollReveal className={styles.reveal} delay={0.15}>
            <Disclose className={`${styles.disclose} ${styles.discloseStance}`}>
              <p className={styles.detail}>
                海外では、こうした働き方を Forward Deployed Engineer（FDE）と呼び始めています。AIの技術と、お客様ごとの業務の両方を知っていて、現場に入って一緒に作る人。私はそれを、中小企業の規模で、一人でやっています。
              </p>
              <p className={styles.detail}>
                顔を合わせて分かること、言葉にならない気遣い、長く付き合うから生まれる信頼。効率では測れないものが、最後に残ります。
              </p>
            </Disclose>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== B-4 TIMELINE — 一本の筆致（SVG path が上から下へ・各年代で墨が滲む）
          P12＝各1行。PC では「現在見ている年代」の点が濃くなる（InkTimeline focusClassName） ========== */}
      <section
        className={`${styles.sec} ${styles.secTimeline}`}
        aria-label="年表"
        data-about-sec="03"
        data-about-label="TIMELINE"
      >
        <SectionRule />
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <span className={styles.label}>TIMELINE</span>
          </ScrollReveal>
          <ScrollReveal className={styles.reveal} delay={0.1}>
            <InkTimeline className={styles.tl} strokeClassName={styles.tlStroke} focusClassName={styles.tlNow}>
              {TIMELINE.map((row) => (
                <li key={row.when} className={styles.tlItem} data-tl-item>
                  <span className={styles.tlWhen}>{row.when}</span>
                  <span className={styles.tlMark} aria-hidden="true">
                    <i className={styles.tlHalo} />
                    <i className={styles.tlDot} data-tl-dot />
                  </span>
                  <p className={styles.tlText}>{row.text}</p>
                </li>
              ))}
            </InkTimeline>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== B-5 BELIEF — 3列（番号は落款・右2列の背後に墨の面） ========== */}
      <section
        className={`${styles.sec} ${styles.secBelief}`}
        aria-label="信条"
        data-about-sec="04"
        data-about-label="BELIEF"
      >
        <SectionRule />
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <span className={styles.label}>BELIEF</span>
          </ScrollReveal>
          <div className={styles.beliefGrid}>
            <span className={styles.beliefSlab} aria-hidden="true" />
            {BELIEFS.map((item, i) => (
              <ScrollReveal key={item.num} className={`${styles.reveal} ${styles.beliefCell}`} delay={i * 0.1}>
                <article className={styles.beliefCard}>
                  <span className={styles.beliefNum}>{item.num}</span>
                  <h3 className={styles.beliefHeading}>{item.heading}</h3>
                  <p className={styles.beliefText}>{item.text}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ========== B-6 SCOPE OF WORK — 担当範囲（小見出し2枠＝墨の面＋インク密度の縦バー）
          P12＝段落を1つに短縮（「分業も外注もありません。」＝下線の Highlight） ========== */}
      <section
        className={`${styles.sec} ${styles.secScope}`}
        aria-labelledby="about-scope-title"
        data-about-sec="05"
        data-about-label="SCOPE OF WORK"
      >
        <SectionRule />
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <span className={styles.label}>SCOPE OF WORK</span>
            <h2 id="about-scope-title" className={styles.title}>企画から公開まで、すべて私一人で。</h2>
          </ScrollReveal>
          <ScrollReveal className={styles.reveal} delay={0.1}>
            <p className={styles.scopeLead}>
              Web制作も、業務ツールも、AI導入も、企画・設計・実装・教育・公開まで、途中で担当が変わることはありません。
              <Highlight variant="under" className={styles.hlUnder}>分業も外注もありません。</Highlight>
              Works に載せているものは、すべてこの体制で手がけたものです。
            </p>
          </ScrollReveal>

          <div className={styles.scopeSub}>
            <ScrollReveal className={`${styles.reveal} ${styles.scopeCell}`} delay={0.15}>
              <div className={styles.scopeItem}>
                <h3 className={styles.scopeItemHeading}>対応できる媒体</h3>
                <p className={styles.scopeItemText}>
                  静的サイト、WordPress、STUDIO、Figma。制作物はすべて静的データで持っているため、いずれの媒体へも丸ごと移せます。
                </p>
              </div>
            </ScrollReveal>
            <ScrollReveal className={`${styles.reveal} ${styles.scopeCell}`} delay={0.2}>
              <div className={styles.scopeItem}>
                <h3 className={styles.scopeItemHeading}>支給データからの実装</h3>
                <p className={styles.scopeItemText}>
                  デザインが既にある場合は、Figma／XD からの実装だけも承ります。
                </p>
              </div>
            </ScrollReveal>
          </div>

          <ScrollReveal className={styles.reveal} delay={0.25}>
            <Link href="/works" className={styles.moreLink}>
              Web制作の実績を見る <span aria-hidden="true">→</span>
            </Link>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== B-7 WHAT I DON'T — 引き受けないこと（最も深い墨の帯・題字に静的な墨の一線） ========== */}
      <section
        className={`${styles.sec} ${styles.secDont}`}
        aria-labelledby="about-dont-title"
        data-about-sec="06"
        data-about-label="WHAT I DON'T"
      >
        <SectionRule />
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <span className={styles.label}>WHAT I DON&apos;T</span>
            <h2 id="about-dont-title" className={styles.title}>引き受けないこと。</h2>
          </ScrollReveal>
          <ScrollReveal className={styles.reveal} delay={0.1}>
            <ul className={styles.dontList}>
              {DONTS.map((item) => (
                <li key={item.name} className={styles.dontItem}>
                  <span className={styles.dontName}>
                    <span className={styles.dontStrike}>{item.name}</span>
                  </span>
                  <span className={styles.dontDesc}>{item.desc}</span>
                </li>
              ))}
            </ul>
          </ScrollReveal>
          <ScrollReveal className={styles.reveal} delay={0.15}>
            <div className={styles.principles}>
              <p className={styles.principle}>作っていないものは、載せません。</p>
              <p className={styles.principle}>お客様の仕組みの中身は、公開しません。</p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== B-8 SKILL SET — 行グリッド（墨の濃淡の面の上に、かすれた罫で区切る） ========== */}
      <section
        className={`${styles.sec} ${styles.secSkill}`}
        aria-label="スキル"
        data-about-sec="07"
        data-about-label="SKILL SET"
      >
        <SectionRule />
        <div className={styles.inner}>
          <ScrollReveal className={styles.reveal}>
            <span className={styles.label}>SKILL SET</span>
          </ScrollReveal>
          <div className={styles.skillList}>
            {SKILLS.map((item, i) => (
              <ScrollReveal key={item.num} className={styles.reveal} delay={i * 0.06}>
                <div className={styles.skillRow}>
                  <span className={styles.skillNum}>{item.num}</span>
                  <span className={styles.skillName}>{item.name}</span>
                  <span className={styles.skillDesc}>{item.desc}</span>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ========== B-9 CTA — トップの CtaSection をそのまま再利用（改変なし） ========== */}
      <CtaSection />
    </main>
  );
}
