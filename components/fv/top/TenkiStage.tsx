"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { prefersLightVisuals } from "@/lib/device";
import { TOP_FV_BG, coverPoint } from "@/data/fvBackgrounds";
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
 * 転記（てんき）— トップ FV のオープニングの描画面
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
 *   1.51  定着      墨の一滴が着地する。そこを中心に背景の動画（水盤）の導入が広がる
 *   以後            灯・和紙の暈・ビネットは導入が広がるあいだ（TENKI_T.bgFade）に退き、
 *                   描くものが無くなったら rAF を恒久的に止める（finished）
 *
 * ★2026-10-04 背景を「毎フレーム描くキャンバス」から Blender の動画へ替えた：
 *   - 墨の流体（WebGL）は外した。背景は Hero 側の FvBgVideo（導入 → ループ）、
 *     マウスの光は PointerGlow が持ち、どちらもこのステージの下に敷かれる。
 *   - 灯（lantern）はオープニングの見た目の一部＝着地までは従来どおり断片と筆を照らす。
 *     着地で ignite はせず、CSS の opacity で退かせる。ポインタにも反応させない。
 *   - 一滴の着地点＝動画の枠に対する割合（data/fvBackgrounds.ts の landing）を coverPoint で
 *     この箱の px へ直した点。動画の箱とステージはどちらも .hero に inset:0 で敷かれた
 *     同じ箱なので補正は要らない。落ち始めは従来どおり最終行の下。ただし着地点の x で
 *     文字を横切る時は、横切る文字の下まで落ち始めを下げる（縦長の画面は中央を縦に落ちる）。
 *   - 着地の瞬間に onBgStart を告げる（軽量経路は一滴が落ちないので、変形が終わった時）。
 *
 * ★初速：t=0 はマウント直後の最初の rAF。散らばり〜一本化は題字の版下を要さないので、
 *   書体の読込も版下の焼き付けも待たずに始める（帯の位置は DOM の矩形の速報値で置き、
 *   版下が焼けたら実測値へ滑らかに寄せ直す）。版下が writeStart に間に合わなければ、
 *   その時刻で時計を止めて「一本化した線」を呼吸させながら待つ（TENKI_T.holdMax が上限。
 *   超えたら筆を省いて題字を出し、定着へ進む＝読めないまま止まらない）。
 *
 * 経路の分岐
 *  - PC（pointer:fine）           → 断片・筆・墨の一滴（canvas 2D）＋ 灯
 *  - タッチ・狭幅・reduced-motion  → 短縮版 → 静止 1 コマ（rAF は変形と一滴の余韻の間だけ）。
 *                                    DOM の題字は Hero 側が出す
 *  検証用 ?tenki=still（旧 ?bokujin=still も受ける）
 *
 * ★題字の筆画の上には何も残さない：版下は「筆が通った letterFade 秒後に完全に透明」
 *   になる横方向のアルファ勾配で描かれ、筆先も掃引の終わりに消える。灯は
 *   保護帯（本文カラム＋余白）の外にだけ置く。
 *
 * 可視性ゲート：IntersectionObserver ＋ visibilitychange で画面外・背面タブは
 * rAF を止める。時計は dt の上限で進むので戻っても演出は飛ばない。
 * オープニングを描き終えたらゲートごと外し、以後は再開しない（finished）。
 * iOS/WebKit 配慮：filter / mix-blend / 3D / 複雑な clip-path は不使用。
 */

export type TenkiMode = "full" | "still";

interface TenkiDebug {
  mode: TenkiMode;
  fps: number;
  t: number;
  letters: number;
  /** 版下待ちで足踏みしている時間（秒）。0 なら待っていない */
  hold?: number;
  /** 墨の一滴の着地点（ステージ css 座標）＝背景の動画の導入の中心 */
  drop?: [number, number];
  /** 墨の一滴の落ち始め（ステージ css 座標の y） */
  dropFrom?: number;
  /** オープニングを描き終えて rAF を恒久的に止めた */
  finished?: boolean;
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
  /** 背景の動画の導入を始める合図（フル＝墨の一滴の着地と同時／軽量＝変形が終わった時） */
  onBgStart: () => void;
}

