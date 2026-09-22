import type { CSSProperties } from "react";
import ScrollReveal from "@/components/animation/ScrollReveal";
import CountUp from "@/components/animation/CountUp";
import DrawRule from "@/components/animation/DrawRule";
import styles from "./Atari.module.css";

/**
 * 言い当て — an-a.html .sec-insight の忠実移植。
 * 文言・統計値（60.8% / 48.2%）・出典表記は正本（an-a.html）どおり。
 *
 * P11（2026-09-03・あおきさん指示「アニメーションが欲しい」）で動きを追加：
 *  - 問いは「A社／B社／C社」を一つずつ置いてから、最後に問いが着地する（散らばりの実演）
 *  - 答えは2拍に割る
 *  - 統計は罫が引かれてから数字が 0 から書き入れられる（CountUp / DrawRule）
 * 文言・数値・出典は一言一句そのまま。動き以外は変えていない。
 *
 * P17（2026-09-20・トップのハブ化）＝トップから /service へ移設（FIG. 01 INSIGHT）。
 *  - 節の枠（section / inner / 図番見出し）は app/service/page.tsx が持つ＝ここは中身だけ。
 *  - 章番号（SectionMark）と data-top-* は外した（トップ専用の仕組みから切り離し）。
 *  - 文言・数値・出典・動きはそのまま。書体だけ /service（線と図面）へ揃えた。
 *
 * P17 追補（2026-09-20）＝2つの統計に寸法バーを追加。
 *  - 同ページ DATA 節（app/service/page.tsx の .statTrack）と同じ見せ方・同じ動きを
 *    このファイル内に自前で複製（page.module.css は import しない＝完全に自己完結）。
 *  - 割合はここに既にある数値（60.8 / 48.2）を1箇所の定数に集約し、CountUp とバー両方が参照する。
 */
type Props = {
  /** 見出しの id（section の aria-labelledby から参照される） */
  titleId?: string;
};

/** 統計の割合＝この2つの定数だけを CountUp と寸法バーの両方が参照する（数値の重複記述をしない） */
const STAT_DOUBLE_ENTRY = 60.8;
const STAT_DATA_ENTRY = 48.2;

export default function Atari({ titleId }: Props) {
  return (
    <>
      {/* 句ごとに現れる＝3社のデータが別々に置かれ、最後に問いが立つ */}
      <h2 id={titleId} className={styles.q}>
        <ScrollReveal as="span" className={styles.qPhrase}>
          A社のCSVと、
        </ScrollReveal>
        <ScrollReveal as="span" className={styles.qPhrase} delay={0.14}>
          B社のExcelと、
        </ScrollReveal>
        <ScrollReveal as="span" className={styles.qPhrase} delay={0.28}>
          C社のPDFを、
        </ScrollReveal>
        <ScrollReveal as="span" className={styles.qPhrase} delay={0.5}>
          人が手で転記していませんか。
        </ScrollReveal>
      </h2>
      <p className={styles.answer}>
        <ScrollReveal as="span" className={styles.qPhrase} delay={0.1}>
          システムが無いのではなく、繋がっていない。
        </ScrollReveal>
        <ScrollReveal as="span" className={styles.qPhrase} delay={0.32}>
          だから人が転記している。
        </ScrollReveal>
      </p>
      <div className={styles.stats}>
        <ScrollReveal className={styles.stat}>
          <DrawRule className={styles.statRule} delay={0.1} />
          <p className={styles.statNum}>
            <CountUp value={STAT_DOUBLE_ENTRY} decimals={1} suffix="%" delay={0.35} />
          </p>
          {/* 寸法バー：長さは STAT_DOUBLE_ENTRY から（数字のハードコードなし） */}
          <span
            className={styles.statTrack}
            aria-hidden="true"
            style={{ "--pct": `${STAT_DOUBLE_ENTRY}%` } as CSSProperties}
          >
            <DrawRule className={styles.statFill} duration={1.4} delay={0.5} />
          </span>
          <p className={styles.statLabel}>
            システム化しても負担が減らない理由 第1位「データの二重入力が発生」
          </p>
        </ScrollReveal>
        <ScrollReveal delay={0.15} className={styles.stat}>
          <DrawRule className={styles.statRule} delay={0.25} />
          <p className={styles.statNum}>
            <CountUp value={STAT_DATA_ENTRY} decimals={1} suffix="%" delay={0.5} />
          </p>
          {/* 寸法バー：長さは STAT_DATA_ENTRY から（数字のハードコードなし） */}
          <span
            className={styles.statTrack}
            aria-hidden="true"
            style={{ "--pct": `${STAT_DATA_ENTRY}%` } as CSSProperties}
          >
            <DrawRule className={styles.statFill} duration={1.4} delay={0.65} />
          </span>
          <p className={styles.statLabel}>
            負担が大きい業務 第1位「データの入力・集計・照合」
          </p>
        </ScrollReveal>
      </div>
      <ScrollReveal>
        <p className={styles.statSrc}>
          エイトレッド調べ（2023年8月・従業員200人以下の中小企業バックオフィス担当者110名対象）
        </p>
      </ScrollReveal>
    </>
  );
}
