/**
 * 筆の質感 — 可変幅・かすれ・筆先。
 *
 * OP「一筆と灯」と FV の題字（版下の切り出し）が同じ手触りになるよう、
 * 筆に関する描画をここへ集めた。canvas 2D のみ（filter・blend・3D 不使用）。
 *
 *  - 幅  ：入り（細い）→ 送り（太い）→ 抜き（細い）。profile() で与える
 *  - かすれ：ストロークを「毛」の集合として描き、毛ごとに縦（横断）位置と
 *          長手方向の濃度ゆらぎを持たせる。ゆらぎが谷に入ると筆が紙から
 *          離れて線が切れる＝かすれ
 *  - 筆先 ：進行方向へ尖った雫。字画の切れ目では持ち上がる（alpha を落とす）
 */

export interface Pt {
  x: number;
  y: number;
}

export interface BrushPath {
  at(u: number): { x: number; y: number; tx: number; ty: number };
  total: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 決定的な 0..1 の乱数（座標や添字から） */
export function hash1(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/** 長手方向の濃度ゆらぎ。谷に入ると紙から離れる＝かすれ */
function dryAt(u: number, b: number, seed: number): number {
  const a = Math.sin(u * 33.7 + b * 2.31 + seed) * 0.5 + 0.5;
  const c = Math.sin(u * 87.3 - b * 1.77 + seed * 1.7) * 0.5 + 0.5;
  const d = Math.sin(u * 11.9 + b * 0.63 - seed * 0.9) * 0.5 + 0.5;
  return a * 0.45 + c * 0.3 + d * 0.25;
}

/** 既定の幅プロファイル：入り細 → 送り太 → 抜き細（抜きは長く伸びる） */
export function defaultProfile(u: number): number {
  const inn = clamp01(u / 0.16); // 入り：素早く太る
  const out = 1 - Math.pow(clamp01((u - 0.55) / 0.45), 1.7); // 抜き：じわじわ細る
  const body = 0.72 + 0.28 * Math.sin(u * Math.PI); // 送りの膨らみ
  return Math.max(0, inn * out * body);
}

/** 制御点を Catmull-Rom で密にサンプルした経路を作る */
export function makePath(ctrl: Pt[], samples = 220): BrushPath {
  const src = ctrl.length >= 2 ? ctrl : [ctrl[0] ?? { x: 0, y: 0 }, ctrl[0] ?? { x: 1, y: 0 }];
  const n = src.length;
  const get = (i: number) => src[Math.max(0, Math.min(n - 1, i))];
  const pts: Pt[] = [];
  if (n === 2) {
    for (let i = 0; i <= samples; i++) {
      const s = i / samples;
      pts.push({ x: src[0].x + (src[1].x - src[0].x) * s, y: src[0].y + (src[1].y - src[0].y) * s });
    }
  } else {
    const per = Math.max(2, Math.round(samples / (n - 1)));
    for (let seg = 0; seg < n - 1; seg++) {
      const p0 = get(seg - 1);
      const p1 = get(seg);
      const p2 = get(seg + 1);
      const p3 = get(seg + 2);
      for (let i = 0; i < per; i++) {
        const s = i / per;
        const s2 = s * s;
        const s3 = s2 * s;
        pts.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * s + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * s + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3),
        });
      }
    }
    pts.push({ x: src[n - 1].x, y: src[n - 1].y });
  }

  const acc: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = acc[acc.length - 1] || 1;

  return {
    total,
    at(u: number) {
      const d = clamp01(u) * total;
      let lo = 0;
      let hi = acc.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (acc[mid] <= d) lo = mid;
        else hi = mid;
      }
      const span = Math.max(1e-6, acc[hi] - acc[lo]);
      const s = (d - acc[lo]) / span;
      const a = pts[lo];
      const b = pts[hi];
      let tx = b.x - a.x;
      let ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, tx, ty };
    },
  };
}

export interface BrushStyle {
  /** 墨の色（0-255） */
  rgb: [number, number, number];
  /** 最大の筆幅（css px） */
  width: number;
  /** 毛の本数（既定 11） */
  bristles?: number;
  seed?: number;
  /** 全体の濃さ */
  alpha?: number;
  /** 幅のプロファイル */
  profile?: (u: number) => number;
  /** かすれの強さ 0（べた）〜1（かすれ切る） */
  dry?: number;
}

