"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useFVPhase } from "@/components/fv/useFVPhase";
import { formatDuration } from "@/lib/caseCatalog";
import type { CaseDuration, CaseStudy, FdeIntro } from "@/types/case";
import styles from "./CasesFV.module.css";

/**
 * /cases の FV「現場に入って、AIが回るまで」（2026-09-16 格上げ）。
 *
 * 舞台は SubPageFVAnim（customEntrance）。ここは独自の入場だけを持つ：
 *   0.00 暖黒の現場。左の外から灯が入り、横切っていく
 *   0.05 灯が通ったところから机の横罫が引かれる（順に）
 *   0.55 地が紙色へ転調する（暖黒の層が引いていく＝「現場に入った」）
 *   0.72 導入前の帯（薄墨のトラック）が出る
 *   0.80 帯が導入後の長さへ縮み、上の数字が導入前→導入後へカウントダウンする
 *   1.00 収縮（SubPageFVAnim）：帯の層＝data-fv-depth が奥へ沈む
 *   1.05 題字 FDE ＋ 正式名称 ＋ 一言 が立ち上がる
 *
 * - 帯は12本＝事例の件数。縮んだ先の長さは各事例の (AI＋人)÷導入前、色は各事例の accent。
 *   同じ図を一覧側では描かない（数字は各カードに文字で出る）ので二重にならない。
 * - 数字のカウントダウンは代表1件（6選のうち手作業との差が最も大きい事例）。
 *   値は data/cases.ts の実測値どうしを結ぶだけで、新しい数字は作らない。
 * - 動きは transform / opacity / background の位置だけ。filter・blend・3D・vw は使わない。
 * - prefers-reduced-motion では終端値を即置き（暖黒の層は最初から無い）。
 * - JS が無い環境でも、SSR が最終値（導入後の時間）を出しているので数字は正しい。
 */

/** 机の横罫（FV の高さに対する位置％）。灯が通った順に引かれる */
const DESK_RULES = [32, 41, 50, 59, 68, 77, 86];

/** カウントダウンの開始の遅れ（ms）＝帯が縮み始めるのと揃える */
const COUNT_DELAY_MS = 800;
/** カウントダウンにかける時間（ms） */
const COUNT_DURATION_MS = 1100;

/** 導入後の合計（人＋AI）。帯の比率と代表の選定にだけ使う（画面には出さない） */
function afterTotal(c: CaseStudy): number {
  return c.after.ai.minutes + (c.after.human?.minutes ?? 0);
}

/**
 * 代表の1件＝6選のうち「手作業との差が最も大きい」事例。
 * 事例を足し引きしても自動で決まる（no や slug をハードコードしない）。
 */
function pickRepresentative(cases: CaseStudy[]): CaseStudy | null {
  const pool = cases.filter((c) => c.isPickUp);
  const src = pool.length > 0 ? pool : cases;
  if (src.length === 0) return null;
  return src.reduce(
    (best, c) =>
      c.before.minutes - afterTotal(c) > best.before.minutes - afterTotal(best) ? c : best,
    src[0]
  );
}

