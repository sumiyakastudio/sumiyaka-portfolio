"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { useFVPhase } from "@/components/fv/useFVPhase";
import { useFullMotion, useLightVisuals } from "@/lib/useLightVisuals";
import { createHoverScroll } from "@/lib/hoverScroll";
import { FV_SHEET_LIGHT } from "./fvSheets";
import styles from "./WorksFVStack.module.css";

/**
 * /works の FV「掲載サイトの束」— 清（せい）・紙。
 * 2026-09-07 改修：無地の白い紙 11枚 → 実際の掲載サイトのフルスクショの束。
 *
 * ◆ 平常時
 *   フルスクショの札が、それぞれ違う角度・位置で重なって落ち着いている。
 *   手前の一枚だけは白い紙（題箋）で、そこに「WEB制作」が活版で押し込まれる。
 *   入場は従来どおり画面の端から差し込まれる（リズムを変えない）。
 *
 * ◆ ホバー（マウス端末・広い画面だけ）
 *   題箋が少し持ち上がり、束が下へ帯状にバッと広がる。同時に、広がった札の
 *   すべてが縦に流れる（lib/hoverScroll.ts の createHoverScroll ＝ objectPosition
 *   駆動。速度は CRUISE_SPEED＝枠の高さ 0.86個/秒で全ページ共通）。
 *   外すと束へ戻り、画も先頭へ戻る（RETURN_DURATION）。
 *
 * ◆ 題字の可読性
 *   題字は最初から最後まで「不透明な白い紙の上」にしか乗らない。広がった札は
 *   題箋より必ず奥（.pile → .front の順）なので、画像が題字の背面に来ることが
 *   構造的に起こらない。＝コントラストは常に紙（#fff）と墨のまま。
 *
 * ◆ 互換
 *   動かすのは transform(2D)・opacity・box-shadow・object-position のみ。
 *   filter/backdrop-filter のアニメ・blend・3D・clip-path は使わない。
 *   タッチ端末・狭幅・reduced-motion（prefersLightVisuals）では
 *     ・札を FV_SHEET_LIGHT 枚に減らす（＝読み込む画像も減る）
 *     ・広がりも縦流しも起動しない（静止1コマで「サイトが重なっている」と読める）
 *
 * ◆ 舞台（SubPageFVAnim）との同期
 *   ・入場はこの部品が持つ（customEntrance）。
 *   ・収縮（1.0s→1.5s）では .pile に data-fv-depth があるので舞台側が奥へ沈める。
 *     題箋には付けない＝手前に残る。
 *   ・settled になったら隅の索引ラベルを出す（useFVPhase）。
 */

/**
 * 札の居場所。単位は「札自身の大きさに対する％」＝ 幅が変わっても崩れない。
 *   x / y / r … 平常時（束）
 *   hx / hy / hr … ホバーで広がったとき（題箋の下に横一列。外側ほど少し下がる）
 * 並び順がそのまま重なり順（後ろの要素ほど手前）。中央寄りの札を後ろに置く。
 */
const SLOTS: ReadonlyArray<{
  x: number;
  y: number;
  r: number;
  hx: number;
  hy: number;
  hr: number;
}> = [
  { x: -128, y: 8, r: -4.8, hx: -213.5, hy: 85, hr: -3.4 },
  { x: 124, y: 12, r: 4.0, hx: 213.5, hy: 85, hr: 3.4 },
  { x: -96, y: -43, r: -6.4, hx: -152.5, hy: 80, hr: -2.2 },
  { x: 92, y: -35, r: 5.8, hx: 152.5, hy: 80, hr: 2.2 },
  { x: -62, y: 48, r: -3.2, hx: -91.5, hy: 78, hr: -1.2 },
  { x: 66, y: 45, r: 4.4, hx: 91.5, hy: 78, hr: 1.2 },
  { x: -18, y: -58, r: -1.8, hx: -30.5, hy: 76, hr: -0.5 },
  { x: 24, y: 55, r: 2.6, hx: 30.5, hy: 76, hr: 0.5 },
];

/**
 * 軽量経路で使う札（SLOTS の添字）。上2枚・下2枚になるものを選ぶ。
 * CSS の .still が縦横の振り幅を広げて題箋の外へ逃がすので、静止1コマでも
 * 「掲載サイトが重なっている」と読める（＝ポスター判定）。
 */
const LIGHT_SLOTS: readonly number[] = [2, 5, 3, 4];

/** 差し込まれてくる方向（左・右・上・下を巡回）。従来の入場のリズムを保つ */
const ENTER_DIRS: ReadonlyArray<{ x: number; y: number }> = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
];

