"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Work } from "@/types/work";
import type { Tool } from "@/types/tool";
import type { CaseStudy } from "@/types/case";
import { measurePan, RETURN_DURATION, type PanSpec } from "@/lib/hoverScroll";
import { getFdeIntro } from "@/lib/caseCatalog";
import { useLenis } from "@/components/animation/SmoothScroll";
import SectionMark from "@/components/fv/top-body/SectionMark";
import styles from "./PickUpWorks.module.css";

gsap.registerPlugin(ScrollTrigger);

/* =============================================================
   制作実績（Pickup）— 案B改-2「紙片が舞う」／重ね帖
   2026-08-23 本実装。仕様の正本＝
   _トップ実績枠_デザイン3案/案B改-2_紙片が舞う.html

   壊してはいけない契約
   - props（works / tools）の形／`/works/<slug>` `/tools/<slug>` のリンク先
   - 件数はハードコードしない（works.length / tools.length から出す）
   - /api/works の schema:1 / count:25（このファイルからは触らない）
   ============================================================= */

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** 送り（常時アニメA）の周期ms。金の走査点の一往復もこの長さに合わせる */
const CYCLE = 3200;

/**
 * ★ 束が同時に跳ねると画面がうるさいので、枠ごとに送りの位相をずらす
 *   （2026-08-23 あおきさん指示）。2026-09-16 に枠が3つ（01 FDE事業／
 *   02 ツール制作／03 Web制作）へ増えたので、半周ではなく
 *   **周期の3分の1ずつ** に組み直した。
 *     ・03 Web制作 ＝ 0（基準。startCycle で即座に回りはじめる）
 *     ・01 FDE事業 ＝ CYCLE の 1/3 遅れ
 *     ・02 ツール制作 ＝ CYCLE の 2/3 遅れ
 *   ⚠ 周期の長さ（CYCLE）は不変。動かしているのは位相だけ。
 *   ⚠ CSS 側の走査点も同じだけずらしてある
 *      （.isLive.deckWrapCases / .isLive.deckWrapTools の .tracer）。
 */
const CASES_PHASE = Math.round(CYCLE / 3);
const TOOLS_PHASE = Math.round((CYCLE * 2) / 3);

/** 01 FDE事業の枠の見出し・リード（契約＝lib/caseCatalog.ts。文言はここで作らない） */
const fdeIntro = getFdeIntro();

/**
 * ★ 3列2段。SP（767px以下）は1カラムの縦積み。
 *   ⚠ CSS の @media (min-width: 768px) の --cw / --ov と必ず一致させること。
 *      舞い去る向きの割り振り（driftOf）がこの列数を前提にしている。
 */
const COLS_PC = 3;

/** 中央の台が育つ時間ms。CSS の --pw-grow と一致させること */
const GROW_MS = 1150;

/** 中央の台が札へ戻る時間ms。CSS の --pw-back と一致させること */
const BACK_MS = 680;

/** FLIP の transitionend 取りこぼし保険（--pw-grow より長く） */
const FLIP_TIMEOUT = 1500;

/** 舞いながら消える時間ms／飛行時間の何割の地点から消えはじめるか */
const FADE_MS = 700;
const FADE_AT = 0.42;

/** ホバーを外したとき先頭へ戻る時間ms（lib/hoverScroll.ts と同値） */
const RETURN_MS = Math.round(RETURN_DURATION * 1000);

/** 入場（束が集まる）の所要ms。CSS の transition-duration + 最終 delay より長く */
const ENTER_MS = 1560;

/**
 * ⚠ しきい値はここ1本に集約する。CSS 側（@media (max-width: 767px) /
 *    (min-width: 768px)）と必ず一致させること。
 *    2026-08-23 以前は JS が `window.innerWidth <= 768`、CSS が 860 と 767 で
 *    切り替わっており、768〜860px の帯でホバー演出だけが動くバグがあった。
 */
const SP_QUERY = "(max-width: 767px)";

/** ⚠ タッチ端末で :hover が張り付くのを避ける。マウスのときだけホバー配線する */
const FINE_QUERY = "(hover: hover) and (pointer: fine)";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

/** カード側とステージ側の sizes。ステージの下敷きはカードと同じ値＝キャッシュに当てる */
const CARD_SIZES = "(max-width: 767px) 92vw, (max-width: 1119px) 34vw, 21vw";
const STAGE_SIZES = "(max-width: 900px) 92vw, 660px";

/**
 * ★ 札ごとの「癖」（紙の目）。乱数は使わない＝同じ札はいつも同じ舞いかたをする。
 *   up   … 縦の向きと強さ（負＝上へ舞う／正＝下へ落ちる）
 *   spin … 傾き（度）。2D の rotate のみ。3D は使わない
 *   dur  … 飛んでいる時間ms
 *   wait … 滑り出すまでの遅れms
 *   far  … 遠さの係数
 */
const TEMPER = [
  { up: -0.78, spin: -9, dur: 1180, wait: 40, far: 1.06 }, /* W-01 高く長く */
  { up: 0.56, spin: 12, dur: 980, wait: 110, far: 0.92 }, /* W-02 低く速く */
  { up: -0.46, spin: 7, dur: 1320, wait: 0, far: 1.18 }, /* W-03 最初に出て最も遠くへ */
  { up: 0.82, spin: -14, dur: 1060, wait: 170, far: 0.98 }, /* W-04 最後に出て深く沈む */
  { up: -0.62, spin: 10, dur: 1240, wait: 70, far: 1.1 }, /* W-05 */
  { up: 0.48, spin: -6, dur: 900, wait: 140, far: 0.86 }, /* W-06 低く抜ける */
];

interface Drift {
  x: number;
  y: number;
  r: number;
  s: number;
  dur: number;
  wait: number;
}

interface PickUpWorksProps {
  works: Work[];
  /** 02 ツール制作の枠に出す自社開発ツール。空なら従来の「準備中」プレートに戻る */
  tools: Tool[];
  /** 01 FDE事業の枠に出す導入事例の6選。0件なら枠ごと出さない（プレートは作らない） */
  cases: CaseStudy[];
}

function mq(query: string) {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

/** いまの並びの列数（3列2段 or SPの1カラム） */
function colsNow() {
  return mq(SP_QUERY) ? 1 : COLS_PC;
}

/** 札 k が、選ばれた札から見て「格子の上で何マス離れているか」 */
function gridRank(k: number, chosen: number) {
  const cols = colsNow();
  if (cols === 1) return Math.abs(k - chosen);
  return (
    Math.abs((k % cols) - (chosen % cols)) +
    Math.abs(Math.floor(k / cols) - Math.floor(chosen / cols))
  );
}

function charSpans(text: string, baseDelay = 0) {
  return text.split("").map((char, i) => (
    <span
      key={`${char}-${i}`}
      className={styles.pickupChar}
      style={{ transitionDelay: `${baseDelay + i * 0.03}s` }}
    >
      {char === " " ? " " : char}
    </span>
  ));
}

/** W-01 形式の通し番号 */
function workIdx(i: number) {
  return `W-${String(i + 1).padStart(2, "0")}`;
}

/** その要素がいま「自分の高さの何割」送られているか（縦流しの進捗） */
/**
 * 札ごとの縦流しキーフレームを差し込む（P11・2026-09-03）。
 *
 * 溜めを「秒」で固定すると、溜めの割合（＝キーフレームの %）が札ごとに変わる。
 * CSS の @keyframes は % に var() を書けないので、実寸を読んだ時点で JS が作る。
 * 名前は札ごとに固定（pwPanCard0〜）なので、再測定しても増殖しない。
 *
 * ⚠ CSS Modules 側の `pwPan` はハッシュ名になるため、ここで作る名前とは衝突しない。
 * ⚠ 呼び出し側は、この名前を `--pw-pan-name` に入れてから .canPan を付けること
 *   （CSS 側は animation-name: var(--pw-pan-name) で、未設定なら none になる）。
 */
const PAN_KEYFRAMES_STYLE_ID = "pw-pan-keyframes";

function writePanKeyframes(name: string, spec: PanSpec): boolean {
  if (typeof document === "undefined") return false;
  let style = document.getElementById(
    PAN_KEYFRAMES_STYLE_ID,
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = PAN_KEYFRAMES_STYLE_ID;
    document.head.appendChild(style);
  }
  const sheet = style.sheet;
  if (!sheet) return false;
  const head = (spec.hold * 100).toFixed(3);
  const tail = (100 - spec.hold * 100).toFixed(3);
  const to = (spec.shift * -100).toFixed(3);
  // 同名の古い規則は消してから入れ直す（実寸の再取得・再マウントで重ならないように）
  for (let k = sheet.cssRules.length - 1; k >= 0; k -= 1) {
    const rule = sheet.cssRules[k];
    if (rule instanceof CSSKeyframesRule && rule.name === name) sheet.deleteRule(k);
  }
  try {
    sheet.insertRule(
      `@keyframes ${name}{0%,${head}%{transform:translateY(0)}` +
        `${tail}%,100%{transform:translateY(${to}%)}}`,
      sheet.cssRules.length,
    );
  } catch {
    return false;
  }
  return true;
}

function progressFrac(node: HTMLElement | null): number {
  if (!node) return 0;
  const h = node.offsetHeight;
  if (!h) return 0;
  const t = getComputedStyle(node).transform;
  if (!t || t === "none") return 0;
  let y = 0;
  try {
    y = new DOMMatrixReadOnly(t).m42;
  } catch {
    const m = t.match(/matrix\(([^)]+)\)/);
    if (m) y = parseFloat(m[1].split(",")[5]);
  }
  return -y / h;
}

