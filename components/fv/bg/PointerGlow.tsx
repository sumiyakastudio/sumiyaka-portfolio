"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./PointerGlow.module.css";

/**
 * PointerGlow — マウスの位置にだけ灯る、ごく弱い白い光（2026-10-04）。
 *
 * 旧 FV では灯（キャンバス）がポインタに反応していた。背景を動画へ替えたので、光は焼き込まず
 * ここで CSS の放射状グラデーション 1 枚を重ねる（発注書 §2-2）。
 *
 * - 親要素（FV の箱）の pointermove を拾い、requestAnimationFrame で 1 回だけ transform を書く
 *   ＝マウスが止まっている間は何も動かない（常時のループを持たない）。
 * - マウスの細かい操作ができる端末だけ（hover: hover かつ pointer: fine）。タッチ・「動きを減らす」設定では出さない。
 * - 置き場所＝動画の上・文字の下（重なり順はページ側で決める）。filter・blend は使わない。
 */

type Props = {
  className?: string;
  /** 光の直径（px） */
  size?: number;
  /** 中心の明るさ（白の不透明度） */
  strength?: number;
};

export default function PointerGlow({ className, size = 620, strength = 0.07 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    const spot = el?.firstElementChild as HTMLElement | null;
    if (!el || !host || !spot) return;
    const mm = (q: string) => typeof window.matchMedia === "function" && window.matchMedia(q).matches;
    if (!mm("(hover: hover) and (pointer: fine)") || mm("(prefers-reduced-motion: reduce)")) return;

    let x = 0;
    let y = 0;
    let raf = 0;
    const paint = () => {
      raf = 0;
      spot.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0)`;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = host.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      el.dataset.on = "1";
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      delete el.dataset.on;
    };
    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [size]);

  const vars = {
    "--glow-size": `${size}px`,
    "--glow-a": String(strength),
    "--glow-b": String(strength * 0.35),
  } as CSSProperties;

  return (
    <div ref={ref} className={`${styles.glow} ${className ?? ""}`} style={vars} aria-hidden="true">
      <span className={styles.spot} />
    </div>
  );
}
