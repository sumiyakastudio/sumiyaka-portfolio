import ScrollReveal from "@/components/animation/ScrollReveal";
import CountUp from "@/components/animation/CountUp";
import DrawRule from "@/components/animation/DrawRule";
import Highlight from "@/components/animation/Highlight";
import Disclose from "@/components/animation/Disclose";
import sv from "@/components/service/service-body.module.css";
import styles from "./Trust.module.css";

/**
 * 安心（TRUST・#trust-top）— P12「1画面1メッセージ」(2026-09-06) で Way から独立させた短いブロック。
 * 文言は正本 `P12_原稿_減量差分.md` トップ「安心（TRUST）」の【可視】どおり。
 * 【詳細】（医療現場の一段落）は Disclose に畳む（既定は閉・本文は DOM に残る）。
 *
 * 型：見出し → 要約（不安の3つ）→ キーフレーズ「止めない・漏らさない。」（墨のマーカー）
 *     → 約束3行 ／ 右に経歴票（板・在籍 7年は CountUp）→ AI歴の一行 → 詳細。
 *
 * P17（2026-09-20・トップのハブ化）＝トップから /service へ移設（FIG. 06 ASSURANCE）。
 *  - 節の枠（section#trust-top / inner / 図番見出し）は app/service/page.tsx が持つ＝ここは中身だけ。
 *  - 章番号（SectionMark）と data-top-*・地の演出（沈める層）は外した。
 *  - 直後に既存の FIG. 07 TRUST（「AIへの不安に、先にお答えします。」）が続く＝問いと答えの対。
 *  - 見出しは節の主見出しになったため h3 → h2（文言は不変）。
 */
const PROMISES = [
  "何を渡し、何を渡さないかを、先に決める",
  "どこまで自動で動かし、どこで止めるかを、設計する",
  "想定外の対処を、社員の方ができる状態にする",
];

type Props = {
  /** 見出しの id（section の aria-labelledby から参照される） */
  titleId?: string;
};

export default function Trust({ titleId }: Props) {
  return (
    <div className={styles.grid}>
      {/* 左＝問い・要約・キーフレーズ・約束 */}
      <div className={styles.text}>
        <h2 id={titleId} className={styles.title}>
          <ScrollReveal as="span" className={styles.phrase}>
            安心して、
          </ScrollReveal>
          <ScrollReveal as="span" className={styles.phrase} delay={0.16}>
            任せられますか。
          </ScrollReveal>
        </h2>
        <ScrollReveal delay={0.1}>
          <p className={`${sv.summary} ${styles.summary}`}>
            ためらう理由は、機能ではなく不安です。
            <span className={styles.ask}>情報は漏れないか。</span>
            <span className={styles.ask}>穴は残らないか。</span>
            <span className={styles.ask}>想定外のとき、誰が対処するのか。</span>
          </p>
        </ScrollReveal>
        <ScrollReveal delay={0.15}>
          <p className={styles.key}>
            <Highlight delay={0.25}>止めない・漏らさない。</Highlight>
          </p>
        </ScrollReveal>
        <ul className={styles.list}>
          {PROMISES.map((t, i) => (
            <ScrollReveal
              as="li"
              key={t}
              className={styles.item}
              direction="right"
              delay={0.08 * i}
            >
              <DrawRule className={styles.itemRule} duration={0.5} delay={0.15 + 0.1 * i} />
              {t}
            </ScrollReveal>
          ))}
        </ul>
      </div>

      {/* 右＝経歴票（板）・AI歴・詳細 */}
      <ScrollReveal className={`${sv.plate} ${styles.ledger}`} delay={0.12}>
        <dl className={styles.record}>
          <DrawRule className={styles.recordRule} delay={0.1} />
          <div className={styles.row}>
            <dt className={styles.k}>現場</dt>
            <dd className={styles.v}>大手美容外科クリニック</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.k}>担当</dt>
            <dd className={styles.v}>院内システム・サーバー保守</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.k}>在籍</dt>
            <dd className={`${styles.v} ${styles.term}`}>
              <CountUp value={7} duration={1} delay={0.35} suffix="年" />
            </dd>
          </div>
        </dl>
        <p className={styles.since}>ChatGPT公開初日から、仕事で使い続けて4年目。</p>
        <Disclose className={styles.detail}>
          <p className={sv.detail}>
            止まれば診療が止まり、漏れれば人体の情報という最上級のプライバシーが漏れる現場でした。そこで身についた作り方に、AIを掛けています。医療機関の中で使う以上、何を渡さないかから決めました。
          </p>
        </Disclose>
      </ScrollReveal>
    </div>
  );
}
