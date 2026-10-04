"use client";

import { useEffect, useRef } from "react";
import type { FvBg } from "@/data/fvBackgrounds";
import { useMediaQuery, useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./FvBgVideo.module.css";

/**
 * FvBgVideo — FV の背景に敷くループ動画（2026-10-04・トップと About で共用）。
 *
 * 背景を毎フレーム描くキャンバス（流体・灯）から、事前に Blender で描いた動画へ替えた。
 * 動画はハードウェアで再生され、毎秒のコマ数が固定＝モニターの速さに関係なく軽い
 * （実測＝全画面の背景動画で CPU 1 コアの 9〜13%。旧トップ FV は 62%）。
 *
 * - 素材と切り替え条件は data/fvBackgrounds.ts。wide / narrow は箱の縦横比の式で選ぶ。
 *   選ぶのは effect の中で matchMedia を直接読む（hydration 直後の仮の値で別の版を取りに行かない）。
 * - 再生の順＝導入（intro・1 回だけ）→ ループ。start が true になった時に始める
 *   （トップ＝オープニングの墨の一滴の着地、About＝最初から true）。skipIntro でループから始める。
 *   導入の最後のコマとループの最初のコマは連続している＝切り替えは瞬時（フェードしない）。
 * - 止める条件（LoopVideo と同じ考え方）＝「動きを減らす」設定・省データ・自動再生の拒否 → ポスター 1 枚だけ。
 *   画面外・背面タブでは止める（IntersectionObserver＋visibilitychange）。
 * - 表示の切り替えは React の state を使わず、箱の data 属性へ直接書く（CSS が見え方を決める）。
 * - 四辺は動画の中で地色へ溶かしてあるが、iOS（WebKit）で動画の黒の範囲が変わって継ぎ目が出た時の
 *   保険として、静的なマスクで四辺を透明へ落とす（edgeMask・既定 true）。動かすのは opacity だけ。
 * - 動画にはマウスの光を焼き込んでいない＝必要なら PointerGlow を上に重ねる。
 */

type Props = {
  bg: FvBg;
  /** true になったら再生を始める */
  start: boolean;
  /** 導入を飛ばしてループから始める（2 回目以降・オープニング省略時） */
  skipIntro?: boolean;
  /** start 前からポスターを見せる（About＝true。トップ＝false：着地までは地色のまま） */
  posterBeforeStart?: boolean;
  /** 四辺を透明へ溶かす静的なマスク（既定 true） */
  edgeMask?: boolean;
  className?: string;
};

type Phase = "idle" | "intro" | "loop" | "still";

export default function FvBgVideo({
  bg,
  start,
  skipIntro = false,
  posterBeforeStart = false,
  edgeMask = true,
  className,
}: Props) {
  // 値は effect の再実行のきっかけにだけ使う（中では matchMedia を直接読む）
  const motion = useMotionAllowed();
  const wide = useMediaQuery(bg.wideQuery);
  const hostRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLVideoElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const intro = introRef.current;
    const loop = loopRef.current;
    if (!host || !intro || !loop) return;

    const mm = (q: string) => typeof window.matchMedia === "function" && window.matchMedia(q).matches;
    const v = mm(bg.wideQuery) ? bg.wide : bg.narrow;
    host.dataset.variant = v === bg.wide ? "wide" : "narrow";
    host.style.setProperty("--fvbg-pos", `${(v.posX ?? 0.5) * 100}% ${(v.posY ?? 0.5) * 100}%`);

    const setPhase = (p: Phase) => {
      host.dataset.phase = p;
    };

    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (mm("(prefers-reduced-motion: reduce)") || conn?.saveData) {
      setPhase(start || posterBeforeStart ? "still" : "idle");
      return;
    }

    for (const el of [intro, loop]) {
      el.muted = true;
      el.defaultMuted = true;
    }
    if (loop.dataset.src !== v.loop) {
      loop.src = v.loop;
      loop.dataset.src = v.loop;
      delete host.dataset.loopOn;
    }
    loop.preload = "auto";
    const useIntro = !!v.intro && !skipIntro && host.dataset.loopOn !== "1";
    if (useIntro && v.intro && intro.dataset.src !== v.intro) {
      intro.src = v.intro;
      intro.dataset.src = v.intro;
      intro.preload = "auto";
    }

    let phase: Phase = !start ? "idle" : useIntro ? "intro" : "loop";
    let inView = true;
    let visible = document.visibilityState !== "hidden";
    setPhase(phase);

    const still = () => {
      phase = "still";
      setPhase("still");
      intro.pause();
      loop.pause();
    };
    const current = () => (phase === "intro" ? intro : phase === "loop" ? loop : null);
    const sync = () => {
      const el = current();
      if (!el) return;
      if (inView && visible) {
        const p = el.play();
        // 自動再生の拒否（iOS の低電力モード等）＝ポスターだけにする。pause による中断（AbortError）は無視
        p?.catch((err: unknown) => {
          if ((err as { name?: string })?.name === "NotAllowedError") still();
        });
      } else {
        el.pause();
      }
    };

    const onIntroPlaying = () => {
      host.dataset.introOn = "1";
    };
    const onIntroEnded = () => {
      if (phase !== "intro") return;
      phase = "loop";
      host.dataset.fromIntro = "1";
      setPhase("loop");
      sync();
    };
    const onLoopPlaying = () => {
      host.dataset.loopOn = "1";
      // ループが 1 コマ出てから導入を外す（間に地色が挟まらないように）
      requestAnimationFrame(() => {
        delete host.dataset.introOn;
        if (intro.getAttribute("src")) {
          intro.removeAttribute("src");
          delete intro.dataset.src;
          intro.load();
        }
      });
    };
    const onError = () => {
      if (phase === "intro" || phase === "loop") still();
    };

    intro.addEventListener("playing", onIntroPlaying);
    intro.addEventListener("ended", onIntroEnded);
    intro.addEventListener("error", onError);
    loop.addEventListener("playing", onLoopPlaying);
    loop.addEventListener("error", onError);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries[entries.length - 1];
          if (!e) return;
          inView = e.isIntersecting;
          sync();
        },
        { threshold: 0 }
      );
      io.observe(host);
    }
    const onVis = () => {
      visible = document.visibilityState !== "hidden";
      sync();
    };
    document.addEventListener("visibilitychange", onVis);
    sync();

    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      intro.removeEventListener("playing", onIntroPlaying);
      intro.removeEventListener("ended", onIntroEnded);
      intro.removeEventListener("error", onError);
      loop.removeEventListener("playing", onLoopPlaying);
      loop.removeEventListener("error", onError);
      intro.pause();
      loop.pause();
    };
  }, [bg, start, skipIntro, posterBeforeStart, motion, wide]);

  return (
    <div
      ref={hostRef}
      className={`${styles.host} ${edgeMask ? "" : styles.noMask} ${className ?? ""}`}
      data-phase="idle"
      data-poster-early={posterBeforeStart ? "1" : undefined}
      aria-hidden="true"
    >
      <div className={styles.maskX}>
        <div className={styles.maskY}>
          <picture>
            <source media={bg.wideQuery} srcSet={bg.wide.poster} />
            {/* 背景の 1 コマ目。<picture> で縦横の版を選ぶため next/image を使わない */}
            <img className={`${styles.media} ${styles.poster}`} src={bg.narrow.poster} alt="" decoding="async" />
          </picture>
          <video
            ref={loopRef}
            className={`${styles.media} ${styles.loop}`}
            muted
            loop
            playsInline
            preload="none"
            disablePictureInPicture
            tabIndex={-1}
          />
          <video
            ref={introRef}
            className={`${styles.media} ${styles.intro}`}
            muted
            playsInline
            preload="none"
            disablePictureInPicture
            tabIndex={-1}
          />
        </div>
      </div>
    </div>
  );
}
