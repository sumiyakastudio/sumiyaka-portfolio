"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LoopClip } from "@/data/photoLoops";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./LoopVideo.module.css";

/**
 * LoopVideo — 写真の上に、同じ構図のループ動画を重ねる（2026-10-01）。
 *
 * 子（children）＝今までどおりの静止画（next/image）。サーバーが描くのはこの静止画だけ。
 * ブラウザで「動きを減らす」設定でなく、省データ設定でもない時に限り、同じ枠へ <video> を足し、
 * 画面に入ったら読み込んで再生する。再生が始まったら（playing）静止画の上へふっと出す。
 *
 * - 枠の重ね方＝grid の同じ升目に静止画と動画を置く（position を使わない）。
 *   額の罫（::before）や縁の沈み込み（::after）との重なり順が、静止画の時と変わらない。
 *   動画は contain: size で升目の寸法に影響しない＝枠の大きさは静止画のまま。
 *   ⚠ <video> に width/height 属性を付けない（縦横比の指定になり、升目が数 px 伸びる＝2026-10-01 実測）。
 *   静止画が position＋z-index を持つ額（/about PROFILE）は、ページ側が
 *   --loop-pos / --loop-z を渡して、動画を同じ層へ上げる。
 * - 画面外・背面タブでは止める（IntersectionObserver＋visibilitychange）。
 *   読み込みは preload="none"＝画面に入るまで1バイトも取らない。
 * - 自動再生が拒まれた時（iOS の低電力モード等）は何も出さない＝静止画のまま。
 * - 動かすのは opacity と transform だけ（filter・blend・3D は使わない）。操作パネルは出さない。
 * - 再生の進み（2026-10-03 動画 v2）＝額の下辺の内側に高さ 1px の線。currentTime / duration を
 *   scaleX で表す。requestAnimationFrame で線の style.transform へ直接書く（毎フレーム setState しない）。
 *   再生中（playing 以降）だけ出す＝静止画のまま（reduced-motion・省データ・再生拒否）の時は出ない。
 *   線も同じ升目の grid item（position を使わない）。z-index だけ持たせ、額の縁（::after）の上に乗せる
 *   ＝罫・縁・静止画・動画の重なり順は変えない。色はページ側が --loop-line で渡す（既定は白の半透明）。
 *   progress={false} で線を出さない（場面の目盛りなど、別の表示を持つ置き場所向け）。
 */
type Props = {
  clip: LoopClip;
  children: ReactNode;
  className?: string;
  /** 再生の進みを示す 1px の線を出すか（既定 true） */
  progress?: boolean;
};

export default function LoopVideo({ clip, children, className, progress = true }: Props) {
  const motion = useMotionAllowed();
  const ref = useRef<HTMLVideoElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!motion || !v) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;

    v.muted = true;
    v.defaultMuted = true;
    let inView = false;

    // 再生の進み：再生中だけ毎フレーム線へ書く（止まったら rAF も止める）
    let raf = 0;
    const tick = () => {
      const line = lineRef.current;
      const d = v.duration;
      if (line && d > 0 && Number.isFinite(d)) {
        line.style.transform = `scaleX(${Math.min(1, Math.max(0, v.currentTime / d))})`;
      }
      raf = requestAnimationFrame(tick);
    };
    const startTick = () => {
      if (progress && !raf) raf = requestAnimationFrame(tick);
    };
    const stopTick = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    v.addEventListener("playing", startTick);
    v.addEventListener("pause", stopTick);

    const play = () => {
      if (!inView || document.visibilityState !== "visible") return;
      if (v.preload !== "auto") v.preload = "auto";
      const p = v.play();
      if (p) p.catch(() => {});
    };
    const pause = () => {
      if (!v.paused) v.pause();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) play();
        else pause();
      },
      { threshold: 0.15 }
    );
    io.observe(v);

    const onVis = () => {
      if (document.visibilityState === "visible") play();
      else pause();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      v.removeEventListener("playing", startTick);
      v.removeEventListener("pause", stopTick);
      stopTick();
      pause();
    };
  }, [motion, progress]);

  return (
    <span className={[styles.stack, className].filter(Boolean).join(" ")}>
      {children}
      {motion && (
        <video
          ref={ref}
          className={`${styles.video} ${shown ? styles.shown : ""}`}
          poster={clip.poster}
          preload="none"
          muted
          loop
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setShown(true)}
        >
          <source src={clip.src} type="video/mp4" />
        </video>
      )}
      {motion && progress && (
        <span
          ref={lineRef}
          className={`${styles.line} ${shown ? styles.lineShown : ""}`}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
