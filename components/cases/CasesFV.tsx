"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { useFVPhase } from "@/components/fv/useFVPhase";
import { formatDuration } from "@/lib/caseCatalog";
import { useFullMotion } from "@/lib/useLightVisuals";
import type { CaseDuration, CaseStudy, FdeIntro } from "@/types/case";
import styles from "./CasesFV.module.css";

/**
 * /cases の FV「現場に入って、AIが回るまで」（2026-09-16 作り直し）。
 *
 * ◆ なぜ作り直したか
 *   前の版は数字の行が3本（導入前→導入後／C-03の行／凡例）あり、3秒で読めなかった。
 *   帯グラフも小さく、図としての力が無かった（あおきさん指摘）。
 *   → 帯は**FV の背景そのもの**へ。前景は**1行の数字**だけにする。
 *   → さらに 6選のサムネを「束」として置き、WEB・TOOLS の FV と同じ密度にする。
 *
 * ◆ 舞台は SubPageFVAnim（customEntrance）。ここは独自の入場だけを持つ：
 *   0.00 暖黒の現場。左の外から灯が入り、横切っていく
 *   0.06 灯が通ったところから机の横罫が引かれる（順に）
 *   0.55 地が紙色へ転調する（暖黒の層が引いていく＝「現場に入った」）
 *   0.58 12件の帯（導入前＝薄墨・FV全幅）が上から順に左→右へ引かれる
 *   0.70 題字 FDE が筆のように左から現れる（1文字ずつ・字送り）
 *   0.95 濃い帯（導入後＝各事例のテーマ色）が全幅から各比率へ縮み、
 *        同時に数字が「導入前 → 導入後」へカウントダウンする
 *   1.00 収縮（SubPageFVAnim）：束の層＝data-fv-depth が奥へ沈む
 *   1.20 6選の札が下から順に滑り込み、扇状に広がる（各 80ms ずらし）
 *   2.10 数字が着地してわずかに沈む／以後は灯だけが弱く呼吸する
 *
 * ◆ 数字は代表1件（6選のうち手作業との差が最も大きい事例）。
 *   data/cases.ts の実測値どうしを結ぶだけで、新しい数字は作らない。
 *   「導入前」は見積なので、必ず（見積）を添える（types/case.ts の取り決め）。
 * ◆ 動きは transform / opacity / background の位置だけ。
 *   filter・backdrop-filter のアニメ・mix-blend-mode・3D transform・
 *   複雑な clip-path・vw フォント・100vh 単独指定は使わない（contract.ts §2）。
 * ◆ prefers-reduced-motion では終端値を即置き（useFullMotion が false ＝
 *   マウス視差も灯の呼吸も起動しない。contract.ts §5）。
 * ◆ JS が無い環境でも、SSR が最終値と札を出しているので図と数字は正しい。
 */

/** 机の横罫（FV の高さに対する位置％）。灯が通った順に引かれる */
const DESK_RULES = [30, 39, 48, 57, 66, 75, 84];

/** カウントダウンの開始の遅れ（ms）＝濃い帯が縮み始めるのと揃える */
const COUNT_DELAY_MS = 950;
/** カウントダウンにかける時間（ms） */
const COUNT_DURATION_MS = 1150;

/** 束に置く札の上限（6選＝isPickUp がこれを超えても束は増やさない） */
const DECK_MAX = 6;

/**
 * 扇の広がり（札自身の大きさに対する％／deg）。
 * 幅が変わっても崩れないよう％で持ち、狭い画面では CSS の --fan で詰める。
 */
const FAN = { x: 34, y: 21, arc: 6, rot: 8.5 } as const;

/** i 番目の札の居場所。件数が変わっても自動で扇になる（値をハードコードしない） */
function fanSlot(i: number, n: number): { x: number; y: number; r: number } {
  const t = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1; /* -1（左上）〜 +1（右下） */
  return {
    x: t * FAN.x,
    y: t * FAN.y - (1 - t * t) * FAN.arc /* 真ん中をわずかに持ち上げて弧にする */,
    r: t * FAN.rot,
  };
}

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

