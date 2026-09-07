"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
 * 2026-09-05 無地の白い紙 → 実際の掲載サイトのフルスクショの束。
 * 2026-09-07 ホバーの広がりを「横一列の弧」→「不規則な散らばり」へ（あおきさん指示）。
 *
 * ◆ 平常時
 *   フルスクショの札が、それぞれ違う角度・位置で重なって落ち着いている。
 *   手前の一枚だけは白い紙（題箋）で、そこに「WEB制作」が活版で押し込まれる。
 *   入場は従来どおり画面の端から差し込まれる（リズムを変えない）。
 *
 * ◆ ホバー（マウス端末・広い画面だけ）
 *   題箋が少し持ち上がり、束が題箋のまわりへ**ばらばらに散る**。
 *   ・行き先は「その場で実測した FV と題箋の矩形」から毎回組み立てる（後述）
 *   ・移動は 1.05秒・札ごとに 55ms ずつ遅れる＝順に飛び出すのが見える
 *   ・横（.card）と縦（.stem）で別々のイージングを掛けてあるので、直線ではなく
 *     弧を描いて飛ぶ。位置・回転・大きさを同時に補間する
 *   ・縦流しは札ごとに 0.35 + i×0.075 秒ずらして走り出す（同時に流れ出さない）
 *   外すと 0.9秒・逆順の遅れで束へ戻り、画も順に先頭へ戻る。
 *
 * ◆ 題字の可読性
 *   題字は最初から最後まで「不透明な白い紙の上」にしか乗らない。散った札は
 *   題箋より必ず奥（.pile → .front の順）なので、画像が題字の背面に来ることが
 *   構造的に起こらない。＝コントラストは常に紙（#fff）と墨のまま。
 *
 * ◆ 互換
 *   動かすのは transform(2D)・opacity・box-shadow・object-position のみ。
 *   filter/backdrop-filter のアニメ・blend・3D・clip-path は使わない。
 *   タッチ端末・狭幅・reduced-motion（prefersLightVisuals）では
 *     ・札を FV_SHEET_LIGHT 枚に減らす（＝読み込む画像も減る）
 *     ・散らばりも縦流しも起動しない（静止1コマで「サイトが重なっている」と読める）
 *
 * ◆ 舞台（SubPageFVAnim）との同期
 *   ・入場はこの部品が持つ（customEntrance）。
 *   ・収縮（1.0s→1.5s）では .pile に data-fv-depth があるので舞台側が奥へ沈める。
 *     題箋には付けない＝手前に残る。散らばりの計算はこの沈み（実測した行列）も込みで行う。
 *   ・settled になったら隅の索引ラベルを出す（useFVPhase）。
 */

/**
 * 平常時（束）の札の居場所。単位は「札自身の大きさに対する％」＝幅が変わっても崩れない。
 * 並び順がそのまま重なり順（後ろの要素ほど手前）。中央寄りの札を後ろに置く。
 * ⚠ 散らばり（ホバー）側はここに持たない。％で持つと、px で決まる題箋の裏に
 *   札がまるごと隠れる帯が出る（2026-09-07 実測：1024〜1279px で発生）。
 *   行き先は layoutScatter() が実測から作る。
 */
