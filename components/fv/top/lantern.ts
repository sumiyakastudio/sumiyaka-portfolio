/**
 * 灯 — canvas 2D の加算光球（旧 HeroInkLight から移植・iOS 実機実証済みの手法）
 *
 *  - 基調 3 点（右上＝主灯・左下・右下）が常時ゆっくり明滅し、ときおり谷を踏む。
 *  - 点灯（ignite）：題字が定着した瞬間、題字の真上に一点「ふっ」とともる → 常時の明滅へ合流。
 *  - 火の粉は最小限（PC 4・軽量 3）。左右の帯にだけ湧く。
 *  - 手元の灯：PC ではポインタに淡い灯が追従する。
 *  - スクロール退場（exit）：灯が遠のく＝暗くなりながら上へ。
 *  - getLights()：粒の照明用に u 空間（x∈[0,aspect]・y∈[0,1]）の位置と強さを返す。
 *  純モノトーン＝白系のみ（金は使わない）。
 */

import { SUMI } from "@/components/fv/contract";

const TAU = Math.PI * 2;
const colG = (a: number) => `rgba(${SUMI.glowRGB}, ${a})`;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface OrbDef {
  bx: number; by: number; rr: number;
  ax: number; ay: number; w1: number; w2: number;
  base: number; dipL: number; dipOff: number; depth: number;
}

/** 基調 3 点：中央の題字帯を幾何的に避けた配置（右上が主灯） */
const ORB_DEFS: OrbDef[] = [
  { bx: 0.80, by: 0.26, rr: 0.30, ax: 0.040, ay: 0.026, w1: 0.045, w2: 0.036, base: 0.60, dipL: 12, dipOff: 5, depth: 0.50 },
  { bx: 0.12, by: 0.76, rr: 0.20, ax: 0.028, ay: 0.020, w1: 0.033, w2: 0.052, base: 0.45, dipL: 15, dipOff: 8, depth: 0.70 },
  { bx: 0.91, by: 0.85, rr: 0.11, ax: 0.018, ay: 0.012, w1: 0.056, w2: 0.030, base: 0.33, dipL: 17, dipOff: 12, depth: 0.75 },
];

/** 点灯オーブ：題字の真上（x は題字の実測中心へ追従） */
const IGNITE_DEF: OrbDef = {
  bx: 0.50, by: 0.17, rr: 0.17, ax: 0.014, ay: 0.010, w1: 0.030, w2: 0.024,
  base: 0.58, dipL: 19, dipOff: 3, depth: 0.40,
};

export interface LanternAPI {
  resize(): void;
  /** 時間を進めて描く */
  step(dt: number): void;
  /** 静止 1 コマ（安定位相・点灯済みの状態で描く） */
  drawStatic(ignited: boolean): void;
  ignite(): void;
  /**
   * 幕の段階。mainK＝主灯（右上）の強さ、ambientK＝それ以外（副灯・点灯・火の粉・
   * 手元の灯）の強さ。OP のあいだは mainK だけを立ち上げ、灯を 1 つに保つ。
   */
  setPhase(mainK: number, ambientK: number): void;
  /** ポインタ（0..1 正規化） */
  setPointer(x: number, y: number, on: boolean): void;
  /** 題字の中心 x（0..1） */
  setIgniteX(x: number): void;
  setExit(v: number): void;
  /** 粒の照明：u 空間 [x, y, I] × 3（主灯・点灯・手元） */
  getLights(out: Float32Array): void;
  destroy(): void;
}

