/**
 * OP「一筆と灯」の絵 — 第2幕と同じ描画面（TenkiStage の canvas）で描くための部品。
 *
 *   一筆   経路を「毛の集合」として引く（入り細→送り太→抜き細・かすれ）
 *   灯敷   Shippori Mincho 800 の版下を筆の運びに沿って切り出す（字形は崩れない）
 *   灯     lantern の主灯が立ち上がる（第2幕へそのまま引き継ぐので灯は常に 1 つ）
 *   破片   版下を格子に割り、墨の多いマスから n 個。★この破片がそのまま第2幕の
 *          書類（CSV / XLSX / PDF）へ姿を変える＝入れ替えではなく連続変形
 *
 * canvas 2D のみ（filter・blend・3D・clip-path 不使用）。
 */

import {
  defaultProfile,
  drawNib,
  hash1,
  makePath,
  sliceWithBrushEdge,
  strokeBrush,
  type BrushPath,
} from "./inkBrush";

export const OP_INK: [number, number, number] = [246, 242, 243];

export interface OpTiming {
  strokeStart: number;
  strokeEnd: number;
  glyph0Start: number;
  glyph0End: number;
  glyph1Start: number;
  glyph1End: number;
  igniteAt: number;
  /** 字がほどけ始める＝破片が飛び立ち、書類へ変形し始める */
  unravelAt: number;
  /** 変形にかける時間 */
  morphDur: number;
  /** 第2幕へ渡す（openingDone） */
  doneAt: number;
}

export const OP_FULL: OpTiming = {
  strokeStart: 0.02,
  strokeEnd: 0.62,
  glyph0Start: 0.52,
  glyph0End: 0.76,
  glyph1Start: 0.82,
  glyph1End: 1.04,
  igniteAt: 1.0,
  unravelAt: 1.2,
  morphDur: 0.55,
  doneAt: 1.26,
};

export const OP_LIGHT: OpTiming = {
  strokeStart: 0,
  strokeEnd: 0,
  glyph0Start: 0.05,
  glyph0End: 0.24,
  glyph1Start: 0.26,
  glyph1End: 0.44,
  igniteAt: 0.42,
  unravelAt: 0.5,
  morphDur: 0.34,
  doneAt: 0.56,
};

/** 何があっても第2幕へ渡す壁時計の上限（ms） */
export const OP_HARD_TIMEOUT_MS = 2200;

/** 版下から切り出した「破片」＝書類の種 */
export interface OpChip {
  /** 版下画素 */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** 出発の位置と寸法（ステージ css・中心座標） */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 出発の傾きと、飛びながらの回転 */
  rot: number;
  spin: number;
  /** 飛び立ちの時差（秒） */
  delay: number;
  /** 墨の量（0..1・並べ替え用） */
  ink: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeIO = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export interface OpeningArt {
  /** 版下が焼けている */
  readonly ready: boolean;
  /** 版下（灯敷）— 破片の中身にも使う */
  readonly sheet: HTMLCanvasElement | null;
  readonly sheetScale: number;
  /** ビューポート寸法で焼き直す */
  bake(cw: number, ch: number, dpr: number, family: string): void;
  /** 一筆を溜め層へ継ぎ足す（t は OP 時計） */
  advanceStroke(t: number): void;
  /** 一筆＋灯敷を描く（ほどけ以降は呼ばない＝破片側が引き継ぐ） */
  drawGlyphs(ctx: CanvasRenderingContext2D, t: number, cw: number, ch: number): void;
  /** 墨の多いマスから n 個の破片を取る（左→右に並べて返す） */
  chips(n: number): OpChip[];
  destroy(): void;
}

export function createOpening(T: OpTiming, light: boolean): OpeningArt {
  let sheet: HTMLCanvasElement | null = null;
  let sheetScale = 1;
  let gx = 0;
  let gy = 0;
  let gw = 0;
  let ghh = 0;
  let fontSize = 100;
  const charL = [0, 0];
  const charR = [0, 0];
  let cells: OpChip[] = [];
  let path: BrushPath | null = null;
  let inkLayer: HTMLCanvasElement | null = null;
  let inkCtx: CanvasRenderingContext2D | null = null;
  let inkDrawn = 0;

  function bake(cw: number, ch: number, dpr: number, family: string) {
    if (typeof document === "undefined" || cw < 2 || ch < 2) return;
    fontSize = Math.max(56, Math.min(Math.min(cw * 0.2, ch * 0.34), 250));
    const off = document.createElement("canvas");
    const probe = off.getContext("2d", { willReadFrequently: true });
    if (!probe) return;
    const font = `800 ${fontSize}px ${family}`;
    sheetScale = Math.max(1, Math.min(dpr, 2));
    const pad = fontSize * 0.22;
    probe.font = font;
    const chars = ["灯", "敷"];
    const adv = chars.map((c) => probe.measureText(c).width);
    const track = fontSize * 0.06;
    const totalW = adv[0] + adv[1] + track;
    const m0 = probe.measureText(chars[0]);
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
    o2.fillStyle = `rgb(${OP_INK[0]}, ${OP_INK[1]}, ${OP_INK[2]})`;
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

    /* ---- 破片の候補＝版下を格子に割り、墨の量を測る ---- */
    cells = [];
    const cols = 6;
    const rows = 3;
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
        const pw = Math.max(2, Math.floor(cellW));
        const ph = Math.max(2, Math.floor(cellH));
        let hit = 0;
        let n = 0;
        if (img) {
          for (let yy = py; yy < py + ph; yy += 3) {
            for (let xx = px; xx < px + pw; xx += 3) {
              n++;
              if (img[(yy * off.width + xx) * 4 + 3] > 40) hit++;
            }
          }
        }
        const h1 = hash1(r * 31.7 + c * 5.3);
        const h2 = hash1(r * 7.1 + c * 19.3);
        cells.push({
          sx: px,
          sy: py,
          sw: pw,
          sh: ph,
          cx: gx + (px + pw / 2) / sheetScale,
          cy: gy + (py + ph / 2) / sheetScale,
          w: pw / sheetScale,
          h: ph / sheetScale,
          rot: (h1 - 0.5) * 0.24,
          spin: (h2 - 0.5) * 0.9,
          delay: h2 * 0.16,
          ink: img && n ? hit / n : 0.5,
        });
      }
    }