const SLOTS: ReadonlyArray<{ x: number; y: number; r: number }> = [
  { x: -128, y: 8, r: -4.8 },
  { x: 124, y: 12, r: 4.0 },
  { x: -96, y: -43, r: -6.4 },
  { x: 92, y: -35, r: 5.8 },
  { x: -62, y: 48, r: -3.2 },
  { x: 66, y: 45, r: 4.4 },
  { x: -18, y: -58, r: -1.8 },
  { x: 24, y: 55, r: 2.6 },
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

/** 散らばり／戻りの時間設計。CSS 側の transition-duration と必ず一致させること */
const SPREAD_STEP_MS = 55; /* 札ごとの遅れ（散らばり） */
const RETURN_STEP_MS = 50; /* 札ごとの遅れ（戻り・逆順） */

/**
 * 縦流しの開始をずらす（2026-09-07 あおきさん指示）。
 * 札 i は「散らばりでほぼ着地したころ」から流れ出す。
 * 戻りは逆順に、少しずつ止めて先頭へ返す。
 */
const PAN_START_BASE_MS = 350;
const PAN_START_STEP_MS = 75;
const PAN_STOP_STEP_MS = 55;

/**
 * ホバー中の題箋の姿。CSS（.spread .front）へ変数で渡す＝
 * 散らばりの計算（題箋の矩形）とズレないように、数値はここ1か所だけに置く。
 */
const PLATE_LIFT = -0.26; /* 自身の高さに対する持ち上げ量 */
const PLATE_SCALE = 0.94;

/** 散らばりの決めかた */
const SCATTER = {
  /** 散ったときの札の大きさ（乱数の範囲）。大小がつくと「散らばり」に見える */
  scaleMin: 0.5,
  scaleMax: 0.72,
  /** 傾きの振れ幅（±deg）。2D の rotate のみ */
  rot: 17,
  /** FV の内側に残す余白 px（イージングのわずかな行き過ぎぶんも含む） */
  margin: 34,
  /** 題箋からはみ出していてほしい面積の割合 */
  minVisible: 0.5,
  /** これを下回ったら「横へ逃がす」救済に切り替える */
  rescueVisible: 0.3,
  /** 1枚あたりの候補数 */
  tries: 16,
  /** 角度のばらつき（担当セクターからの振れ幅・deg） */
  angleJitter: 54,
  /** 半径の取りかた（rMin＝題箋から出きる距離／rMax＝画面に収まる限界）。
      題箋の近くに寄せるほど束としてまとまり、隅へ飛ばすほど散漫になる */
  radiusBase: 0.12,
  radiusSpan: 0.62,
} as const;

/* ---------------------------------------------------------------
   固定の種から作る乱数（リロードしても同じ散らばりになる）
   ★ 毎回変えない理由：FV は「ページの顔」で、同じ人が何度も見る場所。
     開くたびに配置が変わると、覚えた画が崩れて落ち着かない。
     また不具合の再現（この幅でこの札が隠れる、等）が取れなくなる。
   --------------------------------------------------------------- */
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rect {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}

/** 2つの矩形の重なり面積 */
function overlapArea(a: Rect, b: Rect): number {
  const ox = Math.max(
    0,
    Math.min(a.cx + a.hw, b.cx + b.hw) - Math.max(a.cx - a.hw, b.cx - b.hw)
  );
  const oy = Math.max(
    0,
    Math.min(a.cy + a.hh, b.cy + b.hh) - Math.max(a.cy - a.hh, b.cy - b.hh)
  );
  return ox * oy;
}

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
  const pileRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const readyRef = useRef(false);
  const spreadRef = useRef(false);
  const panTimersRef = useRef<number[]>([]);
  const phase = useFVPhase(rootRef);

  /**
   * ★ 「動いて散らばる／動いて戻る」は、この2つが className に載っていないと
   *   一切効かない。**classList で足してはいけない**（2026-09-07 実測）。
   *   FV の位相（useFVPhase）が settled になると React が className を
   *   書き直すので、命令的に足したクラスはそこで消える。実際、消えた結果
   *   transition が none のままになり「パッと入れ替わる」ように見えていた。
   */
  const [live, setLive] = useState(false);
  const [spread, setSpread] = useState(false);

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

  /** 種は作品のパスから作る＝作品が変わらない限り、いつ開いても同じ散らばり */
  const seed = useMemo(() => hashSeed(sheets.join("|")), [sheets]);

  /* 札ごとの縦流し。gsap の共通ticker で1本の rAF にまとまる */
  const scrollers = useMemo(
    () => Array.from({ length: picks.length }, () => createHoverScroll(1)),
    [picks.length]
  );
  useEffect(() => () => scrollers.forEach((s) => s.kill()), [scrollers]);

  const clearPanTimers = useCallback(() => {
    panTimersRef.current.forEach((id) => window.clearTimeout(id));
    panTimersRef.current = [];
  }, []);

  useEffect(() => clearPanTimers, [clearPanTimers]);

  /* =========================================================
     散らばりの行き先を、その場の実測から組み立てる

     ⚠ 「札の大きさに対する％」で持ってはいけない。隠す相手（題箋）は px で
        決まるので、札が小さくなる幅の帯では札が題箋の裏へまるごと入る
        （2026-09-07 実測で 1024〜1279px 帯にその穴があった）。
        ここでは FV・題箋・札の実寸を測り、
          ・画面（FV）からはみ出さない
          ・題箋から SCATTER.minVisible 以上はみ出している
          ・すでに置いた札からなるべく離れている
        を満たす点を、固定の種の乱数で選ぶ。
     ⚠ .pile には収縮の奥行き（scale と translateY）が載っているので、
        判定は「画面に写ったあとの姿」で行い、書き戻す値は pile ローカルに直す。
     ========================================================= */
  const layoutScatter = useCallback(() => {
    const root = rootRef.current;
    const pile = pileRef.current;
    const front = frontRef.current;
    if (!root || !pile || !front) return;
    const cards = cardRefs.current.filter(
      (el): el is HTMLDivElement => el !== null
    );
    if (cards.length === 0) return;

    const W = root.clientWidth;
    const H = root.clientHeight;
    const cw = cards[0].offsetWidth;
    const ch = cards[0].offsetHeight;
    if (!W || !H || !cw || !ch) return;

    // 束の層に載っている奥行き変換を実測で拾う（定数の二重管理をしない）
    let k = 1;
    let dy = 0;
    try {
      const m = new DOMMatrixReadOnly(getComputedStyle(pile).transform);
      if (m.a) k = m.a;
      dy = m.f;
    } catch {
      k = 1;
      dy = 0;
    }

    // ホバー中の題箋の矩形（stage の中心を原点にした画面座標）
    const fw = front.offsetWidth;
    const fh = front.offsetHeight;
    const plate: Rect = {
      cx: 0,
      cy: PLATE_LIFT * fh,
      hw: (fw * PLATE_SCALE) / 2,
      hh: (fh * PLATE_SCALE) / 2,
    };

    const rnd = mulberry32(seed);
    const spin = rnd() * 360; /* 束全体の向き。種で決まる */
    const placed: Rect[] = [];
    const n = cards.length;

    interface Spot {
      px: number;
      py: number;
      rot: number;
      scale: number;
      vis: number;
      score: number;
    }

    /**
     * 「この向き・この大きさ・この傾きで置けるか」を1件試す。
     * 置けないときは null。mix は半径の取りかた（0＝題箋のすぐ外／1＝画面の端）。
     */
    const probe = (
      aDeg: number,
      s: number,
      rot: number,
      mix: number
    ): Spot | null => {
      const a = (aDeg * Math.PI) / 180;
      // 回転した札の外接半幅／半高（画面上の大きさ＝k を掛けた値）
      const rad = (rot * Math.PI) / 180;
      const cr = Math.abs(Math.cos(rad));
      const sr = Math.abs(Math.sin(rad));
      const shw = (((cw * s) / 2) * cr + ((ch * s) / 2) * sr) * k;
      const shh = (((cw * s) / 2) * sr + ((ch * s) / 2) * cr) * k;
      const ca = Math.cos(a);
      const sa = Math.sin(a);

      // FV に収まる半径の上限（pile ローカル）
      const limX = (W / 2 - SCATTER.margin - shw) / k;
      const limYUp = (H / 2 - SCATTER.margin - shh + dy) / k; /* 上方向 */
      const limYDown = (H / 2 - SCATTER.margin - shh - dy) / k; /* 下方向 */
      if (limX <= 0 || limYUp <= 0 || limYDown <= 0) return null;
      let rMax = Number.POSITIVE_INFINITY;
      if (Math.abs(ca) > 1e-4) rMax = Math.min(rMax, limX / Math.abs(ca));
      if (Math.abs(sa) > 1e-4) {
        rMax = Math.min(rMax, (sa > 0 ? limYDown : limYUp) / Math.abs(sa));
      }
      if (!Number.isFinite(rMax) || rMax <= 0) return null;

      const visAt = (r: number) => {
        const box: Rect = { cx: r * ca * k, cy: r * sa * k + dy, hw: shw, hh: shh };
        return 1 - overlapArea(box, plate) / (4 * shw * shh);
      };

      // 題箋から十分はみ出す最小半径（単調ではないので素直に走査する）
      let rMin = rMax;
      const STEPS = 26;
      for (let q = 1; q <= STEPS; q += 1) {
        const r = (rMax * q) / STEPS;
        if (visAt(r) >= SCATTER.minVisible) {
          rMin = r;
          break;
        }
      }

      const r = rMin + mix * Math.max(0, rMax - rMin);
      const px = r * ca;
      const py = r * sa;
      const vis = visAt(r);

      // すでに置いた札からの距離（近すぎる＝隠れて見えない）
      let near = Number.POSITIVE_INFINITY;
      placed.forEach((p) => {
        near = Math.min(near, Math.hypot(px * k - p.cx, py * k + dy - p.cy));
      });
      const spacing = Number.isFinite(near)
        ? Math.min(near / (cw * 0.85), 1)
        : 1;

      return { px, py, rot, scale: s, vis, score: vis * 2 + spacing * 1.6 };
    };

    cards.forEach((card, i) => {
      const base = spin + (i * 360) / n;
      let best: Spot | null = null;

      for (let t = 0; t < SCATTER.tries; t += 1) {
        const aDeg = base + (rnd() - 0.5) * SCATTER.angleJitter;
        const s = SCATTER.scaleMin + rnd() * (SCATTER.scaleMax - SCATTER.scaleMin);
        const rot = (rnd() - 0.5) * 2 * SCATTER.rot;
        const mix = SCATTER.radiusBase + SCATTER.radiusSpan * rnd();
        const spot = probe(aDeg, s, rot, mix);
        if (spot && (!best || spot.score > best.score)) best = spot;
      }

      // ★ 担当セクターが悪くて題箋から出きらないときは、いちど全周を舐めて
      //   いちばん見える向きを取り直す（乱数を使わない＝種の再現性を壊さない）。
      //   ⚠ この保険が無いと、幅の帯によっては札が題箋の裏に埋もれる。
      if (!best || best.vis < SCATTER.minVisible) {
        for (let q = 0; q < 24; q += 1) {
          const spot = probe((q * 360) / 24, SCATTER.scaleMin, 0, 0.45);
          if (spot && (!best || spot.score > best.score + 0.05)) best = spot;
        }
      }

      if (!best) {
        // 万一どの候補も成立しない極端に狭い舞台＝そのまま束の位置に留める
        card.style.removeProperty("--hx");
        card.style.removeProperty("--hy");
        card.style.removeProperty("--hr");
        card.style.removeProperty("--hs");
        return;
      }

      // 最後の救済：それでも題箋にほぼ隠れるなら、左右の空いている方へ逃がす
      if (best.vis < SCATTER.rescueVisible) {
        const s = SCATTER.scaleMin;
        const shw = ((cw * s) / 2) * k;
        const side = best.px >= 0 ? 1 : -1;
        const x = (side * (W / 2 - SCATTER.margin - shw)) / k;
        best = { px: x, py: best.py * 0.4, rot: best.rot, scale: s, vis: 1, score: 0 };
      }

      const rad = (best.rot * Math.PI) / 180;
      const cr = Math.abs(Math.cos(rad));
      const sr = Math.abs(Math.sin(rad));
      placed.push({
        cx: best.px * k,
        cy: best.py * k + dy,
        hw: (((cw * best.scale) / 2) * cr + ((ch * best.scale) / 2) * sr) * k,
        hh: (((cw * best.scale) / 2) * sr + ((ch * best.scale) / 2) * cr) * k,
      });

      card.style.setProperty("--hx", `${best.px.toFixed(1)}px`);
      card.style.setProperty("--hy", `${best.py.toFixed(1)}px`);
      card.style.setProperty("--hr", `${best.rot.toFixed(2)}deg`);
      card.style.setProperty("--hs", best.scale.toFixed(3));
    });
  }, [seed]);

  /* ---------------- 広がる／畳む ---------------- */
  const spreadOff = useCallback(() => {
    if (!spreadRef.current) return;
    spreadRef.current = false;
    setSpread(false);
    clearPanTimers();
    // 縦流しも順に止めて先頭へ返す（散らばりの戻りと同じ向き＝外側から）
    scrollers.forEach((s, i) => {
      const wait = (scrollers.length - 1 - i) * PAN_STOP_STEP_MS;
      if (wait <= 0) {
        s.stop();
        return;
      }
      panTimersRef.current.push(window.setTimeout(() => s.stop(), wait));
    });
  }, [clearPanTimers, scrollers]);

  const spreadOn = useCallback(() => {
    if (mode !== "full" || !readyRef.current || spreadRef.current) return;
    // ⚠ 行き先（--hx…）を先に入れてから .spread を付ける。順番を逆にすると
    //   1フレームぶん古い行き先へ向かってから飛び直す
    layoutScatter();
    spreadRef.current = true;
    setSpread(true);
    clearPanTimers();
    // 縦流しは札ごとに少しずつ遅らせて走り出す（同時に流れ出さない）
    cardRefs.current.forEach((el, i) => {
      const img = el?.querySelector("img");
      const scroller = scrollers[i];
      if (!img || !scroller) return;
      panTimersRef.current.push(
        window.setTimeout(
          () => scroller.start(img),
          PAN_START_BASE_MS + i * PAN_START_STEP_MS
        )
      );
    });
  }, [clearPanTimers, layoutScatter, mode, scrollers]);

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

  /* 幅・高さが変わったら散らばりを測り直す（広がっている最中でも追随する） */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || mode !== "full") return;
    const ro = new ResizeObserver(() => {
      if (spreadRef.current) layoutScatter();
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [layoutScatter, mode]);

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
      //    インラインの transform がホバーの散らばりを恒久的に上書きしてしまう。
      // ⚠ 動かすのは外側（.card）だけ。中の .stem が持つ縦位置・傾きは
      //    そのまま連れて行かれる（＝入場の見た目は従来と同じ）。
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

    // 入場が終わってから、散らばり／戻りの transition を有効にする。
    // ⚠ 入場中に transition を持たせると、GSAP が毎フレーム書く transform を
    //    追いかけて動きが濁る（＝ .live は必ず入場の後で付ける）
    const arm = window.setTimeout(() => {
      readyRef.current = true;
      setLive(true);
    }, ENTER_MS);

    return () => {
      window.clearTimeout(arm);
      readyRef.current = false;
      spreadRef.current = false;
      ctx.revert();
    };
    // mode が決まった時点で札の枚数も確定する（idle=0 / light=4 / full=8）。
    // sheets はページ内で変化しないので、依存は mode 一本でよい。
  }, [mode]);

  return (
    <div
      ref={rootRef}
      className={[
        styles.stage,
        phase === "settled" ? styles.settled : "",
        mode === "light" ? styles.still : "",
        live ? styles.live : "",
        spread ? styles.spread : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseEnter={spreadOn}
      onMouseLeave={spreadOff}
    >
      {/* 掲載サイトの束＝収縮で奥へ沈む層。題箋より必ず奥に居る */}
      <div className={styles.pile} ref={pileRef} data-fv-depth="1" aria-hidden="true">
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
                "--hd": `${i * SPREAD_STEP_MS}ms`,
                "--rd": `${(picks.length - 1 - i) * RETURN_STEP_MS}ms`,
              } as CSSProperties
            }
          >
            {/* 縦（＋傾き・大きさ）だけを持つ内側。横は外側が持つ＝
                別々のイージングが掛かるので、飛ぶ道筋が弧になる */}
            <span className={styles.stem}>
              <Image
                src={p.src}
                alt=""
                fill
                sizes={SHEET_SIZES}
                className={styles.shot}
                loading="lazy"
              />
            </span>
          </div>
        ))}
      </div>

      {/* 手前の一枚＝題箋。題字が押し込まれる。沈まない・透けない */}
      <div
        className={styles.front}
        ref={frontRef}
        data-wk-front
        style={
          {
            "--plift": `${(PLATE_LIFT * 100).toFixed(0)}%`,
            "--pscale": `${PLATE_SCALE}`,
          } as CSSProperties
        }
      >
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