/**
 * 札の実寸に対する sizes。札は最大 310px 幅なので、フルスクショの原寸
 * （1320px 幅前後）は要らない。ここを広く書くと FV だけで数MB になる。
 */
const SHEET_SIZES = "(max-width: 767px) 180px, (max-width: 1279px) 290px, 310px";

/** 入場が終わって、ホバーを受け付けてよくなるまでの時間（ms） */
const ENTER_MS = 950;

interface Props {
  /** 作品数（data 由来）。隅の索引に使う。ここで数字を作らない */
  count: number;
  /** 束に敷くフルスクショのパス（pickFVSheets の戻り値。サーバー側で選ぶ） */
  sheets: string[];
  /** 手前の一枚に載せる内容（題字・サブコピー。文言は呼び出し側が持つ） */
  children: ReactNode;
}

export default function WorksFVStack({ count, sheets, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const readyRef = useRef(false);
  const phase = useFVPhase(rootRef);

  /* フル演出（マウス・広い画面）か、軽量経路か。
     どちらもサーバー／hydration 直後は false ＝ 画像を1枚も出さない。
     ここで初期HTMLからフルスクショを外しているので、FV の初期表示には
     画像のバイトが1枚も乗らない（読み込みは hydration 後に始まる）。 */
  const full = useFullMotion();
  const light = useLightVisuals();
  const mode: "idle" | "light" | "full" = full ? "full" : light ? "light" : "idle";

  const numberWidth = String(count).length;

  const picks = useMemo(() => {
    if (mode === "idle" || sheets.length === 0) return [];
    const order =
      mode === "full"
        ? SLOTS.map((_, i) => i)
        : LIGHT_SLOTS.slice(0, Math.min(FV_SHEET_LIGHT, SLOTS.length));
    return order.map((slot, i) => ({
      slot,
      ...SLOTS[slot],
      src: sheets[i % sheets.length],
    }));
  }, [mode, sheets]);

  /* 札ごとの縦流し。gsap の共通ticker で1本の rAF にまとまる */
  const scrollers = useMemo(
    () => Array.from({ length: picks.length }, () => createHoverScroll(1)),
    [picks.length]
  );
  useEffect(() => () => scrollers.forEach((s) => s.kill()), [scrollers]);

  /* ---------------- 広がる／畳む ---------------- */
  const spreadOff = useCallback(() => {
    const root = rootRef.current;
    if (root) root.classList.remove(styles.spread);
    scrollers.forEach((s) => s.stop());
  }, [scrollers]);

  const spreadOn = useCallback(() => {
    if (mode !== "full" || !readyRef.current) return;
    const root = rootRef.current;
    if (!root || root.classList.contains(styles.spread)) return;
    root.classList.add(styles.spread);
    cardRefs.current.forEach((el, i) => {
      const img = el?.querySelector("img");
      if (img) scrollers[i]?.start(img);
    });
  }, [mode, scrollers]);

  /* 画面外・背面タブでは必ず畳む（ホバーしたまま離脱しても流し続けない） */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!(entries[0]?.isIntersecting ?? false)) spreadOff();
      },
      { rootMargin: "0px" }
    );
    io.observe(root);
    const onHidden = () => {
      if (document.hidden) spreadOff();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [spreadOff]);

  /* ---------------- 入場 ---------------- */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || mode === "idle") return;
    const host = root.closest<HTMLElement>("[data-fv]") ?? root;

    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-wk-card]"));
    const front = root.querySelector<HTMLElement>("[data-wk-front]");
    const title = root.querySelector<HTMLElement>("[data-wk-title]");
    const sub = root.querySelector<HTMLElement>("[data-wk-sub]");
    const rule = root.querySelector<HTMLElement>("[data-wk-rule]");
    if (!front) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      gsap.set([...cards, front], { opacity: 1 });
      if (title) {
        title.style.opacity = "1";
        title.setAttribute("data-wk-pressed", "");
      }
      if (sub) sub.style.opacity = "1";
      if (rule) rule.style.transform = "scaleX(1)";
      return;
    }

    const isLight = mode === "light";
    readyRef.current = false;

    const ctx = gsap.context(() => {
      const W = host.clientWidth || window.innerWidth;
      const H = host.clientHeight || window.innerHeight;
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

      // 札：端から差し込まれる（light 端末は手元で重なるだけ）。
      // ★ 落ち着き先は CSS（％指定の transform）が持っている。ここでは実測して
      //    同じ値へ着地させ、着地後 clearProps で CSS へ返す。返さないと
      //    インラインの transform がホバーの広がりを恒久的に上書きしてしまう。
      cards.forEach((el, i) => {
        const endX = gsap.getProperty(el, "x") as number;
        const endY = gsap.getProperty(el, "y") as number;
        const endR = gsap.getProperty(el, "rotation") as number;
        const dir = ENTER_DIRS[i % ENTER_DIRS.length];
        const fromX = isLight ? endX : endX + dir.x * W * 0.72;
        const fromY = isLight ? endY + 28 : endY + dir.y * H * 0.72;
        const fromR = isLight
          ? endR
          : endR + (dir.x !== 0 ? -dir.x * 10 : dir.y * 8);
        tl.fromTo(
          el,
          { x: fromX, y: fromY, rotation: fromR, opacity: 0 },
          {
            x: endX,
            y: endY,
            rotation: endR,
            opacity: 1,
            duration: isLight ? 0.4 : 0.48,
            clearProps: "transform",
          },
          0.04 + i * (isLight ? 0.03 : 0.035)
        );
      });

      // 題箋（手前の一枚）：最後に上から置かれる
      tl.fromTo(
        front,
        {
          x: isLight ? 0 : W * 0.55,
          y: isLight ? 34 : -H * 0.22,
          rotation: isLight ? 0 : -6,
          opacity: 0,
        },
        {
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          duration: 0.5,
          clearProps: "transform",
        },
        0.3
      );

      // 題字：押し込まれる（縮む＋不透明に。押し跡は CSS の text-shadow transition）
      if (title) {
        tl.fromTo(
          title,
          { opacity: 0, scale: 1.08 },
          { opacity: 1, scale: 1, duration: 0.32, ease: "power3.out" },
          0.56
        );
        tl.call(() => title.setAttribute("data-wk-pressed", ""), undefined, 0.62);
      }

      if (sub) {
        tl.fromTo(sub, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35 }, 0.72);
      }

      if (rule) {
        tl.fromTo(
          rule,
          { scaleX: 0 },
          { scaleX: 1, duration: 0.4, ease: "power3.out" },
          0.76
        );
      }
    }, root);

    // 入場が終わってから、広がり／畳みの transition を有効にする。
    // ⚠ 入場中に transition を持たせると、GSAP が毎フレーム書く transform を
    //    追いかけて動きが濁る（＝ .live は必ず入場の後で付ける）
    const arm = window.setTimeout(() => {
      readyRef.current = true;
      root.classList.add(styles.live);
    }, ENTER_MS);

    return () => {
      window.clearTimeout(arm);
      readyRef.current = false;
      root.classList.remove(styles.live);
      root.classList.remove(styles.spread);
      ctx.revert();
    };
    // mode が決まった時点で札の枚数も確定する（idle=0 / light=4 / full=8）。
    // sheets はページ内で変化しないので、依存は mode 一本でよい。
  }, [mode]);

  return (
    <div
      ref={rootRef}
      className={`${styles.stage} ${phase === "settled" ? styles.settled : ""} ${
        mode === "light" ? styles.still : ""
      }`}
      onMouseEnter={spreadOn}
      onMouseLeave={spreadOff}
    >
      {/* 掲載サイトの束＝収縮で奥へ沈む層。題箋より必ず奥に居る */}
      <div className={styles.pile} data-fv-depth="1" aria-hidden="true">
        {picks.map((p, i) => (
          <div
            key={p.slot}
            className={styles.card}
            data-wk-card
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            style={
              {
                "--x": `${p.x}%`,
                "--y": `${p.y}%`,
                "--r": `${p.r}deg`,
                "--hx": `${p.hx}%`,
                "--hy": `${p.hy}%`,
                "--hr": `${p.hr}deg`,
                "--hd": `${(i * 0.022).toFixed(3)}s`,
              } as CSSProperties
            }
          >
            <Image
              src={p.src}
              alt=""
              fill
              sizes={SHEET_SIZES}
              className={styles.shot}
              loading="lazy"
            />
          </div>
        ))}
      </div>

      {/* 手前の一枚＝題箋。題字が押し込まれる。沈まない・透けない */}
      <div className={styles.front} data-wk-front>
        {children}
      </div>

      {/* 隅の索引（settled で現れる）。数字は data 由来 */}
      <div className={styles.corner}>
        <span className={styles.cornerText}>
          No.&nbsp;{String(1).padStart(numberWidth, "0")}
          &nbsp;–&nbsp;
          {String(count).padStart(numberWidth, "0")}
        </span>
      </div>
    </div>
  );
}
