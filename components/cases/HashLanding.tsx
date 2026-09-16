"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useLenis } from "@/components/animation/SmoothScroll";

/**
 * /cases#slug への着地（何も描かない）。
 *
 * なぜ要るか：読み込み直後のページ高は FV ぶんしか無く（本文は入場演出の前）、
 * ブラウザ標準のハッシュ移動はその時点で空振りする（2026-09-16 実測＝scrollY 0 のまま）。
 * そこで「対象の要素がある／FV の収縮が終わっている（[data-fv] の data-fv-phase が
 * settled）／ページ高が2フレーム続けて変わらない」まで待ってから移動する。
 * 上限は 3 秒で、それを過ぎたらその時点の位置へ移動する（永久に待たない）。
 *
 * 発火は3経路＝マウント（別ページからの遷移を含む）／hashchange／popstate。
 * prefers-reduced-motion では即時移動（なめらかスクロールを使わない）。
 */

/** CaseCard の scroll-margin-top と同じ値（固定ヘッダー 60px ＋ 余白） */
const HEADER_OFFSET = 92;
/** 待つ上限 */
const MAX_WAIT_MS = 3000;

/** レイアウト上の文書内の上端（CSS transform を含まない）。offsetParent を根まで足す */
function layoutTop(el: HTMLElement): number {
  let y = 0;
  let node: HTMLElement | null = el;
  while (node) {
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return y;
}

export default function HashLanding({ slugs }: { slugs: string[] }) {
  const pathname = usePathname();
  const lenis = useLenis();
  const lenisRef = useRef<ReturnType<typeof useLenis>>(null);
  const runIdRef = useRef(0);
  const landedRef = useRef<string | null>(null);
  const lastTargetRef = useRef(0);

  // Lenis の実体は祖先（SmoothScroll）の effect で作られるため、最初のマウント時点では
  // まだ null のことがある。移動の瞬間に ref から最新を読む（掴めなければネイティブへ退避）。
  // ⚠ effect 内で setState して再レンダーを起こす手は使わない（react-hooks/set-state-in-effect）。
  useEffect(() => {
    lenisRef.current = lenis;
  }, [lenis]);

  useEffect(() => {
    const allowed = new Set(slugs);
    let raf = 0;

    const move = (el: HTMLElement, reduced: boolean) => {
      // 位置は自分で計算して「絶対位置（数値）」で渡す。
      // ⚠ Lenis に要素＋offset で渡すと 40px 行き過ぎてヘッダーに 8px 掛かった（2026-09-16 実測＝top 52px）。
      //    数値指定なら Lenis の要素計算を通らず、ネイティブの scrollIntoView（top 92px）と同じ位置に着く。
      // ⚠ getBoundingClientRect は transform を含む。入場演出（ScrollReveal）前のカードは
      //    translateY(+40px) の位置にあるため、それを基準にすると 40px 行き過ぎる（2026-09-16 実測）。
      //    offsetTop の連鎖＝レイアウト位置（transform を含まない）で計算する。
      const y = Math.max(0, Math.round(layoutTop(el) - HEADER_OFFSET));
      const l = lenisRef.current;
      if (l) {
        l.scrollTo(y, { immediate: reduced, force: true });
      } else {
        window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
      }
      lastTargetRef.current = y;
    };

    // 着地後の補正。直リンクでは着地の後に上の要素の高さが少し変わり（実測 40px）、
    // カードがヘッダーに掛かる。着地から少し置いて位置を測り直し、ずれていて、かつ
    // 読者がまだ自分でスクロールしていなければ、1〜2回だけ即時に直す。
    const verify = (el: HTMLElement, tries: number, runId: number) => {
      if (tries >= 2) return;
      window.setTimeout(() => {
        if (runId !== runIdRef.current) return;
        const delta = layoutTop(el) - window.scrollY - HEADER_OFFSET;
        const userMoved = Math.abs(window.scrollY - lastTargetRef.current) > 60;
        if (Math.abs(delta) > 4 && !userMoved) {
          move(el, true);
          verify(el, tries + 1, runId);
        }
      }, tries === 0 ? 700 : 1200);
    };

    const land = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!hash || !allowed.has(hash)) return;
      // 同じ位置へ二度は動かさない（読んでいる途中で引き戻さないため）
      if (landedRef.current === hash) return;
      landedRef.current = hash;

      const runId = ++runIdRef.current;
      const started = typeof performance !== "undefined" ? performance.now() : Date.now();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let lastHeight = -1;
      let stable = 0;

      const step = () => {
        if (runId !== runIdRef.current) return;

        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const elapsed = now - started;
        const el = document.getElementById(hash);
        const height = document.documentElement.scrollHeight;

        stable = height === lastHeight ? stable + 1 : 0;
        lastHeight = height;

        const fv = document.querySelector("[data-fv]");
        const fvSettled = !fv || fv.getAttribute("data-fv-phase") === "settled";

        if (el && fvSettled && stable >= 2) {
          move(el, reduced);
          verify(el, 0, runId);
          return;
        }
        if (elapsed >= MAX_WAIT_MS) {
          if (el) {
            move(el, reduced);
            verify(el, 0, runId);
          }
          return;
        }
        raf = requestAnimationFrame(step);
      };

      // ⚠ Webフォント（Noto Sans JP）の読み込みで上の段落の高さが変わり、着地が 40px ずれる
      //    （直リンクだけ起きる＝クライアント遷移ではフォントが既に載っている）。
      //    fonts.ready を待ってから測る。fonts API が無い環境はそのまま進む。
      const start = () => {
        if (runId !== runIdRef.current) return;
        raf = requestAnimationFrame(step);
      };
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts && fonts.status !== "loaded") {
        fonts.ready.then(start, start);
      } else {
        start();
      }
    };

    land();
    window.addEventListener("hashchange", land);
    window.addEventListener("popstate", land);

    return () => {
      runIdRef.current += 1; // 走っている待機を打ち切る
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", land);
      window.removeEventListener("popstate", land);
    };
  }, [pathname, slugs]);

  return null;
}
