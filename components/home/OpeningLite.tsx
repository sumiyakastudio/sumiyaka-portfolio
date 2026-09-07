"use client";

import { useEffect, useRef, useState } from "react";
import { prefersLightVisuals } from "@/lib/device";
import { SUMI } from "@/components/fv/contract";
import {
  defaultProfile,
  drawNib,
  hash1,
  makePath,
  sliceWithBrushEdge,
  strokeBrush,
  type BrushPath,
} from "@/components/fv/top/inkBrush";
import styles from "./OpeningLite.module.css";

/**
 * OP「一筆と灯」— 第1幕（0.00–1.55s）
 *
 *   0.02–0.62  一筆     暗い紙の上を白い筆が一度だけ走る。入り（細）→送り（太）→
 *                       抜き（細）と、毛の集合として描くことで生まれるかすれ。
 *   0.52–1.04  灯敷     その筆致がサイト名「灯敷」の二文字に結ばれる。字形は
 *                       Shippori Mincho 800 の版下を筆の運びに沿って現すので崩れない。
 *                       二文字のあいだで筆が持ち上がる（字画の切れ目）。
 *   1.00–      灯       字の右上に灯が一点ともる。
 *   1.20–1.55  ほどけ   字が墨のままほどけ、事務のデータの断片になって散る
 *                       ＝第2幕（FV の転記）への受け渡し。1.20s で onDone。
 *
 * 経路の分岐
 *   - reduced-motion             → 再生しない。即 onDone（FV の終端へ）
 *   - タッチ・狭幅（軽量経路）    → 0.80s の短縮版。一筆を省き、灯敷と灯だけ
 *   - それ以外                   → フル
 *
 * ★スクロールをロックしない（pointer-events: none）。
 * ★ハードタイムアウト 2.2s で必ず onDone を呼び、FV へ渡す。
 * iOS/WebKit 配慮：canvas 2D のみ（filter・blend・3D・clip-path 不使用）。
 */

const INK: [number, number, number] = [246, 242, 243];
const GLOW = SUMI.glowRGB;

const OP_FULL = {
  strokeStart: 0.02,
  strokeEnd: 0.62,
  glyph0Start: 0.52,
  glyph0End: 0.76,
  glyph1Start: 0.82,
  glyph1End: 1.04,
  igniteAt: 1.0,
  unravelAt: 1.2,
  unravelDur: 0.35,
  // ほどけ始めを一瞬だけ見せてから FV へ渡す（幕の溶暗と重ねすぎない）
  doneAt: 1.26,
} as const;

const OP_LIGHT = {
  strokeStart: 0,
  strokeEnd: 0,
  glyph0Start: 0.05,
  glyph0End: 0.24,
  glyph1Start: 0.26,
  glyph1End: 0.44,
  igniteAt: 0.42,
  unravelAt: 0.56,
  unravelDur: 0.24,
  doneAt: 0.56,
} as const;

/** 何があっても FV へ渡す壁時計の上限 */
const HARD_TIMEOUT_MS = 2200;

