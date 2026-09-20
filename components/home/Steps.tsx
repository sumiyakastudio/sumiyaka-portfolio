import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import DrawRule from "@/components/animation/DrawRule";
import Highlight from "@/components/animation/Highlight";
import sv from "@/components/service/service-body.module.css";
import StepsLadder from "./StepsLadder";
import styles from "./Steps.module.css";

/**
 * 三段（THREE STEPS・#steps）— P10（2026-09-02）→ P11 減量 → **P12「1画面1メッセージ」(2026-09-06)**。
 * 文言は正本 `P12_原稿_減量差分.md` トップ THREE STEPS の【可視】どおり
 * （「いきなり全部を変えようとすると〜」「まずは、いま御社が〜」は削除指示）。
 * 各段の本文（現行そのまま）は StepsLadder の Disclose に畳む。
 *
 * 型：h2（一句ずつ着地）→ 要約 → 梯子（3段・数字は1段目だけ）→ 締め（墨のマーカー）。
 *
 * P17（2026-09-20・トップのハブ化）＝トップから /service へ移設（FIG. 04 THREE STEPS）。
 *  - 節の枠（section#steps / inner / 図番見出し）は app/service/page.tsx が持つ＝ここは中身だけ。
 *  - 章番号（SectionMark）と data-top-*・地の演出（washDown）は外した。
 *  - 締めの導線「進め方と、できないこと → /service」は /service 上では自己リンクになるため
 *    既定で出さない（文言は書き換えず serviceLink で切り替える）。
 */
type Props = {
  /** 見出しの id（section の aria-labelledby から参照される） */
  titleId?: string;
  /** 締めの /service への導線を出すか（/service 上では自己リンクになるので既定は false） */
  serviceLink?: boolean;
};

export default function Steps({ titleId, serviceLink = false }: Props) {
  return (
    <>
      <h2 id={titleId} className={styles.title}>
        <ScrollReveal as="span" className={styles.phrase}>
          1段目は、
        </ScrollReveal>
        <ScrollReveal as="span" className={styles.phrase} delay={0.18}>
          AIを入れません。
        </ScrollReveal>
      </h2>

      <ScrollReveal delay={0.1}>
        <p className={`${sv.summary} ${styles.summary}`}>
          AI導入には、段階があります。どの段から始めても、どの段で止めても構いません。
        </p>
      </ScrollReveal>

      <StepsLadder />

      {/* 締め＝太い罫の下に一言 */}
      <ScrollReveal className={styles.closeBlock}>
        <DrawRule className={styles.closeRule} duration={1.1} delay={0.05} />
        <p className={styles.close}>
          いきなり3段目に立てる会社は、ありません。
          <Highlight delay={0.3}>1段目だけでも、手作業は確かに減ります。</Highlight>
        </p>
        {serviceLink && (
          <p className={sv.more}>
            <Link href="/service" className={sv.moreLink}>
              進め方と、できないこと → /service
            </Link>
          </p>
        )}
      </ScrollReveal>
    </>
  );
}
