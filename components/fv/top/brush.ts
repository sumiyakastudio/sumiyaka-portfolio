/**
 * 筆 — 一本になった線が題字へ流れ込み、字画を書き上げる。
 *
 * 版下（glyphSheet）を左→右に切り出して描くことで「書かれていく」。切り出しには
 * 横方向のアルファ勾配を掛けてあり、
 *
 *      左端 ─── fadeX ────── sweepX ─── 右端
 *      （DOM が出切った）0 → 1（いま筆先）    まだ書いていない＝描かない
 *
 * fadeX = sweepX(t − letterFade)。つまり「筆が通った letterFade 秒後には版下が
 * 完全に透明になり、代わりに DOM の文字が出切っている」。
 * ★これにより、書き終えた題字の筆画の上には版下も筆先も一切残らない。
 *
 * canvas 2D のみ（filter・blend・3D 不使用＝iOS/WebKit 安全）。
 */

import { defaultProfile, drawNib, sliceWithBrushEdge } from "./inkBrush";
import type { GlyphSheet } from "./glyphSheet";
import type { TENKI_T } from "./tenkiTiming";

type Timing = typeof TENKI_T;

export interface WritePlan {
  /** 行ごとの開始・終了時刻（絶対秒・2 要素 × 行数） */
  lineT: number[];
  /** 掃引が終わる時刻 */
  end: number;
}

const easeIO = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 行の幅に比例して掃引時間を配り、行の間に「返し」の間を挟む */
export function planWrite(sheet: GlyphSheet, T: Timing): WritePlan {
  const n = sheet.lines.length;
  const lineT: number[] = [];
  if (!n) return { lineT, end: T.writeStart };
  let total = 0;
  for (const l of sheet.lines) total += l.width;
  total = Math.max(1, total);
  const moveT = n > 1 ? T.writeDur * T.returnShare : 0;
  const writeT = T.writeDur - moveT;
  const gapT = n > 1 ? moveT / (n - 1) : 0;
  let at = T.writeStart;
  for (let i = 0; i < n; i++) {
    const per = (writeT * sheet.lines[i].width) / total;
    lineT.push(at, at + per);
    at += per + gapT;
  }
  return { lineT, end: lineT[lineT.length - 1] };
}

/** 行 li の筆先 x（ステージ css 座標）。来ていなければ左端、書き終えていれば右端＋3 */
export function lineFront(plan: WritePlan, sheet: GlyphSheet, li: number, tt: number): number {
  const ln = sheet.lines[li];
  if (!ln) return 0;
  const a = plan.lineT[li * 2];
  const b = plan.lineT[li * 2 + 1];
  if (tt <= a) return ln.left;
  if (tt >= b) return ln.right + 3;
  const u = (tt - a) / Math.max(1e-4, b - a);
  const e = u * 0.32 + easeIO(u) * 0.68;
  return ln.left + (ln.right + 3 - ln.left) * e;
}

/** いま筆先はどこにいるか（返しの間は行から行への移動） */
export function brushHead(
  plan: WritePlan,
  sheet: GlyphSheet,
  tt: number
): { x: number; y: number; live: number } | null {
  const n = sheet.lines.length;
  if (!n) return null;
  if (tt < plan.lineT[0]) return null;
  for (let i = 0; i < n; i++) {
    const a = plan.lineT[i * 2];
    const b = plan.lineT[i * 2 + 1];
    const ln = sheet.lines[i];
    if (tt >= a && tt <= b) {
      return { x: lineFront(plan, sheet, i, tt), y: ln.midY, live: 1 };
    }
    if (i < n - 1 && tt > b && tt < plan.lineT[(i + 1) * 2]) {
      const u = clamp01((tt - b) / Math.max(1e-4, plan.lineT[(i + 1) * 2] - b));
      const e = easeIO(u);
      const nx = sheet.lines[i + 1];
      return {
        x: ln.right + 3 + (nx.left - ln.right - 3) * e,
        y: ln.midY + (nx.midY - ln.midY) * e,
        live: 1,
      };
    }
  }
  return { x: sheet.lines[n - 1].right + 3, y: sheet.lines[n - 1].midY, live: 0 };
}

export interface WriteDrawOptions {
  t: number;
  T: Timing;
  /** 墨の色（0-255）＝筆先・導線用。字そのものは版下の色（DOM と同じ）で出る */
  ink: [number, number, number];
  lit?: (x: number, y: number) => number;
}

/**
 * 版下を筆の通ったところまで描く（＝字画が書き上がっていく）。
 * 戻り値は「まだ 1 画素でも版下を描いた」かどうか。false なら題字の上は完全に空。
 */