/** 墨の色（暖色白 --ink #f1eaec） */
const INK255: [number, number, number] = [241, 234, 236];
const TAU = Math.PI * 2;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth01 = (v: number, a: number, b: number) => {
  const u = clamp01((v - a) / (b - a || 1e-6));
  return u * u * (3 - 2 * u);
};
const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * 墨の一滴の着地点＝背景の動画の導入が広がる中心（ステージの css px）。
 * 動画の箱（FvBgVideo）とステージはどちらも .hero に inset:0 で敷かれた同じ箱なので、
 * ステージの寸法をそのまま coverPoint へ渡す。wide / narrow は FvBgVideo と同じ式で選ぶ。
 */
function landingPoint(w: number, h: number): { x: number; y: number } {
  const wide =
    typeof window.matchMedia === "function" && window.matchMedia(TOP_FV_BG.wideQuery).matches;
  const v = wide ? TOP_FV_BG.wide : TOP_FV_BG.narrow;
  const [fx, fy] = v.landing ?? [0.5, 0.9];
  const p = coverPoint(fx, fy, w, h, v);
  // 極端な縦横比で着地点が箱の外へ出る時だけ、見える所へ寄せる
  return { x: cl(p.x, 8, Math.max(8, w - 8)), y: cl(p.y, 8, Math.max(8, h - 8)) };
}

