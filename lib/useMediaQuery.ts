"use client";

import { useCallback, useSyncExternalStore } from "react";

const getServerSnapshot = () => false;

/**
 * メディアクエリの一致を React の状態として読む（hydration 安全・lint-clean）。
 *
 * サーバーと最初の hydration では常に false を返し、その直後にブラウザの実値へ
 * 切り替わる。以後は change イベントで追従するので、リサイズで境界をまたいでも
 * 正しく更新される。useEffect 内で同期 setState する書き方（react-hooks/
 * set-state-in-effect に引っかかる）の置き換えとして使う。
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {};
      }
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

const subscribeReduce = (onChange: () => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia(REDUCE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

const getMotionAllowed = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  !window.matchMedia(REDUCE_QUERY).matches;

/**
 * 入場アニメを仕込んでよいか（＝ブラウザ上で、かつ「動きを減らす」設定でない）。
 *
 * サーバーと最初の hydration では false＝SSR が描いた完成形のまま（JS 無しでも読める）。
 * 直後にブラウザの実値へ切り替わる。図解など「初期状態を被せてから再生する」部品が、
 * useEffect 内の同期 setState（react-hooks/set-state-in-effect）を使わずに済むための口。
 * useFullMotion() と違い、タッチ端末・狭幅でも true を返す（SP でも図は動かす）。
 */
export function useMotionAllowed(): boolean {
  return useSyncExternalStore(subscribeReduce, getMotionAllowed, getServerSnapshot);
}
