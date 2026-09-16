"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { formatDuration, formatReduction } from "@/lib/caseCatalog";

/**
 * 画面に入った時に一度だけ立ち上がる数字（/cases のカード）。
 *
 * ⚠ 出す値は data/cases.ts のものだけ。途中の値は「立ち上がりの途中経過」であって
 *   主張ではないので、終わりは必ず正本の整形関数（formatReduction / formatDuration）と
 *   一字一句同じ文字列に着地させる。
 * ⚠ SSR は最初から最終値を描く（JS が無い環境・検索エンジンには正しい数字が出る）。
 *   立ち上がりは effect の中で textContent を書き換えるだけで、再レンダーは起こさない。
 * ⚠ prefers-reduced-motion では即値（IntersectionObserver も張らない）。
 */

const DURATION_MS = 900;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

type Props = {
  /** 最終値。kind="percent" は %、kind="minutes" は分 */
  value: number;
  kind: "percent" | "minutes";
  /** formatDuration の display 上書き（例「5分18秒」）。最後にこの文字列へ着地する */
  display?: string;
  className?: string;
};

function render(kind: Props["kind"], v: number, display?: string): string {
  if (kind === "percent") return formatReduction(v);
  return formatDuration({ minutes: v, display });
}

/**
 * 文字列のおおよその幅（em）。立ち上がりの途中で桁が増えても行が動かないよう、
 * 最初から最終値ぶんの幅を空けておくために使う。
 * 0 から増える向きにしか使わないので、最終値が必ず最も広い＝ここで足りる。
 */
function widthEm(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (ch === ".") w += 0.28;
    else if (ch === "%") w += 0.85;
    else if (code < 128) w += 0.56;
    else w += 1;
  }
  return Math.round(w * 100) / 100;
}

export default function CountUp({ value, kind, display, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);
  const finalText = render(kind, value, display);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let begun = 0;
    const step = (now: number) => {
      if (!begun) begun = now;
      const t = Math.min(1, (now - begun) / DURATION_MS);
      el.textContent = t >= 1 ? finalText : render(kind, value * easeOut(t));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        el.textContent = render(kind, 0);
        rafRef.current = requestAnimationFrame(step);
      },
      { threshold: 0.4 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [value, kind, finalText]);

  const style: CSSProperties = {
    display: "inline-block",
    minWidth: `${widthEm(finalText)}em`,
    textAlign: "left",
  };

  return (
    <span ref={ref} className={className} style={style}>
      {finalText}
    </span>
  );
}
