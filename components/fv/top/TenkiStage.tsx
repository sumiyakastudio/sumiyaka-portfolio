"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { prefersLightVisuals } from "@/lib/device";
import { createFluidSim, type FluidSimAPI } from "@/lib/webgl/fluidSim";
import { createLantern } from "./lantern";
import {
  buildGlyphSheet,
  probeGlyphLayout,
  waitForGlyphFonts,
  type GlyphSheet,
} from "./glyphSheet";
import {
  attachChips,
  buildFragments,
  countForRow,
  drawFragments,
  regionFromSheet,
  rowFromSheet,
  type Frag,
  type FragRow,
} from "./fragments";
import { getOpState } from "./opClock";
import { createOpening, OP_FULL, OP_LIGHT, type OpeningArt } from "./opening";
import {
  drawBrushMarks,
  drawWrittenGlyphs,
  lineFront,
  planWrite,
  type WritePlan,
} from "./brush";
import { drawPaperGrain, drawTenkiStill } from "./tenkiStill";
import { TENKI_T } from "./tenkiTiming";
import styles from "./TenkiStage.module.css";

/**
 * 転記（てんき）— トップ FV の背景ステージ
 *
 * 軸コピー「バラバラな事務作業を、／ひとりでに回る／仕組みに変えます。」を、
 * 抽象な粒ではなく "実務のデータの断片" そのもので演じる。
 *
 *   0.00  散らばり  CSV の行・Excel の升目・PDF の紙片が角度も大きさもばらばらに漂う
 *   0.36  整列      誰も触らないのに回転が戻り、水平に揃い、中の行が左右へ伸びて
 *                   隣の断片と端で繋がる（＝繋がっていないファイルが繋がる）
 *   0.80  一本化    帯が 1 本の細い白線に潰れる
 *   0.97  筆        その線が左端から題字へ流れ込み、字画を書き上げる。書かれた側から
 *                   DOM の文字がクロスフェードして現れ、版下は同じだけ薄れて消える
 *   1.51  定着      墨の一滴が落ちて背景に滲み（流体の起動）、灯が一点ともる
 *   以後            墨の流体が背景でゆっくり漂い、灯が明滅する
 *
 * ★初速：t=0 はマウント直後の最初の rAF。散らばり〜一本化は題字の版下を要さないので、
 *   書体の読込も版下の焼き付けも待たずに始める（帯の位置は DOM の矩形の速報値で置き、
 *   版下が焼けたら実測値へ滑らかに寄せ直す）。版下が writeStart に間に合わなければ、
 *   その時刻で時計を止めて「一本化した線」を呼吸させながら待つ（TENKI_T.holdMax が上限。
 *   超えたら筆を省いて題字を出し、定着へ進む＝読めないまま止まらない）。
 *
 * 経路の分岐
 *  - PC（pointer:fine）           → 断片・筆（canvas 2D）＋ 墨の流体（WebGL）＋ 灯
 *  - WebGL 不成立 / 生成失敗       → 同じ canvas 2D の演出をそのまま。流体だけ出ない
 *  - タッチ・狭幅・reduced-motion  → 静止 1 コマ（rAF なし）。DOM の題字は Hero 側が出す
 *  検証用 ?tenki=still|nofluid（旧 ?bokujin=still も受ける）
 *
 * ★題字の筆画の上には何も残さない：版下は「筆が通った letterFade 秒後に完全に透明」
 *   になる横方向のアルファ勾配で描かれ、筆先も掃引の終わりに消える。流体と灯は
 *   保護帯（本文カラム＋余白）の外にだけ置く。
 *
 * 可視性ゲート：IntersectionObserver ＋ visibilitychange で画面外・背面タブは
 * rAF も流体も止める。時計は dt の上限 33ms で進むので戻っても演出は飛ばない。
 * iOS/WebKit 配慮：filter / mix-blend / 3D / 複雑な clip-path は不使用。
 */

export type TenkiMode = "full" | "nofluid" | "still";

interface TenkiDebug {
  mode: TenkiMode;
  fluid: boolean;
  fps: number;
  t: number;
  letters: number;
  /** 版下待ちで足踏みしている時間（秒）。0 なら待っていない */
  hold?: number;
  /** 注いだ墨の総量（調整用の実測値） */
  dye?: number;
  /** 墨の一滴の着地点（ステージ css 座標） */
  drop?: [number, number];
}

declare global {
  interface Window {
    __tenki?: TenkiDebug;
    /** QC 用：数値を入れるとその時刻に止まる（未設定なら通常再生） */
    __tenkiScrub?: number | null;
  }
}

interface TenkiStageProps {
  /** OP（第1幕）から渡された＝ここからステージ時計を回す */
  active: boolean;
  light: boolean;
  exitRef: MutableRefObject<number>;
  onLetter: (i: number) => void;
  onSettled: () => void;
}