declare global {
  interface Window {
    /** OP の位相（撮影・実測用） */
    __op?: {
      t: number;
      phase: string;
      sheet: boolean;
      light: boolean;
      fontPx: number;
      box: number[];
    };
    /** QC 用：数値を入れるとその時刻に止まる（未設定なら通常再生） */
    __opScrub?: number | null;
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut3 = (u: number) => 1 - Math.pow(1 - clamp01(u), 3);
const easeIO = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

interface Shard {
  /** 版下の切り出し（版下画素） */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** 出力の起点（css） */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 飛ぶ向きと量 */
  vx: number;
  vy: number;
  rot: number;
  delay: number;
}

interface OpeningLiteProps {
  onDone: () => void;
}

export default function OpeningLite({ onDone }: OpeningLiteProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const doneRef = useRef(false);
  const [out, setOut] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const probe = probeRef.current;
    if (!canvas || !probe) return;
    const cv: HTMLCanvasElement = canvas;

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
      setOut(true);
    };

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = reduced ? null : cv.getContext("2d");
    if (reduced || !ctx) {
      // 「視差効果を減らす」／canvas が使えない：幕を張らずに即 FV へ渡す
      const id = window.setTimeout(() => {
        finish();
        setGone(true);
      }, 0);
      return () => window.clearTimeout(id);
    }

    const light = prefersLightVisuals();
    const T = light ? OP_LIGHT : OP_FULL;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

    let disposed = false;
    let cw = 0;
    let ch = 0;

    /* ---- 版下（灯敷）---- */
    let sheet: HTMLCanvasElement | null = null;
    let sheetScale = 1;
    /** 版下の左上（css）と各文字の墨の左右端（css） */
    let gx = 0;
    let gy = 0;
    let gw = 0;
    let ghh = 0;
    const charL: number[] = [0, 0];
    const charR: number[] = [0, 0];
    let shards: Shard[] = [];
    let fontSize = 100;

    const family = (() => {
      const f = getComputedStyle(probe).fontFamily;
      return f || "serif";
    })();

    /** 経路（一筆） */
    let path: BrushPath | null = null;
    /** 一筆を溜める層（毎フレーム引き直さない） */
    let inkLayer: HTMLCanvasElement | null = null;
    let inkCtx: CanvasRenderingContext2D | null = null;
    let inkDrawn = 0; // どこまで引いたか（0..1）

    function sizeAll() {
      // 幕の寸法ではなくビューポートの実測を使う（祖先の transform に影響されない）
      cw = Math.max(1, window.innerWidth || document.documentElement.clientWidth);
      ch = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
      cv.style.width = `${cw}px`;
      cv.style.height = `${ch}px`;
      cv.width = Math.round(cw * dpr);
      cv.height = Math.round(ch * dpr);
      if (!inkLayer) inkLayer = document.createElement("canvas");
      inkLayer.width = cv.width;
      inkLayer.height = cv.height;
      inkCtx = inkLayer.getContext("2d");
      inkCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      inkDrawn = 0;
    }

    /** 「灯敷」の版下を焼き、文字ごとの墨の範囲と、ほどけの破片を用意する */
    function bake() {
      // 幅にも高さにも収まる大きさ（横長でも縦長でも二文字が主役になる）
      fontSize = Math.max(56, Math.min(Math.min(cw * 0.2, ch * 0.34), 250));
      const off = document.createElement("canvas");
      const octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) return;
      const font = `800 ${fontSize}px ${family}`;
      sheetScale = dpr;
      const pad = fontSize * 0.22;
      // 先に計測（一時 canvas の既定コンテキストで）
      octx.font = font;
      const chars = ["灯", "敷"];
      const adv = chars.map((c) => octx.measureText(c).width);
      const track = fontSize * 0.06;
      const totalW = adv[0] + adv[1] + track;
      const m0 = octx.measureText(chars[0]);
      const asc =
        typeof m0.fontBoundingBoxAscent === "number" ? m0.fontBoundingBoxAscent : fontSize * 0.88;
      const desc =
        typeof m0.fontBoundingBoxDescent === "number" ? m0.fontBoundingBoxDescent : fontSize * 0.12;
      const glyphH = asc + desc;

      gw = totalW + pad * 2;
      ghh = glyphH + pad * 2;
      gx = (cw - totalW) / 2 - pad;
      gy = (ch - glyphH) / 2 - pad;

      off.width = Math.ceil(gw * sheetScale);
      off.height = Math.ceil(ghh * sheetScale);
      const o2 = off.getContext("2d", { willReadFrequently: true });
      if (!o2) return;
      o2.setTransform(sheetScale, 0, 0, sheetScale, 0, 0);
      o2.clearRect(0, 0, gw, ghh);
      o2.font = font;
      o2.textBaseline = "alphabetic";
      o2.textAlign = "left";
      o2.fillStyle = `rgb(${INK[0]}, ${INK[1]}, ${INK[2]})`;
      let x = pad;
      for (let i = 0; i < 2; i++) {
        const m = o2.measureText(chars[i]);
        const il = typeof m.actualBoundingBoxLeft === "number" ? m.actualBoundingBoxLeft : 0;
        const ir = typeof m.actualBoundingBoxRight === "number" ? m.actualBoundingBoxRight : adv[i];
        o2.fillText(chars[i], x, pad + asc);
        charL[i] = gx + x - il;
        charR[i] = gx + x + ir;
        x += adv[i] + track;
      }
      sheet = off;

      /* ほどけの破片＝版下を格子に割り、墨のあるマスだけ拾う */
      shards = [];
      const cols = 9;
      const rows = 4;
      let img: Uint8ClampedArray | null = null;
      try {
        img = o2.getImageData(0, 0, off.width, off.height).data;
      } catch {
        img = null;
      }
      const cellW = off.width / cols;
      const cellH = off.height / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = Math.floor(c * cellW);
          const py = Math.floor(r * cellH);
          const pw = Math.floor(cellW);
          const ph = Math.floor(cellH);
          if (img) {
            let hit = 0;
            for (let yy = py; yy < py + ph; yy += 3) {
              for (let xx = px; xx < px + pw; xx += 3) {
                if (img[(yy * off.width + xx) * 4 + 3] > 40) hit++;
              }
            }
            if (hit < 6) continue;
          }
          const cxr = (c + 0.5) / cols - 0.5;
          const cyr = (r + 0.5) / rows - 0.5;
          const len = Math.hypot(cxr, cyr) || 1;
          const spread = Math.min(cw, ch) * 0.34;
          const h1 = hash1(r * 31.7 + c * 5.3);
          const h2 = hash1(r * 7.1 + c * 19.3);
          shards.push({
            sx: px,
            sy: py,
            sw: pw,
            sh: ph,
            x: gx + (px / sheetScale),
            y: gy + (py / sheetScale),
            w: pw / sheetScale,
            h: ph / sheetScale,
            vx: (cxr / len) * spread * (0.55 + h1 * 0.9) + (h2 - 0.5) * spread * 0.3,
            vy: (cyr / len) * spread * (0.4 + h2 * 0.7) + (h1 - 0.5) * spread * 0.24,
            rot: (h1 - 0.5) * 1.1,
            delay: h2 * 0.28,
          });
        }
      }

      /* 一筆の経路＝字を横切って抜ける S 字 */
      const S = fontSize;
      const cx = cw / 2;
      const cy = ch / 2;
      path = makePath([
        { x: Math.max(-S * 0.4, cx - S * 2.6), y: cy - S * 0.62 },
        { x: cx - S * 1.15, y: cy - S * 0.1 },
        { x: cx - S * 0.15, y: cy + S * 0.3 },
        { x: cx + S * 0.95, y: cy - S * 0.16 },
        { x: Math.min(cw + S * 0.4, cx + S * 2.7), y: cy + S * 0.5 },
      ]);
      inkDrawn = 0;
      if (inkCtx && inkLayer) inkCtx.clearRect(0, 0, cw, ch);
    }

    /* ---- 灯（点灯）---- */
    function drawIgnite(t: number) {
      const u = t - T.igniteAt;
      if (u <= 0) return;
      const rise = easeOut3(Math.min(1, u / 0.55));
      const flick = 0.86 + 0.14 * Math.sin(u * 5.2) + 0.06 * Math.sin(u * 11.7);
      const x = charR[1] + fontSize * 0.16;
      const y = gy + ghh * 0.2;
      const R = fontSize * (0.6 + 0.4 * rise);
      const I = 0.85 * rise * flick;
      const g = ctx!.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `rgba(${GLOW}, ${(I * 0.5).toFixed(3)})`);
      g.addColorStop(0.34, `rgba(${GLOW}, ${(I * 0.15).toFixed(3)})`);
      g.addColorStop(1, `rgba(${GLOW}, 0)`);
      ctx!.fillStyle = g;
      ctx!.fillRect(x - R, y - R, R * 2, R * 2);
      const rc = Math.max(2.4, R * 0.055);
      const g2 = ctx!.createRadialGradient(x, y, 0, x, y, rc);
      g2.addColorStop(0, `rgba(${GLOW}, ${Math.min(1, I * 1.5).toFixed(3)})`);
      g2.addColorStop(1, `rgba(${GLOW}, 0)`);
      ctx!.fillStyle = g2;
      ctx!.fillRect(x - rc, y - rc, rc * 2, rc * 2);
    }

    /* ---- 一筆（溜め層へ継ぎ足す）---- */
    function advanceStroke(t: number) {
      if (!path || !inkCtx || light) return;
      const u = clamp01((t - T.strokeStart) / Math.max(0.01, T.strokeEnd - T.strokeStart));
      const want = easeIO(u);
      if (want <= inkDrawn + 0.0008) return;
      // 溜め層は source-over。毛が重なっても白く飛ばず、墨として濃くなる
      strokeBrush(inkCtx, path, inkDrawn, want, {
        rgb: INK,
        width: fontSize * 0.17,
        bristles: 15,
        seed: 3.7,
        alpha: 0.6,
        dry: 0.55,
        profile: defaultProfile,
      });
      inkDrawn = want;
    }

    /* ---- 灯敷（版下の切り出し）---- */
    function drawGlyphs(t: number) {
      if (!sheet) return;
      for (let i = 0; i < 2; i++) {
        const a = i === 0 ? T.glyph0Start : T.glyph1Start;
        const b = i === 0 ? T.glyph0End : T.glyph1End;
        if (t <= a) continue;
        const u = clamp01((t - a) / Math.max(0.01, b - a));
        const e = u * 0.32 + easeIO(u) * 0.68;
        const L = charL[i];
        const R = charR[i];
        const sweep = L + (R - L + 4) * e;
        const trail = (R - L) * 0.5;
        const done = u >= 1;
        // 濃度 0 が筆先（右）、1 が通り過ぎた側（左）。書き終えたら勾配を右の外へ
        // 退避させ、文字全体を濃度 1 にする（字が薄いまま残らない）
        const from = done ? gx + gw + 40 : sweep;
        const to = done ? gx + gw + 39 : sweep - trail;
        const dry = done ? 0 : 0.52 * (1 - u * 0.55);
        // 版下のうち、この文字の「筆が通ったところまで」を切り出す
        const cut = done ? R + 4 : sweep;
        const sx0 = Math.max(0, (L - 6 - gx) * sheetScale);
        const sx1 = Math.min(sheet.width, (cut - gx) * sheetScale);
        if (sx1 - sx0 < 0.5) continue;
        sliceWithBrushEdge(
          ctx!,
          sheet,
          sheetScale,
          sx0,
          0,
          sx1 - sx0,
          sheet.height,
          gx + sx0 / sheetScale,
          gy,
          (sx1 - sx0) / sheetScale,
          ghh,
          from,
          to,
          dry,
          11.3 + i * 4.7
        );
        // 筆先。字画の切れ目（文字間）では持ち上がる
        if (!done) {
          const w = fontSize * 0.085 * (0.5 + defaultProfile(u));
          const lift = clamp01((u - 0.9) / 0.1);
          ctx!.globalCompositeOperation = "lighter";
          drawNib(ctx!, sweep, gy + ghh * 0.52, 1, 0.14, w, 0.75 * (1 - lift), INK);
          ctx!.globalCompositeOperation = "source-over";
        }
      }
    }

    /* ---- ほどけ（字が断片になって散る）---- */
    function drawUnravel(t: number) {
      if (!sheet || t < T.unravelAt) return;
      const g = t - T.unravelAt;
      for (const s of shards) {
        // まだ飛び立っていない破片は「その場の字のまま」描く（字が一瞬で消えないように）
        const u = clamp01((g - s.delay) / Math.max(0.05, T.unravelDur - s.delay));
        const e = easeOut3(u);
        const x = s.x + s.vx * e;
        const y = s.y + s.vy * e;
        const inkA = 1 - u;
        const paperA = Math.sin(Math.PI * clamp01(u * 1.1)) * 0.5;
        ctx!.save();
        ctx!.translate(x + s.w / 2, y + s.h / 2);
        ctx!.rotate(s.rot * e);
        if (inkA > 0.02) {
          ctx!.globalAlpha = inkA;
          ctx!.drawImage(sheet, s.sx, s.sy, s.sw, s.sh, -s.w / 2, -s.h / 2, s.w, s.h);
          ctx!.globalAlpha = 1;
        }
        if (paperA > 0.02) {
          ctx!.globalCompositeOperation = "lighter";
          ctx!.strokeStyle = `rgba(${INK[0]}, ${INK[1]}, ${INK[2]}, ${(paperA * 0.5).toFixed(3)})`;
          ctx!.lineWidth = 1;
          ctx!.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
          ctx!.fillStyle = `rgba(${INK[0]}, ${INK[1]}, ${INK[2]}, ${(paperA * 0.24).toFixed(3)})`;
          for (let k = 1; k <= 2; k++) {
            ctx!.fillRect(-s.w * 0.36, -s.h / 2 + (s.h * k) / 3 - 0.5, s.w * 0.72, 1);
          }
          ctx!.globalCompositeOperation = "source-over";
        }
        ctx!.restore();
      }
    }

    /* ---- ループ ---- */
    let t = 0;
    let last = 0;
    let raf = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (disposed) return;
      if (!last) last = ts;
      const dt = Math.min((ts - last) / 1000, 0.25);
      last = ts;
      t += dt;
      // QC 用の一時停止（撮影を演出の時刻で揃えるため。通常再生では未設定）
      if (typeof window.__opScrub === "number") t = window.__opScrub;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      advanceStroke(t);
      // 一筆は字に結ばれるにつれて退く
      if (inkLayer && !light) {
        const fade = 1 - clamp01((t - T.glyph0Start + 0.02) / 0.3) * 0.97;
        if (fade > 0.02) {
          ctx.globalAlpha = fade;
          ctx.drawImage(inkLayer, 0, 0, cw, ch);
          ctx.globalAlpha = 1;
        }
      }
      if (t < T.unravelAt) drawGlyphs(t);
      else drawUnravel(t);
      drawIgnite(t);

      window.__op = {
        t: Math.round(t * 1000) / 1000,
        phase:
          t < T.glyph0Start ? "stroke" : t < T.unravelAt ? "glyph" : "unravel",
        sheet: !!sheet,
        light,
        fontPx: Math.round(fontSize),
        box: [Math.round(gx), Math.round(gy), Math.round(gw), Math.round(ghh)],
      };
      if (!doneRef.current && t >= T.doneAt) finish();
      if (t >= T.unravelAt + T.unravelDur + 0.25) {
        cancelAnimationFrame(raf);
        setGone(true);
      }
    };

    sizeAll();
    bake();
    // 書体が間に合わなければ代替で始め、届いたら（ほどける前に限り）焼き直す
    let fontJob: Promise<unknown> | null = null;
    try {
      fontJob = document.fonts?.load(`800 ${fontSize}px ${family}`, "灯敷") ?? null;
    } catch {
      fontJob = null;
    }
    // 字形の正しさを最優先：ほどける前なら、途中でも本物の書体で焼き直す
    fontJob
      ?.then(() => {
        if (!disposed && t < T.unravelAt) bake();
      })
      .catch(() => undefined);

    raf = requestAnimationFrame(tick);
    // 保険：何があっても 2.2s で FV へ渡す（QC で時計を止めているあいだは効かせない）
    const born = performance.now();
    const hard = window.setInterval(() => {
      if (typeof window.__opScrub === "number") return;
      if (performance.now() - born >= HARD_TIMEOUT_MS) finish();
    }, 150);
    const onResize = () => {
      if (disposed) return;
      sizeAll();
      bake();
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(hard);
      window.removeEventListener("resize", onResize);
    };
  }, [onDone]);

  if (gone) return null;
  return (
    <div ref={hostRef} className={`${styles.op} ${out ? styles.out : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
      <span ref={probeRef} className={styles.probe}>
        灯敷
      </span>
    </div>
  );
}