/**
 * 経路の [from, to] 区間を筆で引く。毛の集合として描くので、
 * 幅の変化・かすれ・穂先のばらけが同時に出る。加算合成で呼ぶこと。
 */
export function strokeBrush(
  ctx: CanvasRenderingContext2D,
  p: BrushPath,
  from: number,
  to: number,
  s: BrushStyle
): void {
  const a0 = clamp01(from);
  const a1 = clamp01(to);
  if (a1 - a0 < 1e-4) return;
  const N = s.bristles ?? 11;
  const seed = s.seed ?? 7;
  const base = s.alpha ?? 1;
  const prof = s.profile ?? defaultProfile;
  const dry = s.dry ?? 0.5;
  const [r, g, b] = s.rgb;
  // 3px 前後の刻みで歩く（長いストロークでも点数が増えすぎない）
  const steps = Math.max(8, Math.min(420, Math.round((p.total * (a1 - a0)) / 2.6)));
  const du = (a1 - a0) / steps;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let bi = 0; bi < N; bi++) {
    const v = (bi + 0.5) / N - 0.5;
    const h = hash1(seed * 13.7 + bi * 3.1);
    // 端の毛ほど薄い（穂先のばらけ）
    const edge = 1 - Math.pow(Math.abs(v) * 2, 2.2) * 0.72;
    const aBase = base * edge * (0.5 + 0.5 * h);
    let open = false;
    let lw = -1;
    let al = -1;
    let lastX = 0;
    let lastY = 0;
    /** 太さ・濃さが段替わりしたら、いまの点で一度閉じてから続きを引く
     *  （閉じる前に必ず lineTo するので、点だけの空パスにならない） */
    const relay = (x: number, y: number, nlw: number, na: number) => {
      if (open) {
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      lw = nlw;
      al = na;
      ctx.lineWidth = nlw;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${na.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      open = true;
    };
    for (let i = 0; i <= steps; i++) {
      const u = a0 + du * i;
      const w = prof(u) * s.width;
      if (w <= 0.15) {
        if (open) {
          ctx.lineTo(lastX, lastY);
          ctx.stroke();
          open = false;
        }
        continue;
      }
      // かすれ：長手方向のゆらぎが閾値を割ると紙から離れる。抜きほど乾く
      const thr = dry * (0.24 + 0.5 * clamp01((u - 0.45) / 0.55)) + Math.abs(v) * dry * 0.34;
      const wet = dryAt(u, bi, seed);
      const q = p.at(u);
      const nx = -q.ty;
      const ny = q.tx;
      // 毛は幅に応じて広がり、わずかに波打つ
      const jitter = (hash1(seed + bi * 5.3 + Math.floor(u * 90)) - 0.5) * w * 0.06;
      const x = q.x + nx * (v * w + jitter);
      const y = q.y + ny * (v * w + jitter);
      if (wet < thr) {
        if (open) {
          ctx.lineTo(x, y);
          ctx.stroke();
          open = false;
        }
        lastX = x;
        lastY = y;
        continue;
      }
      const dens = clamp01((wet - thr) / 0.32);
      // 段（0.6px / 0.06）に丸めて、同じ段のあいだは 1 本の折れ線で引く
      const nlw = Math.max(0.7, Math.round(((w / N) * 1.9) / 0.6) * 0.6);
      const na = Math.max(0.02, Math.round((aBase * (0.45 + 0.55 * dens)) / 0.06) * 0.06);
      if (!open || nlw !== lw || na !== al) relay(x, y, nlw, na);
      else ctx.lineTo(x, y);
      lastX = x;
      lastY = y;
    }
    if (open) {
      ctx.lineTo(lastX, lastY);
      ctx.stroke();
    }
  }
}

/** 筆先（穂先）— 進行方向へ尖った雫。alpha を落とせば「持ち上がる」 */
export function drawNib(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tx: number,
  ty: number,
  w: number,
  alpha: number,
  rgb: [number, number, number]
): void {
  if (alpha <= 0.004 || w <= 0.3) return;
  const [r, g, b] = rgb;
  const nx = -ty;
  const ny = tx;
  const back = w * 1.15;
  const tip = w * 1.5;
  ctx.beginPath();
  ctx.moveTo(x + tx * tip, y + ty * tip);
  ctx.quadraticCurveTo(x + nx * w * 0.62, y + ny * w * 0.62, x - tx * back, y - ty * back);
  ctx.quadraticCurveTo(x - nx * w * 0.62, y - ny * w * 0.62, x + tx * tip, y + ty * tip);
  ctx.closePath();
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(alpha * 0.7).toFixed(3)})`;
  ctx.fill();
  // 穂先の濡れた光り
  const gr = ctx.createRadialGradient(x, y, 0, x, y, w * 2.1);
  gr.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${(alpha * 0.5).toFixed(3)})`);
  gr.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(x - w * 2.1, y - w * 2.1, w * 4.2, w * 4.2);
}