export function createLantern(
  canvas: HTMLCanvasElement,
  opts: { full: boolean; dpr: number }
): LanternAPI | null {
  const gctx = canvas.getContext("2d");
  if (!gctx) return null;
  const full = opts.full;
  const DPR = full ? Math.min(opts.dpr || 1, 1.75) : 1;

  let cw = 0;
  let ch = 0;
  let mind = 1;
  let t = 0;
  let exit = 0;
  let igniteX = IGNITE_DEF.bx;
  let mainK = 1;
  let ambK = 1;

  interface Orb { def: OrbDef; p1: number; p2: number; f1: number; f2: number; }
  const orbs: Orb[] = ORB_DEFS.map((d, i) => ({
    def: d,
    p1: i * 1.7 + 0.4,
    p2: i * 2.3 + 1.1,
    f1: i * 0.9,
    f2: i * 1.9 + 0.6,
  }));
  const igniteOrb = { born: null as number | null, p1: 0.9, p2: 2.6, f1: 1.3, f2: 0.5 };
  const lantern = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, I: 0, on: false };

  /** 照明の記録（描画時に更新） */
  const lights = new Float32Array(9);

  function sizeAll() {
    cw = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
    ch = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
    mind = Math.min(cw, ch) || 1;
    canvas.width = Math.max(1, Math.round(cw * DPR));
    canvas.height = Math.max(1, Math.round(ch * DPR));
  }

  function flicker(o: Orb, tt: number) {
    const d = o.def;
    const f = 0.74 + 0.16 * Math.sin(tt * 0.53 + o.p1) + 0.1 * Math.sin(tt * 1.31 + o.p2);
    const u = (tt + d.dipOff) % d.dipL;
    const DUR = 3.4;
    let dip = 1;
    if (u < DUR) {
      const s = Math.sin((Math.PI * u) / DUR);
      dip = 1 - d.depth * s * s;
    }
    return Math.max(0.05, d.base * f * dip);
  }

  function drawGlowBall(x: number, y: number, R: number, I: number) {
    if (R < 2 || I <= 0.002) return;
    let g = gctx!.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, colG(Math.min(1, I * 0.5)));
    g.addColorStop(0.35, colG(Math.min(1, I * 0.16)));
    g.addColorStop(1, colG(0));
    gctx!.fillStyle = g;
    gctx!.fillRect(x - R, y - R, R * 2, R * 2);
    const rc = Math.max(2.5, R * 0.06);
    g = gctx!.createRadialGradient(x, y, 0, x, y, rc);
    g.addColorStop(0, colG(Math.min(1, I * 0.9)));
    g.addColorStop(1, colG(0));
    gctx!.fillStyle = g;
    gctx!.fillRect(x - rc, y - rc, rc * 2, rc * 2);
  }

  function drawOrb(o: Orb, tt: number, i: number, dim: number) {
    const d = o.def;
    const x = d.bx * cw + Math.sin(tt * d.w1 * TAU + o.f1) * d.ax * mind;
    const y = d.by * ch + Math.sin(tt * d.w2 * TAU + o.f2) * d.ay * mind;
    const R = d.rr * mind * (1 + 0.05 * Math.sin(tt * 0.21 + o.p1));
    const I = flicker(o, tt) * dim;
    drawGlowBall(x, y, R, I);
    if (i === 0) {
      lights[0] = x / ch;
      lights[1] = y / ch;
      lights[2] = I * 1.6;
    }
  }

  /** 点灯オーブ：born からの立ち上がり（ふっと点る）→ 常時明滅へ合流 */
  function drawIgnite(tt: number, dim: number) {
    lights[5] = 0;
    if (igniteOrb.born === null) return;
    const u = tt - igniteOrb.born;
    if (u <= 0) return;
    const d = IGNITE_DEF;
    const rise = 1 - Math.pow(1 - Math.min(u / 1.15, 1), 3);
    const bloom = 1 + 0.38 * Math.exp(-u * 1.5) * Math.sin(Math.min(u, 2.6) * 4.4);
    const env = rise * Math.max(0, bloom);
    if (env <= 0.001) return;
    const settle = Math.min(1, Math.max(0, (u - 4) / 5));
    const fRaw = 0.74 + 0.16 * Math.sin(tt * 0.5 + igniteOrb.p1) + 0.1 * Math.sin(tt * 1.24 + igniteOrb.p2);
    const uu = (tt + d.dipOff) % d.dipL;
    let dip = 1;
    if (uu < 3.4) {
      const s = Math.sin((Math.PI * uu) / 3.4);
      dip = 1 - d.depth * s * s;
    }
    const flRaw = fRaw * dip;
    const fl = flRaw + (Math.max(flRaw, 0.82) - flRaw) * (1 - settle);
    const x = igniteX * cw + Math.sin(tt * d.w1 * TAU + igniteOrb.f1) * d.ax * mind;
    const y = d.by * ch + Math.sin(tt * d.w2 * TAU + igniteOrb.f2) * d.ay * mind;
    const R = d.rr * mind * (0.55 + 0.45 * rise) * (1 + 0.05 * Math.sin(tt * 0.23 + igniteOrb.p1));
    const I = d.base * fl * env * dim;
    drawGlowBall(x, y, R, I);
    lights[3] = x / ch;
    lights[4] = y / ch;
    lights[5] = I * 1.8;
  }

  /* 火の粉：左右の帯にだけ湧く（題字帯を横切らない） */
  interface Ember { x: number; y: number; vy: number; sway: number; ph: number; tw: number; r: number; }
  const embers: Ember[] = [];
  function emberX() {
    return Math.random() < 0.5 ? rand(0.02, 0.24) : rand(0.76, 0.99);
  }
  function initEmbers() {
    embers.length = 0;
    const n = full ? 4 : 3;
    for (let i = 0; i < n; i++) {
      embers.push({
        x: emberX(),
        y: rand(0, 1),
        vy: rand(6, 13),
        sway: rand(4, 9),
        ph: rand(0, TAU),
        tw: rand(0, TAU),
        r: rand(0.9, 1.6),
      });
    }
  }
  function drawEmbers(dt: number, tt: number, dim: number) {
    for (const e of embers) {
      if (dt > 0) {
        e.y -= (e.vy / ch) * dt;
        e.x += Math.sin(tt * 0.6 + e.ph) * (e.sway / cw) * dt;
        if (e.y < -0.03) {
          e.y = 1.04;
          e.x = emberX();
        }
      }
      const edge = Math.min(1, Math.min(e.y, 1.05 - e.y) * 8 + 0.1);
      const a = (0.07 + 0.2 * (0.5 + 0.5 * Math.sin(tt * 0.9 + e.tw))) * Math.max(0, edge) * dim;
      gctx!.fillStyle = colG(a);
      gctx!.beginPath();
      gctx!.arc(e.x * cw, e.y * ch, e.r, 0, TAU);
      gctx!.fill();
    }
  }

  /* 手元の灯（ポインタ追従・PC のみ） */
  function drawLantern(dt: number, dim: number) {
    lights[8] = 0;
    if (!full) return;
    if (dt > 0) {
      lantern.x += (lantern.tx - lantern.x) * Math.min(1, 2.7 * dt);
      lantern.y += (lantern.ty - lantern.y) * Math.min(1, 2.7 * dt);
      const target = lantern.on ? 0.3 : 0;
      lantern.I += (target - lantern.I) * Math.min(1, 2 * dt);
    }
    if (lantern.I < 0.01) return;
    const R = mind * 0.12;
    const x = lantern.x * cw;
    const y = lantern.y * ch;
    const g = gctx!.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, colG(lantern.I * 0.5 * dim));
    g.addColorStop(0.4, colG(lantern.I * 0.16 * dim));
    g.addColorStop(1, colG(0));
    gctx!.fillStyle = g;
    gctx!.fillRect(x - R, y - R, R * 2, R * 2);
    lights[6] = x / ch;
    lights[7] = y / ch;
    lights[8] = lantern.I * 1.2 * dim;
  }

  function draw(dt: number) {
    const dim = 1 - exit * 0.85;
    gctx!.setTransform(DPR, 0, 0, DPR, 0, -exit * ch * 0.22 * DPR);
    gctx!.clearRect(0, exit * ch * 0.22, cw, ch);
    gctx!.globalCompositeOperation = "lighter";
    orbs.forEach((o, i) => drawOrb(o, t, i, dim * (i === 0 ? mainK : ambK)));
    drawIgnite(t, dim * ambK);
    drawEmbers(dt, t, dim * ambK);
    drawLantern(dt, dim * ambK);
    gctx!.globalCompositeOperation = "source-over";
    // 退場中は照明も上へ
    lights[1] -= exit * 0.22;
    lights[4] -= exit * 0.22;
  }

  sizeAll();
  initEmbers();

  return {
    resize: sizeAll,
    step(dt) {
      t += dt;
      draw(dt);
    },
    drawStatic(ignited) {
      // 安定位相（明滅の谷にいない t=5.6）で静止 1 コマ。点灯済みなら安定状態
      t = 5.6;
      igniteOrb.born = ignited ? t - 9 : null;
      draw(0);
    },
    ignite() {
      if (igniteOrb.born !== null) return;
      igniteOrb.born = t;
    },
    setPhase(nextMain, nextAmbient) {
      mainK = Math.min(1, Math.max(0, nextMain));
      ambK = Math.min(1, Math.max(0, nextAmbient));
    },
    setPointer(x, y, on) {
      lantern.tx = x;
      lantern.ty = y;
      if (on && !lantern.on) {
        lantern.x = x;
        lantern.y = y;
      }
      lantern.on = on;
    },
    setIgniteX(x) {
      igniteX = Math.min(0.9, Math.max(0.1, x));
    },
    setExit(v) {
      exit = Math.min(1, Math.max(0, v));
    },
    getLights(out) {
      out.set(lights);
    },
    destroy() {
      embers.length = 0;
    },
  };
}