/** 減速（3次）。落ち方が速く、着地でゆっくり止まる＝読める */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export default function CasesFV({
  intro,
  cases,
}: {
  intro: FdeIntro;
  cases: CaseStudy[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const phase = useFVPhase(rootRef);

  const bars = cases.map((c) => {
    const raw = c.before.minutes > 0 ? afterTotal(c) / c.before.minutes : 0;
    return {
      slug: c.slug,
      accent: c.accent,
      ratio: Math.min(1, Math.max(0, raw)),
    };
  });

  const rep = pickRepresentative(cases);
  const repAfter: CaseDuration | null = rep ? rep.after.human ?? rep.after.ai : null;
  const fromMinutes = rep ? rep.before.minutes : 0;
  const toMinutes = repAfter ? repAfter.minutes : 0;
  const finalText = repAfter ? formatDuration(repAfter) : "";

  useEffect(() => {
    if (startedRef.current || phase === "idle") return;
    const el = numRef.current;
    if (!el || !finalText) return;
    startedRef.current = true;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || phase === "settled") {
      el.textContent = finalText;
      return;
    }

    let begun = 0;
    const step = (now: number) => {
      if (!begun) begun = now;
      const t = Math.min(1, (now - begun) / COUNT_DURATION_MS);
      el.textContent =
        t >= 1 ? finalText : formatDuration({ minutes: fromMinutes + (toMinutes - fromMinutes) * easeOut(t) });
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      el.textContent = formatDuration({ minutes: fromMinutes });
      rafRef.current = requestAnimationFrame(step);
    }, COUNT_DELAY_MS);
  }, [phase, finalText, fromMinutes, toMinutes]);

  // 後片付けはアンマウント時だけ（位相が進むたびに走らせない）
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.stage} data-phase={phase}>
      {/* ---- 現場（暖黒）＋灯。紙色へ転調して引いていく ---- */}
      <div className={styles.scene} aria-hidden="true">
        <span className={styles.lamp} />
        {DESK_RULES.map((top, i) => (
          <span
            key={top}
            className={styles.deskRule}
            style={{ top: `${top}%`, "--rule-i": i } as CSSProperties}
          />
        ))}
      </div>

      <div className={styles.fvInner}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowNo}>{intro.eyebrow}</span>
          <span className={styles.eyebrowRule} aria-hidden="true" />
          <span className={styles.eyebrowName}>{intro.title}</span>
        </p>

        <h1 className={styles.title}>{intro.pageTitle}</h1>
        <p className={styles.titleEn}>{intro.pageTitleEn}</p>
        <p className={styles.tagline}>{intro.tagline}</p>
        <p className={styles.count}>{cases.length} CASES</p>

        <div className={styles.chart} data-fv-depth="0.5">
          {rep && repAfter ? (
            <>
              <p className={styles.hero}>
                <span className={styles.heroBefore}>
                  導入前 {formatDuration(rep.before)}（見積）
                </span>
                <span className={styles.heroArrow} aria-hidden="true">
                  →
                </span>
                <span className={styles.heroAfter}>
                  導入後{" "}
                  {rep.after.human ? (
                    <>
                      人{" "}
                      <span ref={numRef} className={styles.heroNum}>
                        {finalText}
                      </span>
                      <span className={styles.heroSub}>
                        （AI {formatDuration(rep.after.ai)}）
                      </span>
                    </>
                  ) : (
                    <>
                      <span ref={numRef} className={styles.heroNum}>
                        {finalText}
                      </span>
                      <span className={styles.heroSub}>（AIが動いた時間）</span>
                    </>
                  )}
                </span>
              </p>
              <p className={styles.heroCase}>
                <span className={styles.heroCaseNo}>{rep.no}</span>
                {rep.title}
              </p>
            </>
          ) : null}

          <ul className={styles.bars} aria-hidden="true">
            {bars.map((b, i) => (
              <li key={b.slug} className={styles.bar}>
                <span
                  className={styles.barTrack}
                  style={
                    {
                      "--case-ratio": b.ratio,
                      "--case-i": i,
                      "--case-accent": b.accent,
                    } as CSSProperties
                  }
                >
                  <span className={styles.barFill} />
                </span>
              </li>
            ))}
          </ul>

          {/* 帯が何を表すかは、この1行で常に読める（灰と墨の区別が付かないのを防ぐ） */}
          <p className={styles.legend}>
            <span className={styles.legendItem}>薄い帯＝導入前（手作業・見積）</span>
            <span className={styles.legendSep} aria-hidden="true">／</span>
            <span className={styles.legendItem}>濃い帯＝導入後（人の時間＋AIの稼働）</span>
          </p>
        </div>
      </div>
    </div>
  );
}
