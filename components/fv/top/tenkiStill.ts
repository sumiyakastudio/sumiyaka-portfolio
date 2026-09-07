/**
 * 転記 — 静止 1 コマ（タッチ端末・狭幅・reduced-motion）
 *
 * シミュレーションも rAF も走らせず、「断片が整列して線になり、題字になった」と
 * 読める絵を canvas 2D で一度だけ描く（ポスター判定）。
 *
 * ★題字の筆画の上には絶対に何も置かない。演出はすべて題字の帯の外——
 *   既定では題字の真上の細い帯——に置き、そこから題字へ向かう「送りの罫」を
 *   題字の上端の手前で止める。
 *
 *   左  … 角度も大きさもばらばらの断片（CSV / XLSX / PDF）＝バラバラな事務作業
 *   中  … 回転が戻り、水平に揃い、隣と端で繋がる
 *   右  … 1 本の線になり、そこから下の題字へ送られている
 */

import {
  attachChips,
  buildFragments,
  drawFragments,
  countForRow,
  type FragRow,
} from "./fragments";
import type { GlyphSheet } from "./glyphSheet";
import type { OpeningArt } from "./opening";

export interface StillOptions {
  cssW: number;
  cssH: number;
  dpr: number;
  /** u 空間 [x, y, I] × 3（lantern.getLights の出力） */
  lights: Float32Array;
  /** 墨の色（0-255） */
  ink: [number, number, number];
  /** ラベルの書体（ctx.font 形式） */
  labelFont: string;
  /** 変形の経過（秒）。灯敷の破片が書類へ姿を変える途中を 1 コマで見せる */
  morphT?: number;
  morphDur?: number;
  /** 破片の出どころ（OP の版下） */
  opArt?: OpeningArt | null;
}