/** 墨の色（暖色白 --ink #f1eaec） */
const INK255: [number, number, number] = [241, 234, 236];
/** 流体の地色＝--paper #1f1c1c の平均輝度（29/255）。地色との継ぎ目を消す */
const FLUID_BG = 29 / 255;
const TAU = Math.PI * 2;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth01 = (v: number, a: number, b: number) => {
  const u = clamp01((v - a) / (b - a || 1e-6));
  return u * u * (3 - 2 * u);
};
const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function TenkiStage({
  active,
  light,
  exitRef,
  onLetter,
  onSettled,
}: TenkiStageProps) {
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const hostRef = useRef<HTMLDivElement>(null);
  const fluidRef = useRef<HTMLCanvasElement>(null);
  const grainRef = useRef<HTMLCanvasElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const fluidCanvas = fluidRef.current;
    const grainCanvas = grainRef.current;
    const mainCanvas = mainRef.current;
    const glowCanvas = glowRef.current;
    if (!host || !fluidCanvas || !grainCanvas || !mainCanvas || !glowCanvas) return;
    /* 巻き上げられる関数宣言（sizeMain など）の中では絞り込みが効かないので、
       型を確定させた別名を持つ（2026-09-07 統合QC・tsc TS18047 の修正） */
    const hostEl: HTMLElement = host;
    const mainEl: HTMLCanvasElement = mainCanvas;
    const fluidEl: HTMLCanvasElement = fluidCanvas;
    const stage: HTMLElement = host;

    const params = new URLSearchParams(window.location.search);
    const flag = params.get("tenki") || params.get("bokujin") || "";
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lightNow = light || prefersLightVisuals() || flag === "still";
    const sticky =
      (host.closest("[data-hero-sticky]") as HTMLElement | null) ?? host.parentElement ?? host;
    const getLetters = () => Array.from(sticky.querySelectorAll<HTMLElement>("[data-hero-letter]"));
    const getContent = () => sticky.querySelector("[data-hero-content]");
    const dpr = window.devicePixelRatio || 1;
    const DPR = Math.max(1, Math.min(dpr, 2));

    let disposed = false;
    const cleanups: (() => void)[] = [];
    const lights = new Float32Array(9);
    let sheet: GlyphSheet | null = null;
    let cw = host.clientWidth;
    let ch = host.clientHeight;

    /** 断片のラベル（CSV / XLSX / PDF）の書体＝隅の英字と同じ mono */
    const monoFamily = (() => {
      const el = sticky.querySelector<HTMLElement>("[data-hero-corner] span");
      const f = el ? getComputedStyle(el).fontFamily : "";
      return f || "ui-monospace, SFMono-Regular, Menlo, monospace";
    })();

    /** 題字と同じ書体（灯敷の版下にも使う） */
    const displayFamily = () => {
      const el = getLetters()[0];
      const f = el ? getComputedStyle(el).fontFamily : "";
      return f || "serif";
    };

    const sizeGrain = () => drawPaperGrain(grainCanvas, host.clientWidth, host.clientHeight);
    sizeGrain();

    const lantern = createLantern(glowCanvas, { full: !lightNow && !reduced, dpr });

    /** 灯からの明るさ（ステージ css 座標 → u 空間） */
    const lit = (x: number, y: number) => {
      const h = ch || 1;
      let s = 0;
      for (let k = 0; k < 9; k += 3) {
        const dx = x / h - lights[k];
        const dy = y / h - lights[k + 1];
        s += lights[k + 2] * Math.exp(-(dx * dx + dy * dy) * 2.4);
      }
      return 0.62 + 0.38 * Math.min(1, s);
    };

    /* ============ 軽量経路：短縮版の第1幕 → 変形 → 静止 1 コマ ============ */
    if (lightNow) {
      fluidCanvas.style.display = "none";
      const opLight = createOpening(OP_LIGHT, true);
      const mctx = mainCanvas.getContext("2d");
      const D = Math.max(1, Math.min(dpr, 2));
      let ready = false;
      let raf = 0;

      const stillOpts = () => ({
        cssW: cw,
        cssH: ch,
        dpr,
        lights,
        ink: INK255,
        labelFont: `500 ${cl((sheet?.fontPx ?? 24) * 0.17, 8, 11).toFixed(1)}px ${monoFamily}`,
      });

      /** 灯は lantern の主灯だけ（OP の点灯時刻から立ち上げ、変形の終わりで全体へ） */
      const paintLantern = (ot: number) => {
        const rise = clamp01((ot - OP_LIGHT.igniteAt) / 0.4);
        lantern?.setPhase(1 - Math.pow(1 - rise, 3), smooth01(ot, OP_LIGHT.unravelAt, OP_LIGHT.unravelAt + OP_LIGHT.morphDur));
        lantern?.drawStatic(true);
        lantern?.getLights(lights);
      };

      const prepare = async () => {
        await waitForGlyphFonts(getLetters()[0] ?? null, 1500);
        if (disposed) return;
        cw = host.clientWidth;
        ch = host.clientHeight;
        sheet = buildGlyphSheet(stage, getLetters(), { extra: getContent() });
        opLight.bake(cw, ch, dpr, displayFamily());
        lantern?.resize();
        if (sheet) lantern?.setIgniteX(sheet.centerX);
        paintLantern(0);
        ready = true;
        host.classList.add(styles.on);
      };
      void prepare();

      const publishStill = (tt: number) => {
        window.__tenki = {
          mode: "still",
          fluid: false,
          fps: 0,
          t: tt,
          letters: sheet?.letters.length ?? 0,
        };
      };

      /** 静止画を 1 枚描く（変形の途中も同じ関数で描ける） */
      const paintStill = (morphT?: number) => {
        drawTenkiStill(mainCanvas, sheet, {
          ...stillOpts(),
          morphT,
          morphDur: OP_LIGHT.morphDur,
          opArt: opLight,
        });
      };

      const frame = () => {
        if (disposed) return;
        if (!ready || !mctx) {
          raf = requestAnimationFrame(frame);
          return;
        }
        const ops = getOpState();
        const alive = ops.live && !ops.skipped;
        const ot = alive ? ops.t : 99;
        const mT = ot - OP_LIGHT.unravelAt;
        if (alive && ot < OP_LIGHT.unravelAt) {
          // 第1幕（短縮版）＝灯敷と灯だけ
          const pw = Math.max(1, Math.round(cw * D));
          const phh = Math.max(1, Math.round(ch * D));
          if (mainCanvas.width !== pw || mainCanvas.height !== phh) {
            mainCanvas.width = pw;
            mainCanvas.height = phh;
          }
          mctx.setTransform(D, 0, 0, D, 0, 0);
          mctx.clearRect(0, 0, cw, ch);
          opLight.drawGlyphs(mctx, ot, cw, ch);
          paintLantern(ot);
          publishStill(0);
          raf = requestAnimationFrame(frame);
          return;
        }
        // 変形（破片がそのまま書類になる）→ 完成したら止める
        const done = mT >= OP_LIGHT.morphDur;
        paintLantern(done ? 99 : ot);
        paintStill(done ? undefined : Math.max(0, mT));
        publishStill(0);
        if (!done) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      cleanups.push(() => cancelAnimationFrame(raf));

      let timer: number | undefined;
      const onResize = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (disposed) return;
          cw = host.clientWidth;
          ch = host.clientHeight;
          sheet = buildGlyphSheet(stage, getLetters(), { extra: getContent() });
          opLight.bake(cw, ch, dpr, displayFamily());
          lantern?.resize();
          paintLantern(99);
          paintStill(undefined);
        }, 300);
      };
      window.addEventListener("resize", onResize);
      cleanups.push(() => {
        window.removeEventListener("resize", onResize);
        window.clearTimeout(timer);
        opLight.destroy();
      });
      return () => {
        disposed = true;
        cleanups.forEach((c) => c());
        lantern?.destroy();
      };
    }

    /* ======================= フル経路 ======================= */
    // ★第1幕と第2幕を同じ描画面で描く。幕は最初から開けておく
    host.classList.add(styles.on);
    const mainCtx = mainCanvas.getContext("2d");

    /* ---- 墨の流体（WebGL・/about の実証済み実装）。失敗しても演出は続く ---- */
    let fluid: FluidSimAPI | null = null;
    const makeFluid = () => {
      if (flag === "nofluid" || fluid) return;
      if (!host.clientWidth || !host.clientHeight) return;
      try {
        fluid = createFluidSim(fluidCanvas, {
          // 圧力の反復が少ないと Jacobi の市松模様（odd-even 分離）が墨の粒に見える。
          // /about と同じ 20 回に戻し、解像度も 0.40 まで上げて滲みを滑らかにする。
          resolution: 0.4,
          brightness: 0.3,
          bgBase: FLUID_BG,
          velocityDissipation: 0.972,
          // 墨は消えずに漂い続ける（0.9965 だと数秒で無くなる）。注ぎ足しと釣り合って
          // 保護帯の外に薄い靄が残り、ゆっくり形を変える
          dyeDissipation: 0.9975,
          // 渦の強さは控えめに。強いと低解像度の格子で高周波の斑（ざらつき）になる
          vorticity: 14,
          pressureIterations: 20,
        });
      } catch {
        fluid = null;
      }
      fluidCanvas.style.display = fluid ? "block" : "none";
      // 一度だけ描いて地色（bgBase）を出す。以後は定着の直前まで回さない
      // （＝断片と筆の 1.7 秒を流体の負荷で間延びさせない）
      fluid?.step(0.0005);
    };

    /* ---- 状態 ---- */
    /** OP（第1幕）の絵。第2幕と同じ描画面に描く＝境目でクロスフェードしない */
    const OPT = lightNow ? OP_LIGHT : OP_FULL;
    let op: OpeningArt | null = null;
    let chipsDone = false;
    let opT = 0;
    let opAlive = false;
    /** 灯は 1 つだけ：OP の点灯時刻から lantern の主灯を立ち上げ、
     *  変形が終わるにつれて副灯・火の粉を足していく（切り替わりが起きない） */
    const lanternPhase = () => {
      if (!opAlive) return [1, 1] as const;
      const rise = clamp01((opT - OPT.igniteAt) / 0.55);
      const main = 1 - Math.pow(1 - rise, 3);
      const amb = smooth01(opT, OPT.unravelAt, OPT.unravelAt + OPT.morphDur);
      return [main, amb] as const;
    };
    let t = 0;
    /** 準備用の時計（OP のあいだも進む。版下・断片の用意の再挑戦間隔に使う） */
    let prepT = 0;
    /** OP から渡されて幕が開いた */
    let opened = false;
    let last = 0;
    let rafId = 0;
    let running = false;
    let settled = false;
    let nextLetter = 0;
    /** 速報レイアウトの再取得・版下の再挑戦の次回時刻（ステージ時計） */
    let primeAt = 0;
    let sheetAt = 0;
    /** 書体の読込待ちが済んだ（＝版下を焼いてよい） */
    let fontsDone = false;
    /** 版下が間に合わず「一本化した線」で待っている時間（秒） */
    let holdT = 0;
    /** 版下が来たあと、帯が寄り切るまで待つ時刻（holdT 基準） */
    let holdRelease = 0;
    /** 版下を諦めて筆を省いた */
    let gaveUp = false;
    let mainDone = false;
    let plan: WritePlan | null = null;
    /** いま描いている帯（速報値 → 版下の実測値へ滑らかに寄る） */
    let row: FragRow | null = null;
    /** 寄せ先の帯 */
    let rowTarget: FragRow | null = null;
    let frags: Frag[] | null = null;
    let labelFont = `500 10px ${monoFamily}`;
    let dropX = 0;
    let dropY0 = 0;
    let dropY1 = 0;
    let inkK = 1;
    let nextAmbient = 0;
    let free: [number, number, number, number][] = [];
    let fps = 0;
    let fpsAcc = 0;
    let fpsN = 0;
    let fpsAt = 0;
    let exitApplied = -1;
    let dbgDye = 0;

    function publish() {
      window.__tenki = {
        mode: fluid ? "full" : "nofluid",
        fluid: !!fluid,
        fps,
        t,
        letters: sheet?.letters.length ?? 0,
        hold: Math.round(holdT * 1000) / 1000,
        dye: Math.round(dbgDye * 1000) / 1000,
        drop: [Math.round(dropX), Math.round(dropY1)],
      };
    }

    function sizeMain() {
      cw = Math.max(1, hostEl.clientWidth);
      ch = Math.max(1, hostEl.clientHeight);
      const w = Math.round(cw * DPR);
      const h = Math.round(ch * DPR);
      if (mainEl.width !== w || mainEl.height !== h) {
        mainEl.width = w;
        mainEl.height = h;
      }
    }

    /** 保護帯（本文カラム＋余白）の外側＝墨を置いてよい場所 */
    function computeFree(band: [number, number, number, number]) {
      const out: [number, number, number, number][] = [];
      const m = 0.05;
      if (band[1] > ch * 0.1) out.push([cw * m, ch * m, cw * (1 - m), band[1] - 6]);
      if (ch - band[3] > ch * 0.1) out.push([cw * m, band[3] + 6, cw * (1 - m), ch * (1 - m)]);
      if (band[0] > cw * 0.1) out.push([cw * m, ch * 0.12, band[0] - 6, ch * 0.88]);
      if (cw - band[2] > cw * 0.1) out.push([band[2] + 6, ch * 0.12, cw * (1 - m), ch * 0.88]);
      if (!out.length) out.push([cw * 0.06, ch * 0.9, cw * 0.94, ch * 0.97]);
      free = out;
    }

    function pickFree(): [number, number] {
      let area = 0;
      for (const r of free) area += Math.max(0, (r[2] - r[0]) * (r[3] - r[1]));
      let k = Math.random() * Math.max(1, area);
      for (const r of free) {
        const a = Math.max(0, (r[2] - r[0]) * (r[3] - r[1]));
        if (k <= a) {
          return [r[0] + Math.random() * (r[2] - r[0]), r[1] + Math.random() * (r[3] - r[1])];
        }
        k -= a;
      }
      return [cw * 0.5, ch * 0.9];
    }

    /** 速報：版下も書体も待たず、DOM の矩形だけで断片を用意する（初速の要） */
    /** 灯敷の破片を書類へ結びつける（版下と断片が揃ってから一度だけ） */
    function linkChips() {
      if (chipsDone || !op || !op.ready || !frags || !op.sheet) return;
      attachChips(frags, op.chips(frags.length), op.sheet);
      chipsDone = true;
    }

    /** OP の版下をいまのステージ寸法で焼く */
    function bakeOpening() {
      if (!op) op = createOpening(OPT, false);
      op.bake(cw, ch, dpr, displayFamily());
      chipsDone = false;
      linkChips();
    }

    function primeLayout(): boolean {
      sizeMain();
      const rough = probeGlyphLayout(stage, getLetters());
      if (!rough) return false;
      const r = rowFromSheet(rough);
      rowTarget = r;
      row = { ...r };
      frags = buildFragments({
        row: r,
        region: regionFromSheet(rough, cw, ch),
        count: countForRow(r),
      });
      labelFont = `500 ${cl(rough.fontPx * 0.17, 8, 11).toFixed(1)}px ${monoFamily}`;
      lantern?.setIgniteX(
        Math.min(0.9, Math.max(0.1, (rough.h1L + rough.h1R) / 2 / Math.max(1, cw)))
      );
      chipsDone = false;
      linkChips();
      return true;
    }

    /** 版下を焼いて、帯を実測値へ寄せ直し、筆の予定と墨の一滴の位置を確定する */
    function applySheet(): boolean {
      sizeMain();
      const s = buildGlyphSheet(stage, getLetters(), { extra: getContent() });
      if (!s) return false;
      sheet = s;
      plan = planWrite(s, TENKI_T);
      rowTarget = rowFromSheet(s);
      if (!frags || !row) {
        row = { ...rowTarget };
        frags = buildFragments({
          row: rowTarget,
          region: regionFromSheet(s, cw, ch),
          count: countForRow(rowTarget),
        });
      }
      labelFont = `500 ${cl(s.fontPx * 0.17, 8, 11).toFixed(1)}px ${monoFamily}`;
      lantern?.setIgniteX(s.centerX);

      // 墨の一滴：最後に書いた字の右下から落ち、本文カラムの外へ着地する
      const lastLine = s.lines[s.lines.length - 1];
      dropX = cl(lastLine.right + 3, cw * 0.08, cw * 0.92);
      // 出発点は最終行の字箱の下端＝筆画には決してかからない
      dropY0 = lastLine.bottom + 4;
      const below = ch - s.band[3];
      // ビネット（下端 28% で地色へ溶ける）に飲まれない高さへ着地させる
      dropY1 = below > ch * 0.1 ? s.band[3] + below * 0.34 : ch * 0.88;
      dropY1 = cl(dropY1, dropY0 + 26, ch * 0.88);
      inkK = below > ch * 0.1 ? 1 : 0.5;
      computeFree(s.band);
      linkChips();
      mainDone = false;
      // 待たせている最中に版下が来たら、帯が実測値へ寄り切るぶんだけ余分に待つ
      if (holdT > 0) holdRelease = holdT + 0.22;
      return true;
    }

    /* ---- 墨の一滴・漂い（流体へ注ぐ） ----
       注入量はフレーム数ではなく時間に比例させる（k = dt×60 ＝ 60fps 相当への正規化）。
       これをしないと低フレームレートの端末で墨がほとんど出ない。 */
    function feedFluid(now: number, dt: number) {
      if (!fluid || !sheet) return; // 着地点は版下（保護帯）が決まってから
      const T = TENKI_T;
      const k = Math.min(4, dt * 60);
      const ux = dropX / Math.max(1, cw);
      const uy = 1 - dropY1 / Math.max(1, ch);
      if (now >= T.settle && now < T.settle + 0.5) {
        const u = (now - T.settle) / 0.5;
        const decay = Math.pow(1 - u, 3);
        // 着地の飛沫＝横へ広く、上へわずかに。紙の上を滲むように低く広がる。
        // 速度は「テクセル/秒」なので dt では割り増さない（割り増すと墨が画面外へ飛ぶ）
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * TAU + now * 3.2;
          fluid.splat(
            ux,
            uy,
            Math.cos(ang) * 44 * decay,
            Math.sin(ang) * 17 * decay,
            0,
            0.011
          );
        }
        fluid.splat(ux, uy, 0, 0, 0.2 * decay * inkK * k, 0.012);
        dbgDye += 0.2 * decay * inkK * k;
        return;
      }
      if (now > T.settle + 0.7 && now >= nextAmbient) {
        nextAmbient = now + 2.2 + Math.random() * 1.4;
        const [px, py] = pickFree();
        const a = Math.random() * TAU;
        fluid.splat(
          px / Math.max(1, cw),
          1 - py / Math.max(1, ch),
          Math.cos(a) * 22,
          Math.sin(a) * 14,
          0.28 * inkK,
          0.014
        );
        dbgDye += 0.28 * inkK;
      }
    }

    /* ---- 転記（canvas 2D） ---- */
    function drawMain(exit: number) {
      const ctx = mainCtx;
      if (!ctx || mainDone) return;
      const T = TENKI_T;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, cw, ch);
      // 版下を諦めた（題字は DOM 側で出し切った）＝以後この canvas には何も描かない
      if (gaveUp) {
        mainDone = true;
        return;
      }
      if (!row || !frags) return;

      // 版下待ちで止まっているあいだ、一本化した線がわずかに呼吸する
      const breathe = holdT > 0 ? 0.84 + 0.16 * Math.sin(holdT * 3.4) : 1;
      // 幕の立ち上がりは OP の時計で（第2幕の時計はまだ 0 のため）
      const showT = opAlive ? opT : t;
      const alpha = clamp01(showT / T.fadeIn) * (1 - clamp01(exit)) * breathe;
      if (alpha <= 0.004) return;
      let any = false;

      /* 第1幕：一筆と灯敷。ほどけ始めたら破片（＝書類の種）が引き継ぐ */
      if (opAlive && op && opT < OPT.unravelAt) {
        ctx.globalAlpha = alpha;
        op.drawGlyphs(ctx, opT, cw, ch);
        ctx.globalAlpha = 1;
        any = true;
      }
      const morphT = opAlive && chipsDone ? opT - OPT.unravelAt : undefined;
      if (morphT !== undefined && morphT >= -0.001) any = true;

      /* 断片：散らばり → 整列 → 一本化。筆が来たところから消費される */
      const writing = !!(sheet && plan) && t >= T.writeStart;
      const consumeX = writing && sheet && plan ? lineFront(plan, sheet, 0, t) : row.left;
      const beforeUnravel = opAlive && opT < OPT.unravelAt;
      if (!beforeUnravel && (!writing || consumeX < row.right)) {
        ctx.save();
        if (writing) {
          // 一本化ずみの帯を、筆先の右側だけ残す（＝線が筆に吸い込まれていく）
          ctx.beginPath();
          ctx.rect(consumeX, row.y - row.h * 2.4, row.right + 6 - consumeX, row.h * 4.8);
          ctx.clip();
        }
        drawFragments(ctx, frags, row, {
          t,
          align: clamp01((t - T.alignStart) / T.alignDur),
          connect: clamp01((t - T.connectStart) / T.connectDur),
          collapse: clamp01((t - T.collapseStart) / T.collapseDur),
          alpha,
          ink: INK255,
          labelFont,
          alignStart: T.alignStart,
          alignDur: T.alignDur,
          morphT: morphT !== undefined && morphT >= 0 ? morphT : undefined,
          morphDur: OPT.morphDur,
          lit,
        });
        ctx.restore();
        any = true;
      }

      /* 筆：版下を切り出して字画を書き上げる → DOM へ渡して消える */
      if (sheet && plan && t >= T.writeStart) {
        ctx.globalAlpha = alpha;
        const w1 = drawWrittenGlyphs(ctx, sheet, plan, { t, T, ink: INK255, lit });
        const w2 = drawBrushMarks(ctx, sheet, plan, { t, T, ink: INK255, lit });
        ctx.globalAlpha = 1;
        any = any || w1 || w2;
      }

      /* 墨の一滴が落ちる（着地＝定着で流体が起動する） */
      if (sheet && t >= T.settle - T.dropFall && t <= T.settle + 0.03) {
        const u = clamp01((t - (T.settle - T.dropFall)) / T.dropFall);
        const y = dropY0 + (dropY1 - dropY0) * u * u;
        const L = lit(dropX, y) * alpha;
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createLinearGradient(dropX, y - 20, dropX, y);
        g.addColorStop(0, `rgba(${INK255[0]}, ${INK255[1]}, ${INK255[2]}, 0)`);
        g.addColorStop(1, `rgba(${INK255[0]}, ${INK255[1]}, ${INK255[2]}, ${0.26 * L})`);
        ctx.fillStyle = g;
        ctx.fillRect(dropX - 1, y - 20, 2, 20);
        ctx.fillStyle = `rgba(${INK255[0]}, ${INK255[1]}, ${INK255[2]}, ${0.85 * L})`;
        ctx.beginPath();
        ctx.arc(dropX, y, 2.1, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        any = true;
      }

      // 描くものが無くなったら以後は触らない（題字の上は完全に空のまま）
      if (!any && t > TENKI_T.settle + 0.1) mainDone = true;
    }

    function tick(ts: number) {
      rafId = requestAnimationFrame(tick);
      if (!running || disposed) return;
      const raw = (ts - last) / 1000;
      last = ts;
      if (raw <= 0) return;
      // 上限 0.25s ＝ 4fps まで物語が壁時計から遅れない（＝初速が落ちない）。
      // 画面外・背面タブの停止は可視性ゲートが rAF ごと止めて last を打ち直すので、
      // ここで長時間ぶんを飛ばしてしまうことはない。
      const dt = Math.min(raw, 0.25);

      const T = TENKI_T;
      const exit = clamp01(exitRef.current);

      /* ---- 速報レイアウト（版下も書体も待たない）。取れるまで毎 0.1s 再挑戦 ---- */
      if (!frags && prepT >= primeAt) {
        primeAt = prepT + 0.1;
        primeLayout();
      }
      /* ---- 版下（書体の読込が済んでから）。焼けるまで毎 0.12s 再挑戦 ---- */
      if (!sheet && fontsDone && prepT >= sheetAt) {
        sheetAt = prepT + 0.12;
        applySheet();
      }
      prepT += dt;

      /* ---- OP の時計を取り込む（第1幕の絵はこの時計で描く） ---- */
      const ops = getOpState();
      opAlive = ops.live && !ops.skipped;
      opT = opAlive ? ops.t : prepT;
      if (opAlive && op) op.advanceStroke(opT);
      if (!opened) {
        opened = true;
        hostEl.classList.add(styles.on);
      }

      /* ---- 第2幕の時計は openingDone から。それまでも絵は描き続ける ---- */
      if (!activeRef.current) {
        const [mk, ak] = lanternPhase();
        lantern?.setPhase(mk, ak);
        lantern?.step(dt);
        lantern?.getLights(lights);
        if (row && rowTarget) {
          const k0 = Math.min(1, dt * 9);
          row.y += (rowTarget.y - row.y) * k0;
          row.left += (rowTarget.left - row.left) * k0;
          row.right += (rowTarget.right - row.right) * k0;
          row.h += (rowTarget.h - row.h) * k0;
        }
        drawMain(0);
        return;
      }

      /* ---- 時計：版下が要る時刻に間に合っていなければ、そこで止めて待つ ---- */
      const ready = gaveUp || (!!(sheet && plan) && holdT >= holdRelease);
      if (!ready && t + dt >= T.writeStart) {
        t = T.writeStart;
        holdT += dt;
        if (!gaveUp && holdT > T.holdMax) {
          // 版下が焼けない環境：筆を省いて題字を出し、定着へ進む（読めないまま止めない）
          gaveUp = true;
          const nAll = getLetters().length;
          for (let i = nextLetter; i < nAll; i++) onLetter(i);
          nextLetter = nAll;
          mainDone = false;
        }
      } else {
        t += dt;
        holdT = 0;
        holdRelease = 0;
      }
      // QC 用の一時停止（撮影を演出の時刻で揃えるため。通常再生では未設定）
      if (typeof window.__tenkiScrub === "number") t = window.__tenkiScrub;

      // 筆が通った文字から DOM へ渡す（書き順＝行 → 左から右）
      if (sheet && plan) {
        while (nextLetter < sheet.letters.length) {
          const g = sheet.letters[nextLetter];
          if (lineFront(plan, sheet, g.line, t) < g.inkC) break;
          onLetter(nextLetter);
          nextLetter++;
        }
      }
      if (!settled && t >= T.settle) {
        settled = true;
        lantern?.ignite();
        onSettled();
      }

      // 帯を実測値へ寄せる（速報値 → 版下。届いた瞬間に飛ばない）
      if (row && rowTarget) {
        const k = Math.min(1, dt * 9);
        row.y += (rowTarget.y - row.y) * k;
        row.left += (rowTarget.left - row.left) * k;
        row.right += (rowTarget.right - row.right) * k;
        row.h += (rowTarget.h - row.h) * k;
      }

      const [mk2, ak2] = lanternPhase();
      lantern?.setPhase(mk2, ak2);
      lantern?.setExit(exit);
      lantern?.step(dt);
      lantern?.getLights(lights);

      drawMain(exit);
      feedFluid(t, dt);
      if (fluid && t >= T.settle - 0.2) {
        fluid.step(dt);
        const want = Math.round(0.92 * (1 - exit * 0.9) * 100) / 100;
        if (want !== exitApplied) {
          exitApplied = want;
          fluidEl.style.opacity = String(want);
        }
      }

      fpsAcc += raw;
      fpsN++;
      // 導入のあいだは細かく publish する（初速の計測が粗くならないように）
      if (ts - fpsAt > (t < T.settle + 0.5 ? 100 : 500)) {
        fps = fpsN / Math.max(1e-3, fpsAcc);
        fpsAcc = 0;
        fpsN = 0;
        fpsAt = ts;
        publish();
      }
    }

    function start() {
      if (running || disposed) return;
      running = true;
      last = performance.now();
      rafId = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(rafId);
    }

    /* ---- 可視性ゲート ---- */
    let inView = true;
    const syncRun = () => {
      const want = inView && document.visibilityState !== "hidden";
      if (want) start();
      else stop();
    };
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries[entries.length - 1];
          if (!e) return;
          inView = e.isIntersecting;
          syncRun();
        },
        { threshold: 0 }
      );
      io.observe(host);
    }
    document.addEventListener("visibilitychange", syncRun);
    cleanups.push(() => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", syncRun);
    });

    /* ---- ポインタ：手元の灯と、墨をそっとかき混ぜる（染料は足さない） ---- */
    let stirAt = 0;
    let px = 0;
    let py = 0;
    const onMove = (e: PointerEvent) => {
      const rc = host.getBoundingClientRect();
      if (!rc.width || !rc.height) return;
      const x = e.clientX - rc.left;
      const y = e.clientY - rc.top;
      lantern?.setPointer(x / rc.width, y / rc.height, true);
      const now = performance.now();
      if (fluid && now - stirAt > 50) {
        const vx = cl((x - px) * 6, -320, 320);
        const vy = cl((y - py) * 6, -320, 320);
        stirAt = now;
        px = x;
        py = y;
        if (Math.abs(vx) + Math.abs(vy) > 12) {
          fluid.splat(x / rc.width, 1 - y / rc.height, vx, -vy, 0, 0.012);
        }
      } else if (!fluid) {
        px = x;
        py = y;
      }
    };
    const onLeave = () => lantern?.setPointer(px / Math.max(1, cw), py / Math.max(1, ch), false);
    sticky.addEventListener("pointermove", onMove);
    sticky.addEventListener("pointerleave", onLeave);
    cleanups.push(() => {
      sticky.removeEventListener("pointermove", onMove);
      sticky.removeEventListener("pointerleave", onLeave);
    });

    /* ---- リサイズ ---- */
    let rt: number | undefined;
    const onResize = () => {
      window.clearTimeout(rt);
      rt = window.setTimeout(() => {
        if (disposed) return;
        sizeGrain();
        lantern?.resize();
        bakeOpening();
        if (sheet) applySheet();
        else primeLayout();
        // 流体は生成時の寸法で FBO を持つ。大きく変わったときだけ作り直す
        if (fluid && (Math.abs(fluidCanvas.clientWidth - cw) > 80 || Math.abs(fluidCanvas.clientHeight - ch) > 80)) {
          fluid.destroy();
          fluid = null;
          makeFluid();
        }
      }, 240);
    };
    window.addEventListener("resize", onResize);
    cleanups.push(() => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(rt);
    });

    /* ---- 起動：★何も待たずに時計を回して散らばりを始める（初速） ----
       版下（＝書体の読込が要る）は並行して焼き、筆が始まる時刻までに間に合わせる。 */
    sizeMain();
    bakeOpening();
    primeLayout();
    start();
    publish();
    const initId = requestAnimationFrame(() => {
      if (!disposed) makeFluid();
    });
    cleanups.push(() => cancelAnimationFrame(initId));
    (async () => {
      await waitForGlyphFonts(getLetters()[0] ?? null, 1200);
      // 検証用：版下の到着を遅らせて待ちの経路を確認する
      //   ?tenki=hold  … 待ってから続行（一本化した線が呼吸して待つ）
      //   ?tenki=hold2 … holdMax を超えて諦める（筆を省いて題字を出す）
      if (flag === "hold" || flag === "hold2") {
        await new Promise((r) => setTimeout(r, flag === "hold" ? 1400 : 2600));
      }
      if (disposed) return;
      fontsDone = true;
      if (getOpState().t < OPT.unravelAt) bakeOpening();
      applySheet();
      publish();
      // 上限で打ち切って代替書体のまま焼いた場合の保険：本物が届いたら焼き直す
      // （掃引が始まる前に限る＝書いている途中で字が入れ替わらない）
      try {
        await document.fonts?.ready;
      } catch {
        return;
      }
      if (disposed || t >= TENKI_T.writeStart) return;
      applySheet();
    })();

    return () => {
      disposed = true;
      stop();
      cleanups.forEach((c) => c());
      fluid?.destroy();
      fluid = null;
      op?.destroy();
      op = null;
      lantern?.destroy();
    };
  }, [light, exitRef, onLetter, onSettled]);

  return (
    <div ref={hostRef} className={styles.stage} aria-hidden="true">
      <div className={styles.base} />
      <canvas ref={fluidRef} className={`${styles.canvas} ${styles.fluid}`} />
      <div className={styles.orbs} />
      <canvas ref={grainRef} className={`${styles.canvas} ${styles.grain}`} />
      <canvas ref={glowRef} className={styles.canvas} />
      <div className={styles.scrim} />
      <canvas ref={mainRef} className={styles.canvas} />
      <div className={styles.vignette} />
    </div>
  );
}