export default function TenkiStage({
  active,
  light,
  exitRef,
  onLetter,
  onSettled,
  onBgStart,
}: TenkiStageProps) {
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const hostRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLCanvasElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const grainCanvas = grainRef.current;
    const mainCanvas = mainRef.current;
    const glowCanvas = glowRef.current;
    if (!host || !grainCanvas || !mainCanvas || !glowCanvas) return;
    /* 巻き上げられる関数宣言（sizeMain など）の中では絞り込みが効かないので、
       型を確定させた別名を持つ（2026-09-07 統合QC・tsc TS18047 の修正） */
    const hostEl: HTMLElement = host;
    const mainEl: HTMLCanvasElement = mainCanvas;
    const glowEl: HTMLCanvasElement = glowCanvas;
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

    // 紙の粒は静的＝ここと、リサイズの時にだけ描く（毎フレームは描かない）
    const sizeGrain = () => drawPaperGrain(grainCanvas, host.clientWidth, host.clientHeight);
    sizeGrain();

    const lantern = createLantern(glowCanvas, { full: !lightNow && !reduced, dpr });

    /** 背景の動画へ渡す（一度だけ）：灯・和紙の暈・ビネットは CSS の opacity で退く */
    let handed = false;
    const handOff = () => {
      if (handed) return;
      handed = true;
      hostEl.style.setProperty("--tenki-handoff", `${TENKI_T.bgFade}s`);
      hostEl.classList.add(styles.handoff);
      onBgStart();
    };

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
      const opLight = createOpening(OP_LIGHT, true);
      const mctx = mainCanvas.getContext("2d");
      const D = Math.max(1, Math.min(dpr, 2));
      let ready = false;
      let raf = 0;
      /** 変形を終えて背景の動画へ渡した時刻（rAF の時刻・ms）。-1＝まだ */
      let handAt = -1;
      /** 一滴の余韻（着地点の印）の強さ。渡したあと bgFade かけて 0 へ */
      let dropK = 1;

      const stillOpts = () => ({
        cssW: cw,
        cssH: ch,
        dpr,
        lights,
        ink: INK255,
        labelFont: `500 ${cl((sheet?.fontPx ?? 24) * 0.17, 8, 11).toFixed(1)}px ${monoFamily}`,
        drop: landingPoint(cw, ch),
        dropK,
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
          fps: 0,
          t: tt,
          letters: sheet?.letters.length ?? 0,
          finished: handAt >= 0 && dropK <= 0,
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

      const frame = (ts: number) => {
        if (disposed) return;
        // 描画面が取れない環境では何も描かない＝オープニングは無いので、すぐ背景の動画へ渡す
        if (!mctx) {
          handOff();
          return;
        }
        if (!ready) {
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
        if (mT < OP_LIGHT.morphDur) {
          // 変形（破片がそのまま書類になる）
          paintLantern(ot);
          paintStill(Math.max(0, mT));
          publishStill(0);
          raf = requestAnimationFrame(frame);
          return;
        }
        // 変形が終わった＝軽量経路のオープニングの終わり（一滴は落ちない）。ここで背景の動画の
        // 導入を始め、灯・暈は CSS で退かせる。着地点に出る一滴の余韻（印）だけ bgFade かけて
        // 薄め、消えたら rAF を止める（以後は描き直さない）
        if (handAt < 0) {
          handAt = ts;
          paintLantern(99);
          handOff();
        }
        dropK = reduced ? 0 : 1 - smooth01((ts - handAt) / 1000, 0.15, TENKI_T.bgFade);
        paintStill(undefined);
        publishStill(0);
        if (dropK > 0) raf = requestAnimationFrame(frame);
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
          // 背景の動画へ渡したあとの灯は見えない（CSS で退いた）＝描き直さない
          if (handAt < 0) {
            lantern?.resize();
            paintLantern(99);
          }
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
    /** 落ち始めの直前に着地点と落ち始めを測り直した */
    let dropArmed = false;
    /** オープニングを描き終えた＝以後 rAF を回さない（可視性ゲートでも再開しない） */
    let finished = false;
    let fps = 0;
    let fpsAcc = 0;
    let fpsN = 0;
    let fpsAt = 0;

    function publish() {
      window.__tenki = {
        mode: "full",
        fps,
        t,
        letters: sheet?.letters.length ?? 0,
        hold: Math.round(holdT * 1000) / 1000,
        drop: [Math.round(dropX), Math.round(dropY1)],
        dropFrom: Math.round(dropY0),
        finished,
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

    /** 文字が実際にある範囲（ステージ座標・上から順）。落ちる一滴が文字を横切らないかの判定用。
     *  段落は箱ではなく Range で中身の範囲を取る（中央揃え・2 カラムの空きを正しく扱う） */
    function textRects(): [number, number, number, number][] {
      const rc = stage.getBoundingClientRect();
      const out: [number, number, number, number][] = [];
      const add = (r: DOMRect) => {
        if (r.width > 0 && r.height > 0) {
          out.push([r.left - rc.left, r.top - rc.top, r.right - rc.left, r.bottom - rc.top]);
        }
      };
      const range = document.createRange();
      sticky
        .querySelectorAll<HTMLElement>(
          "[data-hero-line], [data-hero-sub], [data-hero-sub2], [data-hero-decl] p"
        )
        .forEach((el) => {
          range.selectNodeContents(el);
          add(range.getBoundingClientRect());
        });
      sticky
        .querySelectorAll<HTMLElement>("[data-hero-hr], [data-hero-decl] a, [data-hero-corner]")
        .forEach((el) => add(el.getBoundingClientRect()));
      // 2 カラムの宣言ブロックの左端の縦罫（::before）＝箱の左端の細い帯
      const decl = sticky.querySelector<HTMLElement>("[data-hero-decl]");
      if (decl) {
        const r = decl.getBoundingClientRect();
        if (r.height > 0) {
          out.push([r.left - rc.left - 1, r.top - rc.top, r.left - rc.left + 1, r.bottom - rc.top]);
        }
      }
      return out.sort((a, b) => a[1] - b[1]);
    }

    /** 墨の一滴：着地点は背景の動画に合わせて固定し、落ち始めは最終行の字箱の下
     *  （＝筆画には決してかからない）。着地点の x で文字を横切るなら、その文字の下から落とす */
    function placeDrop() {
      if (!sheet) return;
      const land = landingPoint(cw, ch);
      dropX = land.x;
      dropY1 = land.y;
      const lastLine = sheet.lines[sheet.lines.length - 1];
      let y0 = lastLine.bottom + 4;
      for (const r of textRects()) {
        // 文字の横（12px より外）を通る
        if (dropX < r[0] - 12 || dropX > r[2] + 12) continue;
        // 落ちる区間（一滴の尾 20px を含む）と縦に重ならない
        if (r[3] + 20 <= y0 || r[1] - 8 >= dropY1) continue;
        y0 = Math.max(y0, r[3] + 20);
      }
      // 着地点が文字の下に余地を残さない時は、着地点にそのまま現れる（上へは落とさない）
      dropY0 = Math.min(y0, dropY1);
    }

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

    /** 速報：版下も書体も待たず、DOM の矩形だけで断片を用意する（初速の要） */
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
      placeDrop();
      linkChips();
      mainDone = false;
      // 待たせている最中に版下が来たら、帯が実測値へ寄り切るぶんだけ余分に待つ
      if (holdT > 0) holdRelease = holdT + 0.22;
      return true;
    }

    /* ---- 転記（canvas 2D） ---- */
    function drawMain(exit: number) {
      const ctx = mainCtx;
      // 描画面が取れない環境＝描くものは最初から無い（finished へ進めるように印だけ付ける）
      if (!ctx) {
        mainDone = true;
        return;
      }
      if (mainDone) return;
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
      // 変形の最中だけ「描くものがある」と数える。OP の時計は終端で止まったまま live が
      // 残るので、上限が無いと mainDone に永遠に届かず毎フレーム描き直していた（2026-10-04 修正）
      if (morphT !== undefined && morphT >= -0.001 && morphT <= OPT.morphDur) any = true;

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

      /* 墨の一滴が落ちる（着地＝背景の動画の導入がそこから広がる） */
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
      if (!running || disposed || finished) return;
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
        // 着地：背景の動画の導入がここから広がる。灯は広げず（ignite しない）、退かせる
        handOff();
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

      // 一滴が落ち始める瞬間に、着地点と落ち始めを測り直す（本文の書体が後から届いて
      // 組み直された場合も、その時点の実寸で文字を避ける）
      if (!dropArmed && sheet && t >= T.settle - T.dropFall) {
        dropArmed = true;
        placeDrop();
      }

      drawMain(exit);

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

      // 一滴が着地し、灯も退き切った＝以後このステージは毎フレームの仕事をしない
      if (
        settled &&
        mainDone &&
        t >= T.settle + T.bgFade &&
        typeof window.__tenkiScrub !== "number"
      ) {
        finish();
      }
    }

    function start() {
      if (running || disposed || finished) return;
      running = true;
      last = performance.now();
      rafId = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(rafId);
    }

    /** オープニングを描き終えた：rAF を恒久的に止め、可視性ゲートも外す（再開しない） */
    function finish() {
      if (finished) return;
      finished = true;
      stop();
      io?.disconnect();
      document.removeEventListener("visibilitychange", syncRun);
      op?.destroy();
      op = null;
      // 描くものはもう無い＝全画面ぶんの描画面の画素を手放す（透明の 1×1 になる）。
      // 灯の面は CSS で退き切っている（bgFade は壁時計で同じ長さ・t は壁時計より速く進まない）
      mainEl.width = 1;
      mainEl.height = 1;
      glowEl.width = 1;
      glowEl.height = 1;
      publish();
    }

    /* ---- 可視性ゲート（オープニングのあいだだけ） ---- */
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

    /* ---- リサイズ ---- */
    let rt: number | undefined;
    const onResize = () => {
      window.clearTimeout(rt);
      rt = window.setTimeout(() => {
        if (disposed) return;
        sizeGrain();
        // オープニングを終えたら紙の粒（静的）だけ描き直す
        if (finished) return;
        lantern?.resize();
        bakeOpening();
        if (sheet) applySheet();
        else primeLayout();
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
      op?.destroy();
      op = null;
      lantern?.destroy();
    };
  }, [light, exitRef, onLetter, onSettled, onBgStart]);

  return (
    <div ref={hostRef} className={styles.stage} aria-hidden="true">
      <div className={styles.orbs} />
      <canvas ref={grainRef} className={`${styles.canvas} ${styles.grain}`} />
      <canvas ref={glowRef} className={`${styles.canvas} ${styles.glow}`} />
      <div className={styles.vignette} />
      <div className={styles.scrim} />
      <canvas ref={mainRef} className={styles.canvas} />
    </div>
  );
}