let scratch: HTMLCanvasElement | null = null;

/**
 * 版下（offscreen）を「筆が通ったところまで」切り出して描く。
 *
 *   gradFrom（出力 css x）… ここより左は完全に透明（DOM へ渡し終えた／まだ乾いていない）
 *   gradTo               … 筆先。ここまでが 100%
 *
 * 勾配のうえに「かすれ縞」を destination-out で重ねるので、筆の縁が乾いて見える。
 * 縞は帯の中だけに効き、通り過ぎた側は必ず 0（＝題字の上に何も残らない）。
 */
export function sliceWithBrushEdge(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLCanvasElement,
  scale: number,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  gradFrom: number,
  gradTo: number,
  dry: number,
  seed: number
): boolean {
  if (sw < 0.5 || sh < 0.5 || typeof document === "undefined") return false;
  if (!scratch) scratch = document.createElement("canvas");
  const pw = Math.ceil(sw) + 2;
  const ph = Math.ceil(sh) + 2;
  if (scratch.width < pw || scratch.height < ph) {
    scratch.width = Math.max(scratch.width, pw);
    scratch.height = Math.max(scratch.height, ph);
  }
  const sc = scratch.getContext("2d");
  if (!sc) return false;
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = "source-over";
  sc.globalAlpha = 1;
  sc.clearRect(0, 0, scratch.width, scratch.height);
  sc.drawImage(sheet, sx, sy, sw, sh, 0, 0, sw, sh);

  // 出力 css → scratch 画素へ。
  // gradFrom が濃度 0・gradTo が濃度 1。to < from（左向き）でもよい＝
  // 「筆先が濃度 0 で、通り過ぎた側が 1」という OP の向きもこれで書ける。
  const toPx = (v: number) => ((v - dx) / Math.max(1e-6, dw)) * sw;
  const g0 = toPx(gradFrom);
  let g1 = toPx(gradTo);
  if (Math.abs(g1 - g0) < 1) g1 = g0 + (g1 >= g0 ? 1 : -1);

  sc.globalCompositeOperation = "destination-in";
  const grad = sc.createLinearGradient(g0, 0, g1, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(255,255,255,1)");
  sc.fillStyle = grad;
  sc.fillRect(0, 0, sw, sh);

  // かすれ：筆先の帯にだけ、横方向の細い抜けを入れる
  if (dry > 0.01) {
    sc.globalCompositeOperation = "destination-out";
    const bandL = Math.max(0, Math.min(g0, g1));
    const bandR = Math.min(sw, Math.max(g0, g1));
    const lines = Math.max(3, Math.round(sh / (6 * scale)));
    for (let i = 0; i < lines; i++) {
      const hy = hash1(seed + i * 7.13);
      const y = hy * sh;
      const th = (0.6 + hash1(seed + i * 3.7) * 1.6) * scale;
      const a = dry * (0.22 + 0.5 * hash1(seed + i * 11.1));
      const off = hash1(seed + i * 5.9) * 0.5;
      const x0 = bandL + (bandR - bandL) * off * 0.6;
      const x1 = Math.min(bandR, x0 + (bandR - x0) * (0.35 + hash1(seed + i) * 0.65));
      if (x1 - x0 < 1) continue;
      const st = sc.createLinearGradient(x0, 0, x1, 0);
      st.addColorStop(0, `rgba(0,0,0,0)`);
      st.addColorStop(0.5, `rgba(0,0,0,${a.toFixed(3)})`);
      st.addColorStop(1, `rgba(0,0,0,0)`);
      sc.fillStyle = st;
      sc.fillRect(x0, y - th / 2, x1 - x0, th);
    }
  }
  sc.globalCompositeOperation = "source-over";
  ctx.drawImage(scratch, 0, 0, sw, sh, dx, dy, dw, dh);
  return true;
}