    /* ---- 一筆の経路＝字を横切って抜ける S 字 ---- */
    const S = fontSize;
    const mx = cw / 2;
    const my = ch / 2;
    path = makePath([
      { x: mx - S * 2.6, y: my - S * 0.62 },
      { x: mx - S * 1.15, y: my - S * 0.1 },
      { x: mx - S * 0.15, y: my + S * 0.3 },
      { x: mx + S * 0.95, y: my - S * 0.16 },
      { x: mx + S * 2.7, y: my + S * 0.5 },
    ]);

    if (!inkLayer) inkLayer = document.createElement("canvas");
    inkLayer.width = Math.round(cw * sheetScale);
    inkLayer.height = Math.round(ch * sheetScale);
    inkCtx = inkLayer.getContext("2d");
    inkCtx?.setTransform(sheetScale, 0, 0, sheetScale, 0, 0);
    inkDrawn = 0;
  }

  function advanceStroke(t: number) {
    if (light || !path || !inkCtx) return;
    const u = clamp01((t - T.strokeStart) / Math.max(0.01, T.strokeEnd - T.strokeStart));
    const want = easeIO(u);
    if (want <= inkDrawn + 0.0008) return;
    strokeBrush(inkCtx, path, inkDrawn, want, {
      rgb: OP_INK,
      width: fontSize * 0.17,
      bristles: 15,
      seed: 3.7,
      alpha: 0.6,
      dry: 0.55,
      profile: defaultProfile,
    });
    inkDrawn = want;
  }

  function drawGlyphs(ctx: CanvasRenderingContext2D, t: number, cw: number, ch: number) {
    if (!sheet) return;
    // 一筆は字に結ばれるにつれて退く
    if (inkLayer && !light) {
      const fade = 1 - clamp01((t - T.glyph0Start + 0.02) / 0.3) * 0.97;
      if (fade > 0.02) {
        ctx.globalAlpha = fade;
        ctx.drawImage(inkLayer, 0, 0, cw, ch);
        ctx.globalAlpha = 1;
      }
    }
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
      const from = done ? gx + gw + 40 : sweep;
      const to = done ? gx + gw + 39 : sweep - trail;
      const dry = done ? 0 : 0.52 * (1 - u * 0.55);
      const cut = done ? R + 4 : sweep;
      const sx0 = Math.max(0, (L - 6 - gx) * sheetScale);
      const sx1 = Math.min(sheet.width, (cut - gx) * sheetScale);
      if (sx1 - sx0 < 0.5) continue;
      sliceWithBrushEdge(
        ctx,
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
      if (!done) {
        const w = fontSize * 0.085 * (0.5 + defaultProfile(u));
        const lift = clamp01((u - 0.9) / 0.1);
        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = "lighter";
        drawNib(ctx, sweep, gy + ghh * 0.52, 1, 0.14, w, 0.75 * (1 - lift), OP_INK);
        ctx.globalCompositeOperation = prev;
      }
    }
  }

  function chips(n: number): OpChip[] {
    if (!cells.length) return [];
    // 墨の多いマスから n 個。字の主要な画が飛ぶ
    const picked = cells
      .slice()
      .sort((a, b) => b.ink - a.ink)
      .slice(0, Math.max(1, Math.min(n, cells.length)));
    // 左→右に並べ替えて返す（書類の席と素直に対応させ、経路を交差させない）
    return picked.sort((a, b) => a.cx - b.cx);
  }

  return {
    get ready() {
      return !!sheet;
    },
    get sheet() {
      return sheet;
    },
    get sheetScale() {
      return sheetScale;
    },
    bake,
    advanceStroke,
    drawGlyphs,
    chips,
    destroy() {
      sheet = null;
      inkLayer = null;
      inkCtx = null;
      path = null;
      cells = [];
    },
  };
}