const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function drawTenkiStill(
  canvas: HTMLCanvasElement,
  sheet: GlyphSheet | null,
  o: StillOptions
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const DPR = Math.max(1, Math.min(o.dpr || 1, 2));
  const W = Math.max(1, o.cssW);
  const H = Math.max(1, o.cssH);
  const pw = Math.max(1, Math.round(W * DPR));
  const ph = Math.max(1, Math.round(H * DPR));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!sheet || !sheet.lines.length) return true;

  const col = (a: number) => `rgba(${o.ink[0]}, ${o.ink[1]}, ${o.ink[2]}, ${a})`;
  /** 灯からの明るさ（u 空間＝ステージ高で正規化） */
  const lit = (x: number, y: number) => {
    let s = 0;
    for (let k = 0; k < 9; k += 3) {
      const d = Math.hypot(x / H - o.lights[k], y / H - o.lights[k + 1]);
      s += o.lights[k + 2] * Math.exp(-d * d * 2.4);
    }
    return 0.5 + 0.5 * Math.min(1, s);
  };

  /* ---- 帯の置き場所：既定は題字の真上。余白が無ければ本文カラムの下 ---- */
  const rowH = cl(sheet.fontPx * 0.52, 14, 30);
  const gap = cl(H * 0.055, 22, 62);
  const above = sheet.h1T - H * 0.05;
  // 帯の中心までの距離（rowH*0.9 + gap）＋散らばりの上の張り出し（rowH*2.1）が入るか
  const need = rowH * 2.9 + gap;
  const up = above >= need;
  const rowY = up
    ? sheet.h1T - (rowH * 0.9 + gap)
    : Math.min(H * 0.9 - rowH, sheet.band[3] + gap);
  if (rowY < rowH || rowY > H - rowH) return true;

  const row: FragRow = {
    y: rowY,
    left: sheet.h1L,
    right: sheet.h1R,
    h: rowH,
  };
  const span = row.right - row.left;
  // 静止 1 コマは「読める枚数」を優先して動きの経路より少なくする
  const n = Math.max(6, Math.min(9, Math.round(countForRow(row) * 0.85)));
  const frags = buildFragments({
    row,
    // 散らばりは帯の左 6 割・帯の上下 2.3 倍まで（題字には決してかからない）
    region: [row.left - rowH * 0.5, rowY - rowH * 2.3, row.left + span * 0.58, rowY + rowH * 2.3],
    count: n,
    seed: 424242,
  });
  // 灯敷の破片を書類へ結びつける（軽量経路でも「墨 → 紙」の変化が見える）
  if (o.opArt?.ready && o.opArt.sheet) {
    attachChips(frags, o.opArt.chips(frags.length), o.opArt.sheet);
  }

  drawFragments(ctx, frags, row, {
    t: 0,
    align: 0.92,
    // 1 を超える値＝「連結は済んだ」状態。走る光そのものは静止画では描かない
    connect: 1.2,
    collapse: 0.8,
    alpha: 1,
    ink: o.ink,
    labelFont: o.labelFont,
    alignStart: 0,
    alignDur: 1,
    morphT: o.morphT,
    morphDur: o.morphDur,
    lit,
    // 左＝散らばったまま／中＝整列の途中／右＝一本化済み
    progressOf: (i, k) => (k < 2 ? 1 : (i / (k - 1)) * 1.55 - 0.3),
    collapseOf: (i, k) => {
      const p = k < 2 ? 1 : (i / (k - 1)) * 1.55 - 0.3;
      const u = Math.max(0, Math.min(1, (p - 0.66) / 0.34));
      return u * u * (3 - 2 * u);
    },
  });

  ctx.globalCompositeOperation = "lighter";

  /* 変形の途中は飾り（先端の灯・送りの罫・墨の余韻）を出さない＝画面を散らかさない */
  const mp =
    o.morphT === undefined ? 1 : Math.max(0, Math.min(1, o.morphT / Math.max(0.05, o.morphDur ?? 0.34)));
  const deco = mp <= 0.7 ? 0 : (mp - 0.7) / 0.3;
  if (deco <= 0.01) {
    ctx.globalCompositeOperation = "source-over";
    return true;
  }

  /* ---- 一本化した線の先端（右端）に灯りを一点 ---- */
  const hx = row.right;
  const hy = rowY;
  const hL = lit(hx, hy);
  const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, rowH * 1.5);
  g.addColorStop(0, col(0.42 * hL * deco));
  g.addColorStop(1, col(0));
  ctx.fillStyle = g;
  ctx.fillRect(hx - rowH * 1.5, hy - rowH * 1.5, rowH * 3, rowH * 3);

  /* ---- 送りの罫：線から題字へ（題字の上端の手前で必ず止める） ---- */
  if (up) {
    const stop = sheet.h1T - 7;
    if (stop > rowY + 4) {
      for (let i = 0; i < 5; i++) {
        const x = Math.round(row.left + span * (0.6 + (i / 4) * 0.38)) + 0.5;
        const a = (0.1 + 0.12 * (i / 4)) * deco;
        ctx.fillStyle = col(a * lit(x, (rowY + stop) / 2));
        ctx.fillRect(x, rowY + rowH * 0.35, 1, stop - rowY - rowH * 0.35);
      }
    }
  }

  /* ---- 墨の一滴の余韻（流体の代わり・本文カラムの外にだけ置く） ---- */
  const belowTop = Math.max(sheet.band[3], rowY + rowH * 2);
  if (up && H - belowTop > H * 0.1) {
    const bx = cl(sheet.centerX * W, W * 0.14, W * 0.86);
    const by = belowTop + (H - belowTop) * 0.46;
    const br = Math.min(H * 0.16, W * 0.2);
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    bg.addColorStop(0, col(0.075 * deco));
    bg.addColorStop(0.45, col(0.028 * deco));
    bg.addColorStop(1, col(0));
    ctx.fillStyle = bg;
    ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    ctx.fillStyle = col(0.3 * deco);
    ctx.beginPath();
    ctx.arc(bx, by, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
  return true;
}

/** 紙の粒（静的なノイズ）を一度だけ描く。alpha は極めて薄い */
export function drawPaperGrain(canvas: HTMLCanvasElement, cssW: number, cssH: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = Math.max(1, Math.round(cssW));
  const H = Math.max(1, Math.round(cssH));
  canvas.width = W;
  canvas.height = H;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  let sd = 987654321;
  for (let i = 0; i < d.length; i += 4) {
    sd = (sd * 1664525 + 1013904223) >>> 0;
    const v = sd >>> 24;
    // 暖色白の粒を 0〜7% の透明度で置く（簀の目の代わり）
    d[i] = 241;
    d[i + 1] = 234;
    d[i + 2] = 236;
    d[i + 3] = v < 40 ? 6 + (v & 7) : 0;
  }
  ctx.putImageData(img, 0, 0);
}