/** 視差の入力（-1〜1）に丸める */
const clamp1 = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

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

  /* 灯の呼吸とマウス視差は「マウスのある端末」かつ「画面の中」のときだけ走らせる */
  const full = useFullMotion();
  const [live, setLive] = useState(false);

  /* ---- 背景の帯＝12件ぶん。長さは (AI＋人)÷導入前、色は各事例の accent ---- */
  const bars = cases.map((c) => {
    const raw = c.before.minutes > 0 ? afterTotal(c) / c.before.minutes : 0;
    return {
      slug: c.slug,
      accent: c.accent,
      ratio: Math.min(1, Math.max(0, raw)),
    };
  });

  /* ---- 束＝6選の札（無ければ先頭から埋める） ---- */
  const picked = cases.filter((c) => c.isPickUp);
  const deck = (picked.length > 0 ? picked : cases).slice(0, DECK_MAX);

  /* ---- 数字＝代表1件 ---- */
  const rep = pickRepresentative(cases);
  const repAfter: CaseDuration | null = rep ? (rep.after.human ?? rep.after.ai) : null;
  const fromMinutes = rep ? rep.before.minutes : 0;
  const toMinutes = repAfter ? repAfter.minutes : 0;
  const finalText = repAfter ? formatDuration(repAfter) : "";

  /* ---------------- 数字のカウントダウン ---------------- */
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

    // ⚠ 開始値は「今すぐ」置く。待ってから置くと、行が現れてから数字が
    //    「導入後 → 導入前」へ跳ね上がって見える（この時点ではまだ opacity 0）
    el.textContent = formatDuration({ minutes: fromMinutes });

    let begun = 0;
    const step = (now: number) => {
      if (!begun) begun = now;
      const t = Math.min(1, (now - begun) / COUNT_DURATION_MS);
      el.textContent =
        t >= 1
          ? finalText
          : formatDuration({ minutes: fromMinutes + (toMinutes - fromMinutes) * easeOut(t) });
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
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

  /* ---------------- マウス視差＋灯の呼吸（PC・画面内だけ） ----------------
     ⚠ 常時走る演出は画面外で止める（contract.ts §4）。IntersectionObserver で
       FV が画面から出たら .live を外し、灯の呼吸も視差の受け付けも止める。 */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !full) return;

    let visible = false;
    let frame = 0;

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? false;
        setLive(visible);
        if (!visible) {
          root.style.removeProperty("--mx");
          root.style.removeProperty("--my");
        }
      },
      { rootMargin: "0px" }
    );
    io.observe(root);

    const onMove = (e: MouseEvent) => {
      if (!visible || frame) return;
      const cx = e.clientX;
      const cy = e.clientY;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = root.getBoundingClientRect();
        if (!r.width || !r.height) return;
        root.style.setProperty("--mx", clamp1(((cx - r.left) / r.width) * 2 - 1).toFixed(3));
        root.style.setProperty("--my", clamp1(((cy - r.top) / r.height) * 2 - 1).toFixed(3));
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    return () => {
      io.disconnect();
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(frame);
      root.style.removeProperty("--mx");
      root.style.removeProperty("--my");
    };
  }, [full]);

  return (
    <div
      ref={rootRef}
      className={[styles.stage, live ? styles.live : ""].filter(Boolean).join(" ")}
      data-phase={phase}
    >
      {/* ---- ① 背景＝12件の帯（薄墨＝導入前・全幅／濃い帯＝導入後・左寄せ） ---- */}
      <div
        className={styles.bg}
        aria-hidden="true"
        style={{ gridTemplateRows: `repeat(${bars.length}, minmax(0, 1fr))` }}
      >
        {bars.map((b, i) => (
          <div key={b.slug} className={styles.row}>
            <span
              className={styles.rowTrack}
              style={
                {
                  "--case-i": i,
                  "--case-ratio": b.ratio,
                  "--case-accent": b.accent,
                } as CSSProperties
              }
            >
              <span className={styles.rowFill} />
            </span>
          </div>
        ))}
      </div>

      {/* ---- ② 灯の名残り。転調のあとも弱く残って束の上を照らす ----
          外側＝現れかた（1度だけ）／内側＝呼吸（.live のときだけ・画面外で止まる）。
          2枚に分けてあるので、画面へ戻ったときに灯が消えて出直すことがない */}
      <span className={styles.glow} aria-hidden="true">
        <span className={styles.glowCore} />
      </span>

      {/* ---- ③ 現場（暖黒）＋灯＋机の横罫。紙色へ転調して引いていく ---- */}
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

      {/* ---- ④ 前景＝左に題字と1行の数字／右に6選の束（SPは上下） ---- */}
      <div className={styles.layout}>
        <div className={styles.textCol}>
          <div className={styles.textBlock}>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowNo}>{intro.eyebrow}</span>
              <span className={styles.eyebrowRule} aria-hidden="true" />
              <span className={styles.eyebrowName}>{intro.title}</span>
            </p>

            {/* 題字＝筆で引くように左から1文字ずつ。読み上げは aria-label で1語に戻す */}
            <h1 className={styles.title} aria-label={intro.pageTitle}>
              {[...intro.pageTitle].map((ch, i) => (
                <span
                  key={`${ch}-${i}`}
                  className={styles.titleChar}
                  style={{ "--ci": i } as CSSProperties}
                >
                  {ch}
                </span>
              ))}
            </h1>

            <p className={styles.titleEn}>{intro.pageTitleEn}</p>
            <p className={styles.tagline}>{intro.tagline}</p>

            {rep && repAfter ? (
              <>
                {/* 3秒で読める1行。手作業（見積）→ 人の手（実測）。数字は data 由来 */}
                <p className={styles.hero}>
                  <span className={styles.heroPart}>
                    <span className={styles.heroLabel}>手作業</span>
                    <span className={styles.heroBefore}>{formatDuration(rep.before)}</span>
                    <span className={styles.heroEst}>（見積）</span>
                  </span>
                  <span className={styles.heroArrow} aria-hidden="true">
                    →
                  </span>
                  <span className={styles.heroPart}>
                    <span className={styles.heroLabel}>
                      {rep.after.human ? "人の手" : "AI"}
                    </span>
                    <span ref={numRef} className={styles.heroAfter}>
                      {finalText}
                    </span>
                  </span>
                </p>

                <p className={styles.note}>
                  <span className={styles.noteName}>{rep.title}</span>
                  <span className={styles.noteSep} aria-hidden="true">
                    ｜
                  </span>
                  {rep.after.human
                    ? `実測（人の手 ${formatDuration(rep.after.human)}＋AIの稼働 ${formatDuration(rep.after.ai)}）`
                    : "実測（AIが動いた時間）"}
                </p>
              </>
            ) : null}

            <p className={styles.count}>{cases.length} CASES</p>
          </div>
        </div>

        {/* ---- 束＝6選の札。収縮で奥へ沈み、settled のあとも残る ---- */}
        {deck.length > 0 ? (
          <div className={styles.deckCol}>
            <div className={styles.deckDepth} data-fv-depth="0.55">
              <div className={styles.deckParallax}>
                {deck.map((c, i) => {
                  const slot = fanSlot(i, deck.length);
                  // 重なり順は DOM の順そのまま（後の札ほど手前）。ここで z-index を
                  // 書くと、ホバーで持ち上げた札を上へ出せない（インラインが CSS に勝つ）
                  return (
                    <a
                      key={c.slug}
                      href={`#${c.slug}`}
                      className={styles.deckCard}
                      aria-label={`${c.no} ${c.title}`}
                      style={
                        {
                          "--x": `${slot.x}%`,
                          "--y": `${slot.y}%`,
                          "--r": `${slot.r}deg`,
                          "--di": i,
                        } as CSSProperties
                      }
                    >
                      <span className={styles.deckSheet}>
                        <Image
                          src={c.thumbnail}
                          alt=""
                          fill
                          sizes="(max-width: 767px) 190px, (max-width: 1023px) 240px, 340px"
                          className={styles.deckShot}
                        />
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