export function drawWrittenGlyphs(
  ctx: CanvasRenderingContext2D,
  sheet: GlyphSheet,
  plan: WritePlan,
  o: WriteDrawOptions
): boolean {
  const sc = sheet.scale;
  const yLo = sheet.oy;
  const yHi = sheet.oy + sheet.sh;
  const xLo = sheet.ox;
  const xHi = sheet.ox + sheet.sw;
  let painted = false;

  for (let li = 0; li < sheet.lines.length; li++) {
    const ln = sheet.lines[li];
    const sweepX = lineFront(plan, sheet, li, o.t);
    const fadeX = lineFront(plan, sheet, li, o.t - o.T.letterFade);
    const xa = Math.max(xLo, ln.left - 2);
    const xb = Math.min(xHi, Math.min(sweepX, ln.right + 3));
    if (xb - xa < 0.5) continue; // まだ書いていない
    if (fadeX >= xb - 0.4) continue; // DOM へ渡し終えた＝版下は描かない

    const yTop = Math.max(yLo, ln.top - 2);
    const yBot = Math.min(yHi, ln.bottom + 2);
    const sx = (xa - sheet.ox) * sc;
    const sy = (yTop - sheet.oy) * sc;
    const sw = (xb - xa) * sc;
    const sh = (yBot - yTop) * sc;
    if (sw < 0.5 || sh < 0.5) continue;

    // かすれは「筆先の帯」の中だけに効く。通り過ぎた側の版下は勾配で必ず 0 になるので、
    // 書き終えた題字の筆画に穴が残ることはない。
    const done = sweepX >= ln.right + 2.9;
    const dry = done ? 0 : 0.55;
    if (
      sliceWithBrushEdge(
        ctx,
        sheet.canvas,
        sc,
        sx,
        sy,
        sw,
        sh,
        xa,
        yTop,
        xb - xa,
        yBot - yTop,
        fadeX,
        sweepX,
        dry,
        17.3 + li * 6.1
      )
    ) {
      painted = true;
    }
  }
  return painted;
}

/**
 * 筆先の灯と、まだ書いていない行に薄く残る導線（＝一本になった線の続き）。
 * 掃引が終わって brushOut 秒たてば何も描かない。
 */
export function drawBrushMarks(
  ctx: CanvasRenderingContext2D,
  sheet: GlyphSheet,
  plan: WritePlan,
  o: WriteDrawOptions
): boolean {
  const T = o.T;
  const tt = o.t;
  if (tt < T.writeStart - 0.001) return false;
  const out = clamp01((tt - plan.end) / Math.max(1e-3, T.brushOut));
  if (out >= 1) return false;
  const lit = o.lit ?? (() => 1);
  const col = (a: number) => `rgba(${o.ink[0]}, ${o.ink[1]}, ${o.ink[2]}, ${a})`;
  const fade = 1 - out;
  const lw = 1.15;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";

  /* 導線：これから書く行に、線の続きが薄く延びている（1 行目は帯そのものが担う） */
  const appear = clamp01((tt - T.writeStart) / 0.14);
  for (let li = 1; li < sheet.lines.length; li++) {
    const ln = sheet.lines[li];
    const x = Math.max(ln.left, lineFront(plan, sheet, li, tt));
    if (ln.right - x < 1) continue;
    const a = 0.22 * appear * fade * lit(x, ln.midY);
    if (a <= 0.01) continue;
    ctx.fillStyle = col(a);
    ctx.fillRect(x, ln.midY - lw / 2, ln.right - x, lw);
  }

  /* 返し：行から行へ筆が渡る軌跡 */
  for (let li = 0; li < sheet.lines.length - 1; li++) {
    const b = plan.lineT[li * 2 + 1];
    const a2 = plan.lineT[(li + 1) * 2];
    if (tt <= b || tt >= a2 + 0.12) continue;
    const u = clamp01((tt - b) / Math.max(1e-4, a2 - b));
    const alpha = 0.26 * (1 - clamp01((tt - a2) / 0.12)) * fade;
    const p0 = sheet.lines[li];
    const p1 = sheet.lines[li + 1];
    ctx.strokeStyle = col(alpha);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p0.right + 3, p0.midY);
    ctx.quadraticCurveTo(
      p0.right + 3 + (p1.left - p0.right - 3) * 0.5,
      p0.midY + (p1.midY - p0.midY) * 0.9,
      p0.right + 3 + (p1.left - p0.right - 3) * Math.max(u, 0.02),
      p0.midY + (p1.midY - p0.midY) * Math.max(u, 0.02)
    );
    ctx.stroke();
  }

  /* 筆先（穂先）＋その灯。字画の切れ目（返し）では持ち上がって薄くなる */
  const head = brushHead(plan, sheet, tt);
  if (head) {
    // いま何行目のどこを書いているか＝穂先の太さ（入り細・送り太・抜き細）
    let prof = 0.5;
    let lift = 1;
    for (let li = 0; li < sheet.lines.length; li++) {
      const a = plan.lineT[li * 2];
      const b = plan.lineT[li * 2 + 1];
      if (tt >= a && tt <= b) {
        prof = defaultProfile((tt - a) / Math.max(1e-4, b - a));
        break;
      }
    }
    if (!head.live) lift = 0.42;
    else if (prof < 0.3) lift = 0.55 + prof;
    const w = Math.max(1.6, sheet.fontPx * 0.075 * (0.45 + prof));
    const I = 0.62 * fade * lift * lit(head.x, head.y);
    drawNib(ctx, head.x, head.y, 1, 0.12, w, I, o.ink);
    const r = Math.max(9, sheet.fontPx * 0.3);
    const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, r);
    g.addColorStop(0, col(I * 0.36));
    g.addColorStop(1, col(0));
    ctx.fillStyle = g;
    ctx.fillRect(head.x - r, head.y - r, r * 2, r * 2);
  }

  ctx.globalCompositeOperation = prev;
  return true;
}