export default function PickUpWorks({ works, tools, cases }: PickUpWorksProps) {
  const lenis = useLenis();

  /* ---- DOM ---- */
  const sectionRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const worksWrapRef = useRef<HTMLDivElement>(null);
  const worksDeckRef = useRef<HTMLUListElement>(null);
  const toolsWrapRef = useRef<HTMLDivElement>(null);
  const toolsDeckRef = useRef<HTMLUListElement>(null);
  /* ★ 01 FDE事業の枠。02 ツール制作の枠と同じ作りを写している */
  const casesWrapRef = useRef<HTMLDivElement>(null);
  const casesDeckRef = useRef<HTMLUListElement>(null);
  const tickRef = useRef<HTMLSpanElement>(null);
  const tickGhostRef = useRef<HTMLSpanElement>(null);
  const toolsTickRef = useRef<HTMLSpanElement>(null);
  const toolsTickGhostRef = useRef<HTMLSpanElement>(null);
  const casesTickRef = useRef<HTMLSpanElement>(null);
  const casesTickGhostRef = useRef<HTMLSpanElement>(null);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);
  const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);
  const panRefs = useRef<(HTMLDivElement | null)[]>([]);
  const toolRefs = useRef<(HTMLLIElement | null)[]>([]);
  const caseRefs = useRef<(HTMLLIElement | null)[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageInnerRef = useRef<HTMLDivElement>(null);
  const stageThumbRef = useRef<HTMLDivElement>(null);
  const stagePanRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const detailLinkRef = useRef<HTMLAnchorElement>(null);

  /* ---- 状態（再描画を起こさないものは全て ref に持つ） ---- */
  const raisedRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  /** ★ ツール枠の送り。works と同じ周期・2/3 ずらし（TOOLS_PHASE） */
  const toolRaisedRef = useRef(0);
  const toolsTimerRef = useRef<number | null>(null);
  const toolsDelayRef = useRef<number | null>(null);
  /** ★ FDE枠の送り。works と同じ周期・1/3 ずらし（CASES_PHASE） */
  const caseRaisedRef = useRef(0);
  const casesTimerRef = useRef<number | null>(null);
  const casesDelayRef = useRef<number | null>(null);
  /** 栞がいまどの段に居るか（段をまたぐときは滑らせず灯し直す） */
  const tickRowRef = useRef(-1);
  const toolsTickRowRef = useRef(-1);
  const casesTickRowRef = useRef(-1);
  const visibleRef = useRef(false);
  const hoveringRef = useRef(false);
  const enteringRef = useRef(false);
  const reducedRef = useRef(false);
  const openRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const panSpecRef = useRef<(PanSpec | null)[]>([]);
  const panTimerRef = useRef<(number | null)[]>([]);
  const driftPlanRef = useRef<(Drift | null)[]>([]);
  /** 開いた瞬間に札が流れていた位置。中央の板へ「続き」として引き継ぐ */
  const carryRef = useRef(0);

  /** ★ 世代トークン。開くたびに +1。遅れて発火する後始末は必ず自分の世代を確かめる。
      閉じアニメ用の待ちタイマーを1変数で共有すると高さが膨らむ事故を構造的に防ぐ */
  const genRef = useRef(0);
  const pendingRef = useRef<number[]>([]);

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  /* ---- 02 ツール枠。0本なら従来の「準備中」プレートへ戻る ---- */
  const hasTools = tools.length > 0;

  /* ---- 01 FDE枠。0件なら枠ごと出さない（「準備中」プレートは作らない
         ＝2026-08-23 あおきさん判断の踏襲） ---- */
  const hasCases = cases.length > 0;

  /* =========================================================
     タイマーの世代管理
     ========================================================= */
  const later = useCallback((fn: () => void, ms: number) => {
    const myGen = genRef.current;
    const id = window.setTimeout(() => {
      const at = pendingRef.current.indexOf(id);
      if (at >= 0) pendingRef.current.splice(at, 1);
      if (myGen !== genRef.current) return; /* 世代が変わっていたら何もしない */
      fn();
    }, ms);
    pendingRef.current.push(id);
    return id;
  }, []);

  const killPending = useCallback(() => {
    pendingRef.current.forEach((id) => window.clearTimeout(id));
    pendingRef.current.length = 0;
  }, []);

  /* =========================================================
     手前へ出す／戻す（transform と opacity だけ）
     ========================================================= */
  /**
   * 栞を、いま手前に出ている札の真下へ置く。
   * ⚠ 3列2段なので x だけでなく y も要る。段をまたぐときは横へ滑らせず、
   *    いったん消して次の段で灯し直す（段の間を斜めに飛ぶと目障りなため）。
   */
  const placeTickOn = useCallback(
    (
      wrap: HTMLDivElement | null,
      tick: HTMLSpanElement | null,
      ghost: HTMLSpanElement | null,
      rowRef: { current: number },
      cards: (HTMLLIElement | null)[],
      i: number,
    ) => {
      if (!wrap) return;
      const card = cards[i];
      if (mq(SP_QUERY) || i < 0 || !card) {
        wrap.classList.remove(styles.hasTick);
        rowRef.current = -1;
        return;
      }
      wrap.classList.add(styles.hasTick);
      const x = `${card.offsetLeft + card.offsetWidth / 2}px`;
      const y = `${card.offsetTop + card.offsetHeight}px`;
      const row = Math.round(card.offsetTop);
      const jump = rowRef.current >= 0 && rowRef.current !== row;
      rowRef.current = row;
      [tick, ghost].forEach((el) => {
        if (!el) return;
        if (jump) {
          el.style.transition = "none";
          el.style.opacity = "0";
        }
        el.style.setProperty("--pw-tick-x", x);
        el.style.setProperty("--pw-tick-y", y);
        if (jump) {
          void el.offsetWidth; /* ここで消灯を確定させてから */
          el.style.transition = ""; /* クラス側の transition へ戻し */
          el.style.opacity = ""; /* 新しい段で灯し直す */
        }
      });
    },
    [],
  );

  /* ★ 栞の余韻＝同じ位置を、遅れて・ゆっくり追いかける残像（CSS 側で遅らせる） */
  const placeTick = useCallback(
    (i: number) => {
      placeTickOn(
        worksWrapRef.current,
        tickRef.current,
        tickGhostRef.current,
        tickRowRef,
        cardRefs.current,
        i,
      );
    },
    [placeTickOn],
  );

  const placeToolsTick = useCallback(
    (i: number) => {
      placeTickOn(
        toolsWrapRef.current,
        toolsTickRef.current,
        toolsTickGhostRef.current,
        toolsTickRowRef,
        toolRefs.current,
        i,
      );
    },
    [placeTickOn],
  );

  const placeCasesTick = useCallback(
    (i: number) => {
      placeTickOn(
        casesWrapRef.current,
        casesTickRef.current,
        casesTickGhostRef.current,
        casesTickRowRef,
        caseRefs.current,
        i,
      );
    },
    [placeTickOn],
  );

  const setRaisedWorks = useCallback(
    (i: number, moveTick: boolean) => {
      cardRefs.current.forEach((c, k) => {
        if (c) c.classList.toggle(styles.isRaised, k === i);
      });
      if (moveTick) placeTick(i);
    },
    [placeTick],
  );

  const setRaisedTools = useCallback(
    (i: number, moveTick: boolean) => {
      toolRefs.current.forEach((c, k) => {
        if (c) c.classList.toggle(styles.isRaised, k === i);
      });
      if (moveTick) placeToolsTick(i);
    },
    [placeToolsTick],
  );

  const setRaisedCases = useCallback(
    (i: number, moveTick: boolean) => {
      caseRefs.current.forEach((c, k) => {
        if (c) c.classList.toggle(styles.isRaised, k === i);
      });
      if (moveTick) placeCasesTick(i);
    },
    [placeCasesTick],
  );

  /** 走査点の走る距離＝束の実幅。CSS変数で渡す（幅そのものは動かさない）。
      ⚠ 2026-08-23 以降はツール枠にも、2026-09-16 以降は FDE枠にも走査点がある＝3つとも測る */
  const measureTrace = useCallback(() => {
    const pairs: [HTMLDivElement | null, HTMLUListElement | null][] = [
      [worksWrapRef.current, worksDeckRef.current],
      [toolsWrapRef.current, toolsDeckRef.current],
      [casesWrapRef.current, casesDeckRef.current],
    ];
    pairs.forEach(([wrap, deck]) => {
      if (!wrap || !deck) return;
      wrap.style.setProperty("--pw-trace-w", `${deck.offsetWidth}px`);
      wrap.style.setProperty("--pw-cycle", `${CYCLE}ms`);
    });
  }, []);

  /* =========================================================
     ★ 送り（常時アニメ）。止めるときは clearInterval ＋ .isLive を外す。
        「見えなくする」ではなく本当に止める
     ========================================================= */
  const canRun = useCallback(
    () =>
      !reducedRef.current &&
      visibleRef.current &&
      !document.hidden &&
      !hoveringRef.current &&
      !enteringRef.current &&
      openRef.current === null &&
      !mq(SP_QUERY),
    [],
  );

  const stepDeck = useCallback(() => {
    const n = works.length;
    if (n === 0) return;
    raisedRef.current = (raisedRef.current + 1) % n;
    setRaisedWorks(raisedRef.current, true);
  }, [setRaisedWorks, works.length]);

  /** ★ ツール枠の送り。6本を通しで巡回する（Web制作と同じ作法） */
  const stepTools = useCallback(() => {
    const n = tools.length;
    if (n === 0) return;
    toolRaisedRef.current = (toolRaisedRef.current + 1) % n;
    setRaisedTools(toolRaisedRef.current, true);
  }, [setRaisedTools, tools.length]);

  /** ★ FDE枠の送り。6件を通しで巡回する（Web制作・ツール制作と同じ作法） */
  const stepCases = useCallback(() => {
    const n = cases.length;
    if (n === 0) return;
    caseRaisedRef.current = (caseRaisedRef.current + 1) % n;
    setRaisedCases(caseRaisedRef.current, true);
  }, [cases.length, setRaisedCases]);

  const startCycle = useCallback(() => {
    /* 3つの枠は必ず一緒に回り・一緒に止まる。works 側だけ見れば足りる */
    if (timerRef.current !== null) return;
    if (!canRun()) return;
    measureTrace();
    /* 金の走査点はここで初めて animation を得る */
    worksWrapRef.current?.classList.add(styles.isLive);
    timerRef.current = window.setInterval(stepDeck, CYCLE);

    /* ★ 位相をずらしてから回しはじめる＝3つの束が同時に跳ねない。
       ⚠ タイマーが増えるが、停止の契約は works と完全に同じ。
          stopCycle でこの待ちタイマーも必ず落とす（画面外で発火0を保つ） */
    const casesWrap = casesWrapRef.current;
    if (casesWrap && cases.length > 0) {
      casesWrap.classList.add(styles.isLive);
      casesDelayRef.current = window.setTimeout(() => {
        casesDelayRef.current = null;
        stepCases();
        casesTimerRef.current = window.setInterval(stepCases, CYCLE);
      }, CASES_PHASE);
    }

    const toolsWrap = toolsWrapRef.current;
    if (!toolsWrap || tools.length === 0) return;
    toolsWrap.classList.add(styles.isLive);
    toolsDelayRef.current = window.setTimeout(() => {
      toolsDelayRef.current = null;
      stepTools();
      toolsTimerRef.current = window.setInterval(stepTools, CYCLE);
    }, TOOLS_PHASE);
  }, [
    canRun,
    cases.length,
    measureTrace,
    stepCases,
    stepDeck,
    stepTools,
    tools.length,
  ]);

  const stopCycle = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (toolsTimerRef.current !== null) {
      window.clearInterval(toolsTimerRef.current);
      toolsTimerRef.current = null;
    }
    if (toolsDelayRef.current !== null) {
      window.clearTimeout(toolsDelayRef.current);
      toolsDelayRef.current = null;
    }
    if (casesTimerRef.current !== null) {
      window.clearInterval(casesTimerRef.current);
      casesTimerRef.current = null;
    }
    if (casesDelayRef.current !== null) {
      window.clearTimeout(casesDelayRef.current);
      casesDelayRef.current = null;
    }
    /* animation の指定ごと外す＝ getAnimations から消える */
    worksWrapRef.current?.classList.remove(styles.isLive);
    toolsWrapRef.current?.classList.remove(styles.isLive);
    casesWrapRef.current?.classList.remove(styles.isLive);
  }, []);

  /** 画面外・背面タブでは CSS アニメも本当に止める（paused） */
  const refresh = useCallback(() => {
    const dormant = !visibleRef.current || document.hidden;
    sectionRef.current?.classList.toggle(styles.isDormant, dormant);
    if (canRun()) startCycle();
    else stopCycle();
  }, [canRun, startCycle, stopCycle]);

  /* =========================================================
     ★ フルスクショの縦流し（transform 駆動の CSS アニメ）
        本番 hoverScroll.ts の objectPosition 駆動 rAF を置き換えたもの
     ========================================================= */
  const panClear = useCallback((i: number) => {
    const t = panTimerRef.current[i];
    if (t) {
      window.clearTimeout(t);
      panTimerRef.current[i] = null;
    }
    const card = cardRefs.current[i];
    const pan = panRefs.current[i];
    if (pan) {
      pan.style.transition = "";
      pan.style.transform = "";
    }
    card?.classList.remove(styles.isPanning);
  }, []);

  /** いまの位置から先頭へ 0.5秒で戻す。パッと飛ばさない */
  const panReturn = useCallback(
    (i: number) => {
      const card = cardRefs.current[i];
      const pan = panRefs.current[i];
      if (!card) return;
      const f = progressFrac(pan);
      const t = panTimerRef.current[i];
      if (t) {
        window.clearTimeout(t);
        panTimerRef.current[i] = null;
      }
      card.classList.remove(styles.isHover); /* ← ここで CSS アニメが外れる */
      if (!pan || reducedRef.current || f <= 0.01) {
        panClear(i);
        return;
      }
      card.classList.add(styles.isPanning); /* 画像の箱は戻りきるまで開けておく */
      pan.style.transition = "none";
      pan.style.transform = `translateY(${(-f * 100).toFixed(3)}%)`;
      void pan.offsetWidth;
      pan.style.transition = `transform ${RETURN_MS}ms cubic-bezier(0.45, 0, 0.2, 1)`;
      pan.style.transform = "translateY(0)";
      panTimerRef.current[i] = window.setTimeout(() => {
        panTimerRef.current[i] = null;
        panClear(i);
      }, RETURN_MS + 80);
    },
    [panClear],
  );

  /** いま縦流しをしている札の番号（無ければ -1） */
  const panningIdx = useCallback(() => {
    for (let k = 0; k < cardRefs.current.length; k += 1) {
      if (cardRefs.current[k]?.classList.contains(styles.isHover)) return k;
    }
    return -1;
  }, []);

  /* =========================================================
     ホバー／フォーカス＝別のアニメーションへ移行
       送りを止め、その1枚を手前で固定し、フルスクショの縦流しを走らせる
     ========================================================= */
  const hoverWorksOn = useCallback(
    (i: number) => {
      if (openRef.current !== null || enteringRef.current) return;
      if (mq(SP_QUERY)) return;
      const card = cardRefs.current[i];
      if (!card) return;
      const was = panningIdx();
      if (was >= 0 && was !== i) panReturn(was); /* 前の1枚は先頭へ戻す */
      panClear(i); /* 戻り途中なら痕跡を消してから積む */
      card.classList.add(styles.isPanning);
      card.classList.add(styles.isHover);
      hoveringRef.current = true;
      stopCycle();
      raisedRef.current = i;
      setRaisedWorks(i, true);
    },
    [panClear, panReturn, panningIdx, setRaisedWorks, stopCycle],
  );

  const hoverWorksOff = useCallback(() => {
    const was = panningIdx();
    if (was >= 0) panReturn(was);
    hoveringRef.current = false;
    refresh();
    setRaisedWorks(raisedRef.current, true);
  }, [panReturn, panningIdx, refresh, setRaisedWorks]);

  /* ★ ツール枠にも送りが入ったので、ホバー中はそこで止める（Web制作と同じ作法）。
     ⚠ hoveringRef は枠をまたいで1つ。どちらかにマウスが載っているあいだは
        セクション全体の送りを止める＝読んでいる最中に札が入れ替わらない */
  const hoverToolsOn = useCallback(
    (i: number) => {
      if (openRef.current !== null || enteringRef.current) return;
      if (mq(SP_QUERY)) return;
      hoveringRef.current = true;
      stopCycle();
      toolRaisedRef.current = i;
      setRaisedTools(i, true);
    },
    [setRaisedTools, stopCycle],
  );

  const hoverToolsOff = useCallback(() => {
    hoveringRef.current = false;
    refresh();
    setRaisedTools(toolRaisedRef.current, true);
  }, [refresh, setRaisedTools]);

  /* ★ FDE枠も 02 と同じ作法（枠をまたいで hoveringRef は1つ＝どこかに
     マウスが載っているあいだはセクション全体の送りを止める） */
  const hoverCasesOn = useCallback(
    (i: number) => {
      if (openRef.current !== null || enteringRef.current) return;
      if (mq(SP_QUERY)) return;
      hoveringRef.current = true;
      stopCycle();
      caseRaisedRef.current = i;
      setRaisedCases(i, true);
    },
    [setRaisedCases, stopCycle],
  );

  const hoverCasesOff = useCallback(() => {
    hoveringRef.current = false;
    refresh();
    setRaisedCases(caseRaisedRef.current, true);
  }, [refresh, setRaisedCases]);

  /* =========================================================
     ★★ 紙片が舞う — 選ばれなかった5枚の去りかた
     ========================================================= */

  /**
   * 札 k が、選ばれた札 chosen から見てどう舞うかを決める。
   *
   * ★ 2026-08-23 3列2段化にあわせて組み直した。
   *   ・横（x）＝**列の差**で決める。左の列の札は左へ、右の列の札は右へ。
   *     同じ列（＝選ばれた札の真上／真下）の札は、左右へはほとんど振らない
   *     （紙の目 t.spin の向きへ 0.34 ぶんだけ逃がす程度）
   *   ・縦（y）＝**段の差**で決める。上の段の札は段ごと上へ抜け、
   *     下の段の札は段ごと下へ沈む。同じ段の札は、これまでどおり
   *     札ごとの癖（t.up）にまかせる
   *   ・傾きは 2D の rotate のみ。|r| は 20度以内に収まる
   *   乱数は使わない＝同じ札はいつも同じ舞いかたをする。
   *   四方八方へ散らかすのではなく「列は左右・段は上下」という筋を通すことで、
   *   和の暗がりの品を壊さずに 2段へ対応させている。
   */
  const driftOf = useCallback(
    (k: number, chosen: number, w: number, h: number): Drift => {
      const t = TEMPER[k % TEMPER.length];
      const cols = colsNow();

      if (cols === 1) {
        /* SP＝1カラムの縦積み。従来どおり通し番号の前後で割る（版面が狭いので抑えめ） */
        const d = k - chosen;
        const dir = d < 0 ? -1 : 1;
        const rank = Math.abs(d);
        const spread = 0.62;
        return {
          x: dir * w * (0.62 + rank * 0.26) * t.far * spread,
          y: t.up * h * (0.9 + rank * 0.34) * spread,
          r: t.spin + dir * rank * 1.6,
          s: 0.9 - rank * 0.018,
          dur: t.dur,
          wait: t.wait,
        };
      }

      const dc = (k % cols) - (chosen % cols); /* 列の差 */
      const dr = Math.floor(k / cols) - Math.floor(chosen / cols); /* 段の差 */
      const hRank = Math.abs(dc);
      const vRank = Math.abs(dr);
      const hDir = dc === 0 ? (t.spin < 0 ? -0.34 : 0.34) : Math.sign(dc);
      const vDir = dr === 0 ? t.up : Math.sign(dr) * (0.74 + Math.abs(t.up) * 0.42);
      return {
        x: hDir * w * (0.62 + hRank * 0.42) * t.far,
        y: vDir * h * (0.86 + vRank * 0.52),
        r: t.spin + Math.sign(dc) * hRank * 1.6 + dr * 2.4,
        s: 0.9 - (hRank + vRank) * 0.016 /* わずかに縮む＝遠ざかって見える */,
        dur: t.dur,
        wait: t.wait,
      };
    },
    [],
  );

  const setDriftVars = useCallback(
    (card: HTMLElement, v: { x: number; y: number; r: number; s: number }) => {
      card.style.setProperty("--dx", `${v.x.toFixed(1)}px`);
      card.style.setProperty("--dy", `${v.y.toFixed(1)}px`);
      card.style.setProperty("--dr", `${v.r.toFixed(2)}deg`);
      card.style.setProperty("--ds", v.s.toFixed(3));
    },
    [],
  );

  /** 舞い去らせる。transform と opacity だけ。 */
  const flyAway = useCallback(
    (chosen: number) => {
      const base = thumbRefs.current[chosen]?.getBoundingClientRect();
      if (!base) return;
      const w = base.width;
      const h = base.height;
      const plan: (Drift | null)[] = [];
      cardRefs.current.forEach((c, k) => {
        if (!c || k === chosen) {
          plan[k] = null;
          return;
        }
        const v = driftOf(k, chosen, w, h);
        plan[k] = v;
        c.style.transition =
          `transform ${v.dur}ms ${EASE} ${v.wait}ms, ` +
          `opacity ${FADE_MS}ms cubic-bezier(0.45, 0, 0.2, 1) ${Math.round(
            v.wait + v.dur * FADE_AT,
          )}ms`;
        setDriftVars(c, v);
        c.classList.add(styles.isDrift);
        c.style.opacity = "0";
      });
      driftPlanRef.current = plan;
    },
    [driftOf, setDriftVars],
  );

  /** 呼び戻す。逆再生ではなく「上空のやや外側から降ってきて束へ収まる」。
      外側の札から先に着地し、選ばれた札のとなりが最後に閉じる。 */
  const flyBack = useCallback(
    (chosen: number) => {
      const base = thumbRefs.current[chosen]?.getBoundingClientRect();
      const h = base ? base.height : 0;
      const plan = driftPlanRef.current;

      /* 1) 戻り始点へ瞬間移動（トランジション無し） */
      cardRefs.current.forEach((c, k) => {
        const v = plan[k];
        if (!c || !v) return;
        c.style.transition = "none";
        setDriftVars(c, {
          x: v.x * 0.42,
          y: -1.15 * h /* どの札も「上空」から降ってくる */,
          r: -0.5 * v.r,
          s: 1.06,
        });
        c.style.opacity = "0";
      });
      void worksDeckRef.current?.offsetWidth; /* ここで一度だけ確定させる */

      /* 2) 外側の札から順に帰す（3列2段では「格子の上での遠さ」で並べる） */
      const order: number[] = [];
      cardRefs.current.forEach((c, k) => {
        if (c && plan[k]) order.push(k);
      });
      order.sort((a, b) => gridRank(b, chosen) - gridRank(a, chosen));

      order.forEach((k, i) => {
        const c = cardRefs.current[k];
        if (!c) return;
        const wait = i * 45;
        c.style.transition =
          `transform ${BACK_MS - 60}ms ${EASE} ${wait}ms, ` +
          `opacity 420ms cubic-bezier(0.45, 0, 0.2, 1) ${wait}ms`;
        c.classList.remove(styles.isDrift); /* ← 通常の transform へ戻る＝「収まる」動き */
        c.style.opacity = "1";
      });
    },
    [setDriftVars],
  );

  /** 舞いの痕跡をすべて消す（インラインの transition / opacity / 変数 / クラス） */
  const clearDrift = useCallback(() => {
    cardRefs.current.forEach((c) => {
      if (!c) return;
      c.classList.remove(styles.isDrift);
      c.style.transition = "";
      c.style.opacity = "";
      c.style.removeProperty("--dx");
      c.style.removeProperty("--dy");
      c.style.removeProperty("--dr");
      c.style.removeProperty("--ds");
    });
    driftPlanRef.current = [];
  }, []);

  /* =========================================================
     クリック展開（FLIP＝実測 rect → transform → 解除）
     ========================================================= */

  /** ★ 台を「いま画面に見えているところの中央」へ置く。
      .inner いっぱいに広げて上下中央にすると、版面が背の高いセクションでは
      台が画面の下へはみ出す。固定ヘッダー（60px）の裏へも入れない。 */
  const layoutStage = useCallback(() => {
    const stage = stageRef.current;
    const stageInner = stageInnerRef.current;
    const stageThumb = stageThumbRef.current;
    const inner = innerRef.current;
    if (!stage || !stageInner || !inner) return;
    stage.style.height = "auto";
    stageInner.style.width = "";
    const innerH = inner.clientHeight;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const safeTop = 76; /* 固定ヘッダー60px ＋ 余白 */
    const safeBottom = 16;
    const avail = Math.max(160, vh - safeTop - safeBottom);

    /* ⚠ 背の低いビューポート（ノートPCの横向き・短い窓）では、16:10 の板と
       文字を足した高さが画面を超えて「詳しく見る →」まで見えなくなる。
       板の幅を詰めて全部が画面に収まるようにする（2回で収束させる）。
       ⚠ FLIP の last を測る前に確定させること。順番を変えると着地点がずれる。 */
    let need = stageInner.offsetHeight;
    if (stageThumb && need > avail) {
      for (let pass = 0; pass < 3 && need > avail; pass += 1) {
        const w = stageInner.offsetWidth;
        const thumbW = stageThumb.offsetWidth;
        const thumbH = stageThumb.offsetHeight;
        if (!w || !thumbW || !thumbH) break;
        /* 板が台の幅に占める割合（1カラムなら 1、横並びなら 0.54） */
        const k = thumbW / w;
        const rest = need - thumbH; /* 文字・罫・ボタンの高さ */
        const next = Math.max(300, Math.min(w - 1, (avail - rest) / (0.625 * k)));
        stageInner.style.width = `${Math.round(next)}px`;
        need = stageInner.offsetHeight;
      }
    }

    const h = Math.min(innerH, Math.max(need + 56, 0), avail);
    const innerTop = inner.getBoundingClientRect().top;
    let top = Math.round(safeTop + (avail - h) / 2 - innerTop);
    if (top + h > innerH) top = innerH - h;
    if (top < 0) top = 0;
    stage.style.top = `${top}px`;
    stage.style.height = `${h}px`;
  }, []);

  /** 展開中は、舞い去った札にキーボードで到達できないようにする */
  const setCardsTabbable = useCallback((on: boolean) => {
    cardRefs.current.forEach((c) => {
      const a = c?.querySelector("a");
      if (!a) return;
      if (on) a.removeAttribute("tabindex");
      else a.setAttribute("tabindex", "-1");
    });
  }, []);

  const openWork = useCallback(
    (i: number) => {
      if (busyRef.current || openRef.current !== null || enteringRef.current) return;

      genRef.current += 1; /* ★ 前の開閉に属する後始末を全部無効化する */
      killPending();
      clearDrift();

      lastFocusRef.current = document.activeElement as HTMLElement | null;
      openRef.current = i;
      hoveringRef.current = false;
      stopCycle();

      /* ★ ホバーで流れていた位置を受け取って、台の板へ引き継ぐ（流れを切らない）。
         ⚠ 台の板はまだ描画されていない（setOpenIndex の前）ので、値だけ持ち越して
            実際の適用は openIndex を受け取る useLayoutEffect 側で行う */
      const was = panningIdx();
      carryRef.current = was === i ? progressFrac(panRefs.current[i]) : 0;
      cardRefs.current.forEach((c, k) => {
        panClear(k);
        c?.classList.remove(styles.isHover);
      });
      /* ★ 選ばれた札は isRaised のまま残す。残さないと開いたときと閉じたときで
         札の矩形が変わり、板の着地点がずれる */
      raisedRef.current = i;
      setRaisedWorks(i, true);
      setCardsTabbable(false);

      setOpenIndex(i);
    },
    [
      clearDrift,
      killPending,
      panClear,
      panningIdx,
      setCardsTabbable,
      setRaisedWorks,
      stopCycle,
    ],
  );

  const closeWork = useCallback(() => {
    if (busyRef.current || openRef.current === null) return;
    const i = openRef.current;
    const section = sectionRef.current;
    const stageThumb = stageThumbRef.current;
    const stagePan = stagePanRef.current;
    const cardThumb = thumbRefs.current[i];
    const card = cardRefs.current[i];

    const finish = () => {
      section?.classList.remove(styles.isOpen, styles.isClosing);
      if (stageThumb) {
        stageThumb.style.transform = "";
        stageThumb.style.transition = "";
      }
      if (stagePan) {
        stagePan.style.transition = "";
        stagePan.style.transform = "";
      }
      if (card) card.style.opacity = "";
      busyRef.current = false;
      openRef.current = null;
      setOpenIndex(null);
      setCardsTabbable(true);
      const back = lastFocusRef.current;
      lastFocusRef.current = null;
      back?.focus();
      /* ★ 追加エフェクト④：先頭へ戻さない。
         いま開いていた札を手前に置いたまま送りを再開する */
      raisedRef.current = i;
      setRaisedWorks(i, true);
      refresh();
    };

    if (reducedRef.current || !section || !stageThumb || !cardThumb) {
      clearDrift();
      finish();
      return;
    }

    busyRef.current = true;

    /* 板を縮めて、元の札の矩形へ戻す */
    const first = cardThumb.getBoundingClientRect();
    const last = stageThumb.getBoundingClientRect();
    /* ← .isOpen を外す前に読む（外すとアニメが消えて進捗が取れない） */
    const sp = progressFrac(stagePan);
    section.classList.remove(styles.isOpen);
    section.classList.add(styles.isClosing);
    stageThumb.style.transform =
      `translate(${first.left - last.left}px, ${first.top - last.top}px) ` +
      `scale(${first.width / last.width}, ${first.height / last.height})`;

    /* ★ 縮みながら、サイトも先頭へ巻き戻る。ここを押さえないと閉じた瞬間に
       画が先頭へ飛んで見える。戻りきってから札と入れ替わるので、
       束に収まった札は必ず「上端＝FV」の姿になる */
    if (stagePan && sp > 0.001) {
      stagePan.style.transition = "none";
      stagePan.style.transform = `translateY(${(-sp * 100).toFixed(3)}%)`;
      void stagePan.offsetWidth;
      stagePan.style.transition = `transform ${BACK_MS}ms cubic-bezier(0.45, 0, 0.2, 1)`;
      stagePan.style.transform = "translateY(0)";
    }

    /* 5枚を呼び戻す（逆再生ではない） */
    flyBack(i);

    /* 舞い戻りの後始末。世代トークンで守っているので、
       途中でもう一度開かれても畳み残しは出ない */
    later(clearDrift, BACK_MS + 5 * 45 + 120);

    /* transitionend ＋ タイムアウトの二重化（イベント欠落でも状態機械が固まらない） */
    const myGen = genRef.current;
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      stageThumb.removeEventListener("transitionend", handler);
      if (myGen !== genRef.current) return;
      finish();
    };
    function handler(e: Event) {
      const te = e as TransitionEvent;
      if (te.propertyName === "transform" && te.target === stageThumb) fire();
    }
    stageThumb.addEventListener("transitionend", handler);
    later(fire, FLIP_TIMEOUT);
  }, [clearDrift, flyBack, later, refresh, setCardsTabbable, setRaisedWorks]);

  /* =========================================================
     展開オーバーレイの開演出（FLIP：実測rect → transform → 解除）
     ========================================================= */
  useLayoutEffect(() => {
    if (openIndex === null) return;
    const section = sectionRef.current;
    const stage = stageRef.current;
    const stageThumb = stageThumbRef.current;
    const cardThumb = thumbRefs.current[openIndex];
    const card = cardRefs.current[openIndex];
    if (!section || !stage || !stageThumb) return;

    /* ⚠ body の overflow を触らない。触るとスクロールバーが消えて版面が
       数px 横へ跳ね、開いた瞬間にセクション全体がずれて見える。
       Lenis を止め、wheel / touchmove を止めるだけにする（レイアウト不変） */
    lenis?.stop();
    const blockScroll = (e: Event) => {
      if (stageRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };
    document.addEventListener("wheel", blockScroll, { passive: false });
    document.addEventListener("touchmove", blockScroll, { passive: false });

    /* 中央の板でも同じ速度で流す（枠の高さ基準なので板が大きくても体感は揃う）。
       ・ホバー中の札から開いたとき＝負の animation-delay。札で流れていた位置から
         「続き」を流すので、流れが切れて先頭へ飛ぶことがない
       ・ホバーせずに開いたとき＝ +1.15秒。育ちきってから流しはじめる */
    const spec = panSpecRef.current[openIndex];
    if (spec) {
      // 台は札と同じキーフレーム（＝同じ溜め・同じ送り量）をそのまま使う
      stageThumb.style.setProperty("--pw-pan-name", `pwPanCard${openIndex}`);
      stageThumb.style.setProperty("--pw-pan-span", spec.span.toFixed(4));
      stageThumb.style.setProperty("--pw-pan-shift", spec.shift.toFixed(5));
      stageThumb.style.setProperty("--pw-pan-dur", `${spec.duration.toFixed(2)}s`);
      const carry = carryRef.current;
      const p = carry > 0.001 ? Math.min(carry / spec.shift, 1) : -1;
      // 走行区間は hold%〜(100-hold)%。溜めが札ごとに変わるので定数で書かない
      const delay =
        p >= 0
          ? -((spec.hold + p * (1 - spec.hold * 2)) * spec.duration)
          : GROW_MS / 1000;
      stageThumb.style.setProperty("--pw-pan-delay", `${delay.toFixed(3)}s`);
      stageThumb.classList.add(styles.stageCanPan);
    } else {
      stageThumb.classList.remove(styles.stageCanPan);
      stageThumb.style.removeProperty("--pw-pan-delay");
    }

    layoutStage();

    busyRef.current = true;

    if (reducedRef.current || !cardThumb) {
      /* 散らさず即座に最終状態へ（開閉そのものは動く）。
         ⚠ 選ばれた札もここで消す。消さないと、束はスクリムより前（z 58）に
            いるので、開いた台の文字の上に元の札が透けて残る（実測） */
      section.classList.add(styles.isOpen);
      if (card) card.style.opacity = "0";
      flyAway(openIndex);
      busyRef.current = false;
      closeBtnRef.current?.focus();
    } else {
      const first = cardThumb.getBoundingClientRect();
      const last = stageThumb.getBoundingClientRect();
      stageThumb.style.transition = "none";
      stageThumb.style.transform =
        `translate(${first.left - last.left}px, ${first.top - last.top}px) ` +
        `scale(${first.width / last.width}, ${first.height / last.height})`;
      void stageThumb.offsetWidth; /* ここで確定（この後は reflow を挟まない） */

      /* --- ここから先はすべて「次の1フレーム」で同時に始まる --- */
      stageThumb.style.transition = "";
      section.classList.add(styles.isOpen); /* 板が札の上に不透明で乗る＝すけない */
      if (card) card.style.opacity = "0"; /* 元の札を消す（板と入れ替わる） */
      stageThumb.style.transform = ""; /* 育つ */
      flyAway(openIndex); /* 5枚が舞い去る */

      const myGen = genRef.current;
      let done = false;
      const fire = () => {
        if (done) return;
        done = true;
        stageThumb.removeEventListener("transitionend", handler);
        if (myGen !== genRef.current) return;
        busyRef.current = false;
        closeBtnRef.current?.focus();
      };
      function handler(e: Event) {
        const te = e as TransitionEvent;
        if (te.propertyName === "transform" && te.target === stageThumb) fire();
      }
      stageThumb.addEventListener("transitionend", handler);
      later(fire, FLIP_TIMEOUT);
    }

    /* Esc で閉じる＋簡易フォーカストラップ（詳しく見る ⇄ 閉じる） */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeWork();
        return;
      }
      if (e.key !== "Tab") return;
      /* ⚠ DOM の並び順で持つこと（閉じる → 詳しく見る）。
         逆順で持つと「詳しく見る」から Tab したときに preventDefault が
         かからず、台の外（ヘッダーやフッターのリンク）へ抜ける（実測） */
      const focusables = [closeBtnRef.current, detailLinkRef.current].filter(
        (el): el is HTMLAnchorElement | HTMLButtonElement => el !== null,
      );
      if (focusables.length === 0) return;
      const idx = focusables.indexOf(
        document.activeElement as HTMLAnchorElement | HTMLButtonElement,
      );
      if (idx < 0) {
        e.preventDefault();
        focusables[0].focus();
      } else if (e.shiftKey && idx === 0) {
        e.preventDefault();
        focusables[focusables.length - 1].focus();
      } else if (!e.shiftKey && idx === focusables.length - 1) {
        e.preventDefault();
        focusables[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("wheel", blockScroll);
      document.removeEventListener("touchmove", blockScroll);
      lenis?.start();
      busyRef.current = false;
    };
  }, [openIndex, lenis, layoutStage, flyAway, closeWork, later]);

  /* =========================================================
     画像の実寸を読んで、縦流しの CSS 変数を渡す
     ========================================================= */
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    cardRefs.current.forEach((card, i) => {
      const img = panRefs.current[i]?.querySelector("img");
      if (!card || !img) return;
      const apply = () => {
        const spec = measurePan(img.naturalWidth, img.naturalHeight);
        panSpecRef.current[i] = spec;
        if (!spec) return;
        // ⚠ キーフレームと名前を先に用意してから .canPan を付ける
        //    （animation-name: var(--pw-pan-name) なので、未設定だと none になる）
        const name = `pwPanCard${i}`;
        if (!writePanKeyframes(name, spec)) return;
        card.style.setProperty("--pw-pan-name", name);
        card.style.setProperty("--pw-pan-span", spec.span.toFixed(4));
        card.style.setProperty("--pw-pan-shift", spec.shift.toFixed(5));
        card.style.setProperty("--pw-pan-dur", `${spec.duration.toFixed(2)}s`);
        card.classList.add(styles.canPan);
      };
      if (img.complete && img.naturalWidth) {
        apply();
      } else {
        img.addEventListener("load", apply, { once: true });
        cleanups.push(() => img.removeEventListener("load", apply));
      }
    });
    return () => cleanups.forEach((fn) => fn());
  }, [works.length]);

  /* =========================================================
     可視性ゲート（画面外／背面タブでは本当に止める）
     ＋ ★ 入場「束が集まる」の発火（一度きり）
     ========================================================= */
  useEffect(() => {
    reducedRef.current = mq(REDUCE_QUERY);
    const section = sectionRef.current;
    if (!section) return;

    const io = new IntersectionObserver(
      (entries) => {
        visibleRef.current = entries[0]?.isIntersecting ?? false;
        refresh();
      },
      { rootMargin: "120px 0px" },
    );
    io.observe(section);

    const onVisibility = () => refresh();
    /* ⚠ 本番にはこれが無かった（実測0件）。タブが背面に回ったら停止する */
    document.addEventListener("visibilitychange", onVisibility);

    /* ---- 入場 ---- */
    const wraps = [
      casesWrapRef.current,
      toolsWrapRef.current,
      worksWrapRef.current,
    ].filter((el): el is HTMLDivElement => el !== null);
    const timers: number[] = [];
    let enterIo: IntersectionObserver | null = null;
    const armed = wraps.filter((w) => w.classList.contains(styles.enterPending));

    if (armed.length > 0) {
      enteringRef.current = true;
      /* ★ 2026-09-16：枠の並びが 01 FDE → 02 ツール → 03 Web制作 になり、
         Web制作の束が一番下へ移った。「works が入場し終えたら送りを解禁」の
         ままだと、画面上の 01・02 が回りはじめるのに一番下までスクロールが
         要る。**最初に着地した束**で解禁する（どの枠が先頭でも成り立つ）。 */
      let landed = false;
      enterIo = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target as HTMLDivElement;
            obs.unobserve(el);
            el.classList.remove(styles.enterPending);
            el.classList.add(styles.isEntering);
            timers.push(
              window.setTimeout(() => {
                el.classList.remove(styles.isEntering);
                if (!landed) {
                  landed = true;
                  enteringRef.current = false;
                }
                if (el === casesWrapRef.current) {
                  caseRaisedRef.current = 0;
                  setRaisedCases(0, true);
                }
                if (el === toolsWrapRef.current) {
                  toolRaisedRef.current = 0;
                  setRaisedTools(0, true);
                }
                if (el === worksWrapRef.current) {
                  raisedRef.current = 0;
                  setRaisedWorks(0, true);
                }
                refresh(); /* どの枠でも送りが要る */
              }, ENTER_MS),
            );
          });
        },
        { rootMargin: "0px 0px -10% 0px" },
      );
      armed.forEach((w) => enterIo?.observe(w));
    } else {
      /* 入場を仕掛けていない（すでに画面内／reduced-motion）＝最初から束の姿で置く */
      enteringRef.current = false;
      setRaisedWorks(0, true);
      setRaisedTools(0, true);
      setRaisedCases(0, true);
    }

    return () => {
      io.disconnect();
      enterIo?.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      stopCycle();
    };
  }, [refresh, setRaisedCases, setRaisedTools, setRaisedWorks, stopCycle]);

  /* =========================================================
     入場の仕込み（初回ペイント前）。
     ⚠ すでに画面内にあるときは仕掛けない（最終状態が一瞬見えてから
        消えて出直す、というちらつきを避ける）
     ========================================================= */
  useLayoutEffect(() => {
    if (mq(REDUCE_QUERY)) return;
    const vh = window.innerHeight || 0;
    [casesWrapRef.current, toolsWrapRef.current, worksWrapRef.current].forEach((wrap) => {
      if (!wrap) return;
      if (wrap.getBoundingClientRect().top < vh * 0.9) return;
      wrap.classList.add(styles.enterPending);
    });
  }, []);

  /* =========================================================
     幅の変化（栞・走査点の再計測／SP へ落ちたときの後始末）
     ========================================================= */
  useEffect(() => {
    const wrap = worksWrapRef.current;
    if (!wrap) return;
    const onResize = () => {
      measureTrace();
      if (openRef.current !== null) {
        layoutStage();
        return;
      }
      if (mq(SP_QUERY)) {
        stopCycle();
        hoveringRef.current = false;
        cardRefs.current.forEach((c, k) => {
          panClear(k);
          c?.classList.remove(styles.isHover);
        });
        raisedRef.current = 0;
        setRaisedWorks(0, false);
        toolRaisedRef.current = 0;
        setRaisedTools(0, false);
        caseRaisedRef.current = 0;
        setRaisedCases(0, false);
        wrap.classList.remove(styles.hasTick);
        toolsWrapRef.current?.classList.remove(styles.hasTick);
        casesWrapRef.current?.classList.remove(styles.hasTick);
        tickRowRef.current = -1;
        toolsTickRowRef.current = -1;
        casesTickRowRef.current = -1;
      } else if (!enteringRef.current) {
        setRaisedWorks(raisedRef.current, true);
        setRaisedTools(toolRaisedRef.current, true);
        setRaisedCases(caseRaisedRef.current, true);
      }
      refresh();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [
    layoutStage,
    measureTrace,
    panClear,
    refresh,
    setRaisedCases,
    setRaisedTools,
    setRaisedWorks,
    stopCycle,
  ]);

  /* =========================================================
     見出しのスクロール入場（GSAP）
     ⚠ 札とツールカードは GSAP で動かさない。インライン transform を
        書かれると、送り・押しのけ・舞いの CSS 側 transform を恒久的に
        上書きしてしまうため。入場は CSS の transition で作っている。
     ⚠ 2026-08-23：`[data-pickup-cta]`（全体CTA「実績をすべて見る →」）は
        撤去した（各セクション右下の VIEW ALL WORKS / VIEW ALL TOOLS と
        行き先が重複するため）。**死んだセレクタを残さないよう、この
        ScrollTrigger も一緒に削除している。**
     ========================================================= */
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (mq(REDUCE_QUERY)) return; /* reduced-motion：最終状態で静止 */
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-pickup-heading]",
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 1.2,
          ease: EASE,
          scrollTrigger: { trigger: section, start: "top 80%", once: true },
        },
      );
    }, section);
    return () => ctx.revert();
  }, []);

  /* ---- アンマウント時の後始末 ---- */
  useEffect(() => {
    const panTimers = panTimerRef.current;
    const pending = pendingRef.current;
    return () => {
      panTimers.forEach((t) => {
        if (t) window.clearTimeout(t);
      });
      pending.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  /* =========================================================
     カード操作
     ========================================================= */
  const handleCardClick = useCallback(
    (e: React.MouseEvent, i: number) => {
      /* 修飾キー付き（新規タブ等）は a タグ本来の挙動に委ねる */
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      openWork(i);
    },
    [openWork],
  );

  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent, i: number) => {
      /* a 要素は Space で発火しないので明示的に拾う（キーボードだけで開ける） */
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        openWork(i);
      }
    },
    [openWork],
  );

  const handleCardFocus = useCallback(
    (e: React.FocusEvent<HTMLAnchorElement>, i: number) => {
      /* ⚠ :focus-visible のときだけ。閉じたあとの focus() 復帰で
         マウス操作なのに束が固まる事故を避ける */
      let kb = true;
      try {
        kb = e.currentTarget.matches(":focus-visible");
      } catch {
        kb = true;
      }
      if (kb) hoverWorksOn(i);
    },
    [hoverWorksOn],
  );

  const handleWorksBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      hoverWorksOff();
    },
    [hoverWorksOff],
  );

  const handleToolFocus = useCallback(
    (e: React.FocusEvent<HTMLAnchorElement>, i: number) => {
      /* ⚠ :focus-visible のときだけ（マウス操作で束が固まる事故を避ける） */
      let kb = true;
      try {
        kb = e.currentTarget.matches(":focus-visible");
      } catch {
        kb = true;
      }
      if (kb) hoverToolsOn(i);
    },
    [hoverToolsOn],
  );

  const handleToolsBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      hoverToolsOff();
    },
    [hoverToolsOff],
  );

  const handleCaseFocus = useCallback(
    (e: React.FocusEvent<HTMLAnchorElement>, i: number) => {
      /* ⚠ :focus-visible のときだけ（マウス操作で束が固まる事故を避ける） */
      let kb = true;
      try {
        kb = e.currentTarget.matches(":focus-visible");
      } catch {
        kb = true;
      }
      if (kb) hoverCasesOn(i);
    },
    [hoverCasesOn],
  );

  const handleCasesBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      hoverCasesOff();
    },
    [hoverCasesOff],
  );

  const openWorkData = openIndex !== null ? works[openIndex] : null;

  return (
    <section
      ref={sectionRef}
      className={styles.section}
      data-top-section="06"
      data-top-label="WORKS"
    >
      {/* 巨大タイポ：地に+3〜5%Lで沈める（読ませない・左裁ち落とし） */}
      <div className={styles.ghostType} aria-hidden="true">
        WORKS
      </div>

      {/* 墨のスクリム。真っ黒に落とさない＝ブラックアウトしない */}
      <div className={styles.scrim} onClick={closeWork} aria-hidden="true" />

      <div className={styles.inner} ref={innerRef}>
        <div className={styles.headingWrap} data-pickup-heading>
          {/* P12（2026-09-06）＝章番号（進捗線と同じ連番）。重ね帖の動き・文言は不変 */}
          <SectionMark no="06" label="WORKS" />
          <h2 className={styles.heading}>制作実績</h2>
        </div>

        {/* ============ 01 FDE事業 ============
            ⚠ 2026-09-16 追加。02 ツール制作の枠をそのまま写している
               （deckWrap / deck / 栞 / 走査点 / hover・focus の扱いまで同じ）。
               違うのは「リンク先」と「見出し直下のリード（catLead）」だけ。
            ⚠ 0件のときは枠ごと出さない＝「準備中」プレートは作らない
               （2026-08-23 あおきさん判断の踏襲）。
            ⚠ 文言は契約ファイル（data/cases.ts の fdeIntro）から取る。ここで作らない */}
        {hasCases && (
          <div className={styles.blockCases}>
            <div className={styles.catHead} data-pickup-heading>
              <span className={styles.catIdx}>01</span>
              <h3 className={styles.catName}>FDE事業</h3>
              <span className={styles.catEn}>FDE</span>
              <span className={styles.catCount}>
                {cases.length} CASE{cases.length > 1 ? "S" : ""}
              </span>
            </div>

            {/* ★ FDE を知らない人が、トップだけ見ても何の事業か分かるようにする */}
            <div className={styles.catLead} data-pickup-heading>
              <p className={styles.catLeadTag}>{fdeIntro.tagline}</p>
              <p className={styles.catLeadText}>{fdeIntro.explain}</p>
            </div>

            <div
              className={`${styles.deckWrap} ${styles.deckWrapCases}`}
              ref={casesWrapRef}
              onMouseLeave={hoverCasesOff}
              onBlur={handleCasesBlur}
            >
              <ul className={`${styles.deck} ${styles.deckCases}`} ref={casesDeckRef}>
                {cases.map((study, i) => (
                  <li
                    key={study.slug}
                    className={styles.card}
                    style={{ "--i": i } as CSSProperties}
                    ref={(el) => {
                      caseRefs.current[i] = el;
                    }}
                    onMouseEnter={() => {
                      if (mq(FINE_QUERY)) hoverCasesOn(i);
                    }}
                    data-pickup-plate
                  >
                    <Link
                      href={`/cases#${study.slug}`}
                      className={styles.cardLink}
                      onFocus={(e) => handleCaseFocus(e, i)}
                    >
                      <div className={styles.thumb}>
                        <div className={styles.pan}>
                          <Image
                            src={study.thumbnail}
                            alt=""
                            aria-hidden="true"
                            fill
                            sizes={CARD_SIZES}
                            className={`${styles.thumbImg} ${styles.thumbMono}`}
                          />
                          <Image
                            src={study.thumbnail}
                            alt={`${study.title} の導入前後の比較`}
                            fill
                            sizes={CARD_SIZES}
                            className={`${styles.thumbImg} ${styles.thumbColor}`}
                          />
                        </div>
                        <span className={styles.inkVeil} aria-hidden="true" />
                        <span className={styles.frameLine} aria-hidden="true" />
                        {/* ★ 01・02 と揃える：手前へ出た瞬間、上端を光が一度だけ走る */}
                        <span className={styles.gleam} aria-hidden="true" />
                      </div>
                      <div className={styles.cap}>
                        <span className={styles.capIdx}>{study.no}</span>
                        <span className={styles.capText}>
                          <span className={styles.capTitle}>{study.title}</span>
                          <span className={styles.capMeta}>{study.headline}</span>
                        </span>
                      </div>
                    </Link>
                    <span className={styles.hint} aria-hidden="true" />
                  </li>
                ))}
              </ul>
              {/* 金① 栞（＋その余韻）／金② 走査点。02 と同じものを 01 にも付ける */}
              <span
                className={styles.tickGhost}
                ref={casesTickGhostRef}
                aria-hidden="true"
              />
              <span className={styles.tick} ref={casesTickRef} aria-hidden="true" />
              <span className={styles.tracer} aria-hidden="true" />
            </div>

            {/* ★ 02・03 と完全に同じ見た目・同じ位置（右下） */}
            <p className={styles.more}>
              <Link href="/cases" className={styles.moreLink}>
                VIEW ALL CASES →
              </Link>
            </p>
          </div>
        )}

        {/* ============ 02 ツール制作 ============
            ⚠ 03 SNS の「準備中」プレートは 2026-08-23 に撤去した（あおきさん指示）。
               中身が無いものを「準備中」と書いて置いておく必要はない、という判断 */}
        <div className={styles.blockTools} data-pickup-pending>
          <div className={styles.catHead} data-pickup-heading>
            <span className={styles.catIdx}>02</span>
            <h3 className={styles.catName}>ツール制作</h3>
            <span className={styles.catEn}>Tools</span>
            {hasTools && (
              <span className={styles.catCount}>
                {tools.length} TOOL{tools.length > 1 ? "S" : ""}
              </span>
            )}
          </div>

          {hasTools ? (
            <div
              className={`${styles.deckWrap} ${styles.deckWrapTools}`}
              ref={toolsWrapRef}
              onMouseLeave={hoverToolsOff}
              onBlur={handleToolsBlur}
            >
              <ul className={`${styles.deck} ${styles.deckTools}`} ref={toolsDeckRef}>
                {tools.map((tool, i) => (
                  <li
                    key={tool.slug}
                    className={styles.card}
                    style={{ "--i": i } as CSSProperties}
                    ref={(el) => {
                      toolRefs.current[i] = el;
                    }}
                    onMouseEnter={() => {
                      if (mq(FINE_QUERY)) hoverToolsOn(i);
                    }}
                    data-pickup-plate
                  >
                    <Link
                      href={`/tools/${tool.slug}`}
                      className={styles.cardLink}
                      onFocus={(e) => handleToolFocus(e, i)}
                    >
                      <div className={styles.thumb}>
                        <div className={styles.pan}>
                          <Image
                            src={tool.thumbnail}
                            alt=""
                            aria-hidden="true"
                            fill
                            sizes={CARD_SIZES}
                            className={`${styles.thumbImg} ${styles.thumbMono}`}
                          />
                          <Image
                            src={tool.thumbnail}
                            alt={`${tool.title} の画面`}
                            fill
                            sizes={CARD_SIZES}
                            className={`${styles.thumbImg} ${styles.thumbColor}`}
                          />
                        </div>
                        <span className={styles.inkVeil} aria-hidden="true" />
                        <span className={styles.frameLine} aria-hidden="true" />
                        {/* ★ 01 と揃える：手前へ出た瞬間、上端を光が一度だけ走る */}
                        <span className={styles.gleam} aria-hidden="true" />
                      </div>
                      <div className={styles.cap}>
                        <span className={styles.capIdx}>{tool.no}</span>
                        <span className={styles.capText}>
                          <span className={styles.capTitle}>{tool.title}</span>
                          <span className={styles.capMeta}>{tool.summary}</span>
                        </span>
                      </div>
                    </Link>
                    <span className={styles.hint} aria-hidden="true" />
                  </li>
                ))}
              </ul>
              {/* 金① 栞（＋その余韻）／金② 走査点。01 と同じものを 02 にも付ける */}
              <span
                className={styles.tickGhost}
                ref={toolsTickGhostRef}
                aria-hidden="true"
              />
              <span className={styles.tick} ref={toolsTickRef} aria-hidden="true" />
              <span className={styles.tracer} aria-hidden="true" />
            </div>
          ) : (
            <div className={styles.plate} data-pickup-plate>
              <div className={styles.plateVeil} aria-hidden="true" />
              <div className={styles.plateGhost} aria-hidden="true">
                TOOLS
              </div>
              <div className={styles.plateBody}>
                <span className={styles.chip}>準備中</span>
                <p className={styles.plateNote}>
                  日々の作業を静かに引き受ける小さな道具を、見せられるかたちに整えています。
                </p>
              </div>
            </div>
          )}

          {hasTools && (
            /* ★ 01 と完全に同じ見た目・同じ位置（右下）。
               2026-08-23 以前は左寄せ・日本語の「ツールをすべて見る →」だった */
            <p className={styles.more}>
              <Link href="/tools" className={styles.moreLink}>
                VIEW ALL TOOLS →
              </Link>
            </p>
          )}
        </div>

        {/* リード（件数は配列から自動集計＝ハードコード禁止） */}
        <div className={styles.pickupTitle} data-pickup-heading>
          <span className={styles.pickupJp}>
            {charSpans(`/works より、${works.length}件。`)}
          </span>
        </div>

        {/* ============ 03 Web制作 ============
            ⚠ 2026-09-16：並びを 01 FDE事業 → 02 ツール制作 → 03 Web制作 に
               組み替えた（一つ上のセクション「業務を、仕組みに変える」との整合＝
               あおきさん指示）。番号と位置だけの変更で、動き・文言は不変。
            ⚠ 直上のリード「/works より、N件。」は works の件数を指しているので、
               この枠と一緒に動かしてある（見出し直下からここへ移設）。 */}
        <div className={styles.blockWeb}>
          <div className={styles.catHead} data-pickup-heading>
            <span className={styles.catIdx}>03</span>
            <h3 className={styles.catName}>Web制作</h3>
            <span className={styles.catEn}>Web</span>
            <span className={styles.catCount}>{works.length} SITES</span>
          </div>

          <div
            className={`${styles.deckWrap} ${styles.deckWrapWorks}`}
            ref={worksWrapRef}
            onMouseLeave={hoverWorksOff}
            onBlur={handleWorksBlur}
          >
            <ul className={styles.deck} ref={worksDeckRef}>
              {works.map((work, i) => (
                <li
                  key={work.slug}
                  className={styles.card}
                  style={{ "--i": i } as CSSProperties}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  onMouseEnter={() => {
                    if (mq(FINE_QUERY)) hoverWorksOn(i);
                  }}
                  data-pickup-card
                >
                  {/* a タグのまま（SEO・新規タブ・キーボード操作を保持）、
                      通常クリックのみ preventDefault して展開フォーカスへ */}
                  <Link
                    href={`/works/${work.slug}`}
                    className={styles.cardLink}
                    aria-haspopup="dialog"
                    onClick={(e) => handleCardClick(e, i)}
                    onKeyDown={(e) => handleCardKeyDown(e, i)}
                    onFocus={(e) => handleCardFocus(e, i)}
                  >
                    <div
                      className={styles.thumb}
                      ref={(el) => {
                        thumbRefs.current[i] = el;
                      }}
                    >
                      <div
                        className={styles.pan}
                        ref={(el) => {
                          panRefs.current[i] = el;
                        }}
                      >
                        {/* 墨明け＝静的 grayscale の下地＋カラーの opacity
                            クロスフェード（filter はアニメしない＝iOS 安全） */}
                        <Image
                          src={work.images[0]}
                          alt=""
                          aria-hidden="true"
                          fill
                          sizes={CARD_SIZES}
                          className={`${styles.thumbImg} ${styles.thumbMono}`}
                        />
                        <Image
                          src={work.images[0]}
                          alt={work.title}
                          fill
                          sizes={CARD_SIZES}
                          className={`${styles.thumbImg} ${styles.thumbColor}`}
                        />
                      </div>
                      <span className={styles.inkVeil} aria-hidden="true" />
                      <span className={styles.frameLine} aria-hidden="true" />
                      {/* ★ 手前へ出た瞬間、上端を光が一度だけ走る */}
                      <span className={styles.gleam} aria-hidden="true" />
                    </div>

                    <div className={styles.cap}>
                      <span className={styles.capIdx}>{workIdx(i)}</span>
                      <span className={styles.capText}>
                        <span className={styles.capTitle}>{work.title}</span>
                      </span>
                    </div>
                  </Link>
                  {/* 金③ 予告罫 */}
                  <span className={styles.hint} aria-hidden="true" />
                </li>
              ))}
            </ul>
            {/* 金① 栞（＋その余韻） */}
            <span className={styles.tickGhost} ref={tickGhostRef} aria-hidden="true" />
            <span className={styles.tick} ref={tickRef} aria-hidden="true" />
            {/* 金② 走査点 */}
            <span className={styles.tracer} aria-hidden="true" />
          </div>

          {/* ★ セクション右下の導線（02 と完全に同じ見た目・同じ位置） */}
          <p className={styles.more}>
            <Link href="/works" className={styles.moreLink}>
              VIEW ALL SITES →
            </Link>
          </p>
        </div>

        {/* ⚠ 2026-08-23：ここにあったセクション末尾の全体CTA
            （`<div className={styles.cta} data-pickup-cta>` ＋
             `/works` へ飛ぶ枠付きボタン「実績をすべて見る →」）は撤去した。
            理由＝行き先が 01 の VIEW ALL WORKS → と同じで、右寄せの導線が
            3つ縦に並んでしまうため。GSAP の ScrollTrigger も一緒に外してある。 */}

        {/* ============ 中央の台（FLIP で育つ） ============
            ⚠ 台の器そのものは常に DOM に置く（FLIP の last を測る先）。
               中身は開いているあいだだけ描画する（縦長の画像ボックスを
               閉じているあいだ抱えないため／閉じているとき焦点を持たないため） */}
        <div
          ref={stageRef}
          className={styles.stage}
          role={openWorkData ? "dialog" : undefined}
          aria-modal={openWorkData ? true : undefined}
          aria-labelledby={openWorkData ? "pickup-stage-title" : undefined}
          aria-hidden={openWorkData ? undefined : true}
          data-lenis-prevent
        >
          <div className={styles.stageInner} ref={stageInnerRef}>
            {openWorkData !== null && openIndex !== null && (
              <>
                <div className={styles.stageTop}>
                  <button
                    ref={closeBtnRef}
                    type="button"
                    className={styles.closeBtn}
                    onClick={closeWork}
                  >
                    ✕ 閉じる
                  </button>
                </div>
                {/* 金⑤ 展開の金罫 */}
                <span className={styles.stageRail} aria-hidden="true" />
                {/* ⚠ 横に広く縦の低い窓（ノートPCの既定がこれ）では、16:10 の板と
                    文字を縦に積むと「詳しく見る →」まで届かない。その帯だけ
                    板と文字を横に並べる（.stageBody が flex になる）。
                    ⚠ grid にしない：WebKit の stretch × aspect-ratio × absolute子
                      で枠が 0×0 に潰れる罠を踏まないため */}
                <div className={styles.stageBody}>
                <div className={styles.stageThumb} ref={stageThumbRef}>
                  <div className={styles.stagePan} ref={stagePanRef}>
                    {/* 下敷き＝札と同じ sizes ＝すでに読み終えたものが即座に出る */}
                    <Image
                      src={openWorkData.images[0]}
                      alt=""
                      aria-hidden="true"
                      fill
                      sizes={CARD_SIZES}
                      className={styles.stageImg}
                    />
                    <Image
                      src={openWorkData.images[0]}
                      alt={`${openWorkData.title} のサムネイル（拡大）`}
                      fill
                      priority
                      sizes={STAGE_SIZES}
                      className={styles.stageImg}
                    />
                  </div>
                </div>
                <div className={styles.stagePanel}>
                  <p className={styles.stageRule}>
                    <span>{workIdx(openIndex)}</span>
                    {openWorkData.year && (
                      <span className={styles.stageYear}>{openWorkData.year}</span>
                    )}
                  </p>
                  <h3 className={styles.stageTitle} id="pickup-stage-title">
                    {openWorkData.title}
                  </h3>
                  <p className={styles.stageMeta}>
                    {[
                      openWorkData.genre,
                      openWorkData.siteType,
                      openWorkData.pageCount ? `${openWorkData.pageCount}ページ` : null,
                    ]
                      .filter(Boolean)
                      .join(" ・ ")}
                  </p>
                  <p className={styles.stageDesc}>{openWorkData.description}</p>
                  <p className={styles.stagePath}>{`/works/${openWorkData.slug}`}</p>
                  <Link
                    ref={detailLinkRef}
                    href={`/works/${openWorkData.slug}`}
                    className={styles.stageLink}
                  >
                    詳しく見る →
                  </Link>
                </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
