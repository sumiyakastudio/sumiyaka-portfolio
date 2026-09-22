"use client";

import Link from "next/link";
import { LICENSE, formatResetTime, type TrialState } from "@/lib/tools/_shared/trialLimit";
import styles from "./TrialNotice.module.css";

/**
 * お試し版の上限表示。書き出しボタンの直下に置く（6本共通）。
 *
 * 通常＝「1時間に10回まで（残り n 回）」の1行。
 * 上限＝復帰時刻と、専用版の相談導線（/contact）。
 * ⚠ 文言はここで一元管理する（6本で言い回しを割らない）。
 */
export default function TrialNotice({ trial, className }: { trial: TrialState; className?: string }) {
  const cls = [styles.note, trial.limited ? styles.limited : "", className ?? ""].filter(Boolean).join(" ");

  if (trial.limited) {
    return (
      <p className={cls} role="status" aria-live="polite" data-trial-limited data-license={LICENSE}>
        お試し版の上限（1時間に{trial.limit}回）に達しました。{formatResetTime(trial.resetAt)} に再び書き出せます。
        業務で継続して使うなら、
        <Link href="/contact" className={styles.link}>
          御社の形に合わせた専用版のご相談はこちら →
        </Link>
      </p>
    );
  }

  return (
    <p className={cls} data-trial-remaining={trial.remaining} data-license={LICENSE}>
      お試し版：書き出しは1時間に{trial.limit}回まで（残り{trial.remaining}回）。
    </p>
  );
}
