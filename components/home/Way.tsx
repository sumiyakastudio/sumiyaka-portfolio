import Image from "next/image";
import LoopVideo from "@/components/photo/LoopVideo";
import { photoLoops } from "@/data/photoLoops";
import ScrollReveal from "@/components/animation/ScrollReveal";
import DrawRule from "@/components/animation/DrawRule";
import Highlight from "@/components/animation/Highlight";
import sv from "@/components/service/service-body.module.css";
import WaySteps from "./WaySteps";
import styles from "./Way.module.css";

/**
 * 働き方（THE WAY・#way）— P9（2026-08-27）→ **P12「1画面1メッセージ」で作り直し（2026-09-06）**。
 * 文言は正本 `P12_原稿_減量差分.md` トップ THE WAY の
 * 【可視】どおり（削除指示の文は載せない・詳細は WaySteps の Disclose へ）。
 *
 * 型：h2（一句ずつ着地）→ 社長の2声 → 要約の板（大きく・落ち影）＋現場写真
 *     → 対比「コンサルティングでは、ありません。」（墨のマーカー）→ 3工程（縦のレール）。
 * P11 の「3枚が上下に揺れる」は廃止（レールの灯に置き換え）。
 * 「安心して、任せられますか。」は独立ブロック（components/home/Trust・#trust-top）へ移設。
 *
 * P17（2026-09-20・トップのハブ化）＝トップから /service へ移設（FIG. 02 THE WAY）。
 *  - 節の枠（section#way / inner / 図番見出し）は app/service/page.tsx が持つ＝ここは中身だけ。
 *  - 章番号（SectionMark）と data-top-*・地の演出（washTop）は外した。
 *  - 共通語彙は top-body.module.css → components/service/service-body.module.css へ。
 *  - 文言・写真・構成・動きは不変。
 */
type Props = {
  /** 見出しの id（section の aria-labelledby から参照される） */
  titleId?: string;
};

export default function Way({ titleId }: Props) {
  return (
    <>
      {/* h2＝句ごとに着地（Atari の作法） */}
      <h2 id={titleId} className={styles.title}>
        <ScrollReveal as="span" className={styles.phrase}>
          新人を育てるように、
        </ScrollReveal>
        <ScrollReveal as="span" className={styles.phrase} delay={0.18}>
          御社のAIを育てます。
        </ScrollReveal>
      </h2>

      {/* 社長の2声（読者の心の声＝残す・小さく引用体で） */}
      <ScrollReveal className={styles.voices} delay={0.1}>
        <p className={styles.voice}>
          「AIが話題になっている。でも、実際にどうしたらいいのか分からない。」
        </p>
        <p className={styles.voice}>
          「社員にAIを渡した。でも、使い方までは教えられない。」
        </p>
      </ScrollReveal>

      {/* 要約の板＋現場写真（PC＝2カラム／SP＝縦積み） */}
      <div className={styles.proof}>
        {/* 板の中は文節でだけ折る（word-break: keep-all＋<wbr>）。文言は不変＝<wbr> は折り目の候補を足すだけ。
            PC で板が 528px に狭まり「教え込／む。」「手を離／します。」と語の途中で折れたため（2026-10-03） */}
        <ScrollReveal className={`${sv.plate} ${styles.plate}`} delay={0.05}>
          <p className={`${sv.summary} ${styles.phrased}`}>
            AIを<wbr />
            「入れる」のでは<wbr />
            なく、<wbr />
            御社の<wbr />
            仕事の<wbr />
            やり方を<wbr />
            教え込む。<wbr />
            社員の方が<wbr />
            自分で<wbr />
            回せるように<wbr />
            なったら、<wbr />
            私は手を離します。
          </p>
          <p className={`${styles.kicker} ${styles.phrased}`}>
            <Highlight delay={0.2}>
              コンサルティングでは、<wbr />
              ありません。
            </Highlight>
          </p>
          <p className={`${sv.body} ${styles.sub} ${styles.phrased}`}>
            助言や<wbr />
            資料を<wbr />
            納めて<wbr />
            終わりにせず、<wbr />
            社員の方と<wbr />
            一緒に<wbr />
            手を動かします。
          </p>
        </ScrollReveal>

        {/* 写真は実写（原比率1264×948・トリミングなし・CSSフィルタ不使用）。
            2026-10-03：PC は写真が主役の比率（最大 520px・板と上端そろえ）／1023px 以下は板の下に縦積み */}
        <ScrollReveal as="figure" className={styles.fig} delay={0.15}>
          <div className={styles.frame}>
            <LoopVideo clip={photoLoops.teaching} className={styles.media}>
              <Image
                src="/service/teaching.webp"
                alt="少人数の勉強会でモニターを指して説明する導入指導の様子"
                width={1264}
                height={948}
                sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1023px) 640px, 520px"
                className={styles.img}
              />
            </LoopVideo>
          </div>
          <figcaption className={styles.caption}>クライアント先での導入指導（少人数の勉強会）</figcaption>
        </ScrollReveal>
      </div>

      {/* 3工程 */}
      <ScrollReveal className={styles.head}>
        <DrawRule className={styles.headRule} duration={0.6} delay={0.1} />
        <h3 className={styles.headTitle}>やることは、三つです。</h3>
      </ScrollReveal>
      <WaySteps />
    </>
  );
}
