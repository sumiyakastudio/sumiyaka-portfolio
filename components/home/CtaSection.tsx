import Link from "next/link";
import InViewGate from "@/components/animation/InViewGate";
import ScrollReveal from "@/components/animation/ScrollReveal";
import styles from "./CtaSection.module.css";

/**
 * CTA — 「闇の中に、一つの灯」（REVIEW2 刷新・2026-08-18）
 * 墨×灯の世界観：闇（墨）の底に小さな灯がともり、その光の下に
 * 大きな問いかけ→墨の筆致の罫→自ら灯るボタン、という縦一列の構図。
 * 背景には沈み巨大タイポ「灯」（読ませない・既存モチーフ踏襲）。
 * 文言3点は不変。演出は transform/opacity のみ（filter アニメ・blend 不使用）。
 * 「無料相談」→ /contact。
 */
export default function CtaSection() {
  return (
    // 灯の呼吸（常時の CSS アニメ）は画面に入っている間だけ回す（.live の時だけ running）
    <InViewGate as="section" className={styles.section} activeClassName={styles.live} threshold={0}>
      {/* 沈み巨大タイポ（装飾・読ませない） */}
      <span className={styles.ghost} aria-hidden="true">
        灯
      </span>

      <div className={styles.wrap}>
        {/* 灯：小さな火とにじむ暈（opacity/transform の呼吸のみ） */}
        <ScrollReveal>
          <span className={styles.lamp} aria-hidden="true">
            <span className={styles.lampHalo} />
            <span className={styles.lampCore} />
          </span>
        </ScrollReveal>

        {/* 大きな問いかけ */}
        <ScrollReveal delay={0.15}>
          <p className={styles.lead}>机の上の手作業を、そのままお聞かせください。</p>
        </ScrollReveal>

        {/* 墨の筆致の罫 → 灯るボタン → 注記 */}
        <ScrollReveal delay={0.3}>
          <svg
            className={styles.strokeRule}
            viewBox="0 0 240 12"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M3 6.8 C 34 3.6, 68 8.4, 104 6.2 C 142 4.0, 178 8.2, 237 5.4 C 200 9.0, 160 9.4, 118 8.6 C 80 7.9, 40 8.8, 3 6.8 Z"
              fill="currentColor"
            />
          </svg>

          <Link href="/contact" className={styles.btn}>
            <span className={styles.btnGlow} aria-hidden="true" />
            <span className={styles.btnDot} aria-hidden="true" />
            無料相談
          </Link>

          <p className={styles.note}>通常24時間以内にご返信します</p>
        </ScrollReveal>
      </div>
    </InViewGate>
  );
}
