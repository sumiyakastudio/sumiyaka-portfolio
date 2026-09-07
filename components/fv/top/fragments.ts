/**
 * 転記の断片 — 事務のデータの断片（CSV の行 / Excel の升目 / PDF の紙片）。
 *
 * 抽象な粒ではなく「実務のデータ」で軸コピーを演じるための素材。
 *   散らばり  紙として読める大きさで、角度も大きさもばらばらに漂う
 *             （見出し行が濃く、データ行が数本、右端に数値を表す短い棒。落ち影つき）
 *   整列      誰も触らないのに回転が戻り、水平に揃う。揃う瞬間に小さく行き過ぎて
 *             戻る（カチッ）＋縁が一瞬光る＝「揃った」が分かる
 *   連結      隣の断片と端が橋で繋がり、繋がった線を左→右へ光が走る
 *   一本化    行が中心へ寄り、枠・升目・見出しが消え、1 本の細い線になる
 *
 * ⚠ 実在しそうな会社名・金額・日付・氏名は一切描かない（捏造になる）。
 *   中身は「罫」と「桁を表す短い棒」だけの抽象。ラベルは拡張子の 3〜4 文字のみ。
 *
 * 描画は canvas 2D のみ（filter・blend・3D は使わない＝iOS/WebKit 安全）。
 */

export type FragKind = 0 | 1 | 2; // 0=CSV(行) 1=XLSX(升目) 2=PDF(紙片)

const LABELS: readonly string[] = ["CSV", "XLSX", "PDF"];
/** 行数は奇数。中央（index 2）が「背骨」＝一本化したときに残る行 */
const ROWS = 5;
const MID = (ROWS - 1) / 2;

export interface Frag {
  kind: FragKind;
  label: string;
  /** 散らばりの位置・角度・寸法（ステージ css 座標） */
  sx: number;
  sy: number;
  rot: number;
  w0: number;
  h0: number;
  /** 漂いの振幅・角速度・位相 */
  ax: number;
  ay: number;
  w1: number;
  w2: number;
  p1: number;
  p2: number;
  /** 整列後の席（帯を等分した何番目か）。実座標は描画時に帯から求める */
  slot: number;
  /** 整列の時差（0..1 のうち自分が動く区間） */
  d0: number;
  d1: number;
  /** 升目の列数（XLSX のみ） */
  cols: number;
  /** 行ごとの区間 [x0,x1]（0..1・ROWS×2） */
  runs: number[];
  /** 見出しのセル境界（0..1） */
  heads: number[];
  /** 値を表す短い棒 [row, x0, x1] × k */
  bars: number[];
}

export interface FragRow {
  /** 帯の中心 y と左右端（ステージ css 座標） */
  y: number;
  left: number;
  right: number;
  h: number;
}

export interface FragConfig {
  row: FragRow;
  /** 散らばりの領域 [x0, y0, x1, y1] */
  region: [number, number, number, number];
  count: number;
  seed?: number;
}

export interface DrawFragOptions {
  /** ステージ時計（秒）＝漂いと「揃った合図」の判定に使う */
  t: number;
  /** 整列 0..1（全体） */
  align: number;
  /** 連結 0..1（橋がかかり、光が左→右へ走る） */
  connect: number;
  /** 一本化 0..1 */
  collapse: number;
  /** 全体の不透明度 */
  alpha: number;
  /** 墨の色（0-255） */
  ink: [number, number, number];
  /** ラベルの書体（ctx.font 形式） */
  labelFont: string;
  /** 整列が始まる時刻・所要（カチッの時刻を求めるため） */
  alignStart: number;
  alignDur: number;
  /** 灯からの明るさ 0.5..1 を返す（ステージ css 座標） */
  lit?: (x: number, y: number) => number;
  /** 断片ごとの整列進捗を外から与える（静止 1 コマ用） */
  progressOf?: (i: number, n: number) => number;
  /** 断片ごとの一本化を外から与える（静止 1 コマ用） */
  collapseOf?: (i: number, n: number) => number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a || 1e-6));
  return u * u * (3 - 2 * u);
};
const easeIO = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
/** 行き過ぎて戻る＝「カチッ」と揃った手ごたえ */
const easeBack = (u: number) => {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const c1 = 1.24;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
};

/** 決定的な乱数（リサイズで絵が踊らない） */
function mkRand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 帯（整列後の一列）＝題字の 1 行目の位置と幅 */
export function rowFromSheet(sheet: {
  lines: { left: number; right: number; midY: number }[];
  fontPx: number;
}): FragRow {
  const l0 = sheet.lines[0];
  return {
    y: l0.midY,
    left: l0.left,
    right: l0.right,
    h: Math.max(14, Math.min(34, sheet.fontPx * 0.46)),
  };
}

/** 散らばりの領域＝題字の周り（題字より少し広く、画面の縁は避ける） */
export function regionFromSheet(
  sheet: { h1L: number; h1T: number; h1R: number; h1B: number },
  W: number,
  H: number
): [number, number, number, number] {
  const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  return [
    cl(sheet.h1L - H * 0.15, W * 0.04, W * 0.46),
    cl(sheet.h1T - H * 0.19, H * 0.06, H * 0.42),
    cl(sheet.h1R + H * 0.15, W * 0.54, W * 0.96),
    cl(sheet.h1B + H * 0.05, H * 0.58, H * 0.9),
  ];
}

/** 断片の数＝8〜10 枚。1 枚を大きく取り、表として読めるようにする */
export function countForRow(row: FragRow): number {
  return Math.max(8, Math.min(10, Math.round((row.right - row.left) / 86)));
}

export function buildFragments(cfg: FragConfig): Frag[] {
  const rnd = mkRand(cfg.seed ?? 20260907);
  const n = Math.max(3, cfg.count);
  const row = cfg.row;
  const [rx0, ry0, rx1, ry1] = cfg.region;
  const slot = (row.right - row.left) / n;
  const gap = Math.min(slot * 0.16, 10);

  // 散らばりの席（ジッタ付き格子）＝重なり過ぎを避ける。席の割り当ては無作為
  const regW = Math.max(1, rx1 - rx0);
  const regH = Math.max(1, ry1 - ry0);
  const cols = Math.max(2, Math.round(Math.sqrt((n * regW) / Math.max(1, regH))));
  const rowsN = Math.max(2, Math.ceil(n / cols));
  const seats: number[] = [];
  for (let i = 0; i < cols * rowsN; i++) seats.push(i);
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = seats[i];
    seats[i] = seats[j];
    seats[j] = tmp;
  }

  const frags: Frag[] = [];
  for (let i = 0; i < n; i++) {
    const kind = (i % 3) as FragKind;
    const seat = seats[i];
    const cx = seat % cols;
    const cy = Math.floor(seat / cols);
    const sx = rx0 + ((cx + 0.5 + (rnd() - 0.5) * 0.62) / cols) * regW;
    const sy = ry0 + ((cy + 0.5 + (rnd() - 0.5) * 0.62) / rowsN) * regH;

    const tw = slot - gap;
    const th = row.h;
    // 紙として読める大きさ（整列後よりひとまわり大きい）
    const w0 = tw * (0.98 + rnd() * 0.62);
    const h0 = Math.min(th * 2.9, w0 * (0.5 + rnd() * 0.24));

    const runs: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      if (r === 0) {
        runs.push(0.06, 0.94); // 見出しは端まで
        continue;
      }
      const a = 0.06 + rnd() * 0.1;
      const b = 0.52 + rnd() * 0.36;
      runs.push(a, Math.max(a + 0.16, b));
    }
    const heads: number[] = [];
    const hc = 2 + Math.floor(rnd() * 2);
    for (let k = 1; k <= hc; k++) heads.push(k / (hc + 1));
    const bars: number[] = [];
    const nb = kind === 2 ? 1 : 3;
    for (let k = 0; k < nb; k++) {
      const r = 1 + Math.floor(rnd() * (ROWS - 1));
      const w = 0.08 + rnd() * 0.14;
      bars.push(r, 0.94 - w, 0.94);
    }

    frags.push({
      kind,
      label: LABELS[kind],
      sx,
      sy,
      rot: (rnd() - 0.5) * 0.9,
      w0,
      h0,
      ax: 3 + rnd() * 7,
      ay: 2.5 + rnd() * 6,
      w1: 0.45 + rnd() * 0.6,
      w2: 0.36 + rnd() * 0.6,
      p1: rnd() * 6.28,
      p2: rnd() * 6.28,
      slot: i,
      d0: (i / n) * 0.36,
      d1: (i / n) * 0.36 + 0.64,
      cols: kind === 1 ? 3 + Math.floor(rnd() * 2) : 1,
      runs,
      heads,
      bars,
    });
  }
  return frags;
}

/**
 * 断片を描く。align / connect / collapse は 0..1。
 * 紙（落ち影つきの面）は source-over、罫と光は lighter で描く。
 */
export function drawFragments(
  ctx: CanvasRenderingContext2D,
  frags: Frag[],
  row: FragRow,
  o: DrawFragOptions
): void {
  const n = frags.length;
  if (!n || o.alpha <= 0.003) return;
  const [ir, ig, ib] = o.ink;
  const col = (a: number) => `rgba(${ir}, ${ig}, ${ib}, ${a})`;
  const lit = o.lit ?? (() => 1);
  const lw = 1.15;
  const slotW = (row.right - row.left) / n;
  const slotGap = Math.min(slotW * 0.16, 10);
  const bridgeK = smooth(0.5, 1, o.align);
  // 連結の光が通ったあとは、線がひとつながりに明るくなる
  const connLit = 0.32 * smooth(0, 0.85, o.connect);

  const bx: number[] = [];
  const by: number[] = [];
  const bw: number[] = [];

  const prev = ctx.globalCompositeOperation;
  ctx.lineCap = "butt";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  for (let i = 0; i < n; i++) {
    const f = frags[i];
    const raw = o.progressOf
      ? clamp01(o.progressOf(i, n))
      : clamp01((o.align - f.d0) / (f.d1 - f.d0));
    // 位置は「行き過ぎて戻る」、寸法は素直に（形が跳ねないように）
    const pb = o.progressOf ? raw : easeBack(raw);
    const p = o.progressOf ? raw : easeIO(raw);
    const conv = o.collapseOf ? clamp01(o.collapseOf(i, n)) : o.collapse;

    const tx = row.left + (f.slot + 0.5) * slotW;
    const ty = row.y;
    const tw = slotW - slotGap;
    const th = row.h;

    const dx = f.sx + Math.sin(o.t * f.w1 + f.p1) * f.ax;
    const dy = f.sy + Math.sin(o.t * f.w2 + f.p2) * f.ay;
    const rot = (f.rot + Math.sin(o.t * 0.42 + f.p1) * 0.05) * (1 - pb);
    const cx = dx + (tx - dx) * pb;
    const cy = dy + (ty - dy) * pb;
    const w = f.w0 + (tw - f.w0) * p;
    const hFull = f.h0 + (th - f.h0) * p;
    const h = hFull * (1 - 0.94 * conv);

    bx.push(cx);
    by.push(cy);
    bw.push(w);

    const L = lit(cx, cy);
    const detail = (1 - conv) * o.alpha * L;
    const extend = Math.max(smooth(0.5, 1, p), conv);
    // カチッ＝揃い切った瞬間だけ縁が光る
    const tLock = o.alignStart + f.d1 * o.alignDur;
    const flash =
      o.progressOf || o.t < tLock ? 0 : Math.exp(-(o.t - tLock) / 0.1) * (1 - conv) * o.alpha;

    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);

    /* 紙の面と落ち影（暗い地の上では影が「浮いている」ことを伝える） */
    if (detail > 0.015) {
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowColor = `rgba(0, 0, 0, ${(0.5 * detail).toFixed(3)})`;
      ctx.shadowBlur = 12 * (1 - conv);
      ctx.shadowOffsetY = 4 * (1 - conv);
      ctx.fillStyle = col(detail * 0.055);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.shadowColor = "rgba(0,0,0,0)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

    ctx.globalCompositeOperation = "lighter";

    /* 枠（CSV は枠なし＝罫だけ） */
    if (f.kind !== 0 && detail > 0.01) {
      ctx.strokeStyle = col(detail * (f.kind === 2 ? 0.34 : 0.28) + flash * 0.5);
      ctx.lineWidth = lw;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    } else if (flash > 0.01) {
      ctx.strokeStyle = col(flash * 0.4);
      ctx.lineWidth = lw;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }

    /* 縦の罫（升目） */
    if (f.kind === 1 && detail > 0.01) {
      ctx.strokeStyle = col(detail * 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < f.cols; c++) {
        const x = -w / 2 + (w * c) / f.cols;
        ctx.moveTo(x, -h / 2);
        ctx.lineTo(x, h / 2);
      }
      ctx.stroke();
    }

    /* 見出しの帯（濃い）＋セル境界 */
    const headY = ((0 - MID) / ROWS) * hFull * (1 - conv);
    if (detail > 0.02) {
      const hb = hFull * 0.16 * (1 - conv);
      ctx.fillStyle = col(detail * 0.13);
      ctx.fillRect(-w / 2, headY - hb * 0.55, w, hb);
      ctx.fillStyle = col(detail * 0.34);
      for (const hx of f.heads) {
        ctx.fillRect(-w / 2 + w * hx, headY - hb * 0.5, 1, hb);
      }
    }

    /* 横の罫（行）— 中央の 1 本が「背骨」。一本化で全部が背骨へ寄る */
    for (let r = 0; r < ROWS; r++) {
      const isMid = r === MID;
      const a0 = f.runs[r * 2];
      const a1 = f.runs[r * 2 + 1];
      const e = isMid ? Math.max(extend, conv) : extend;
      const x0 = (a0 + (0 - a0) * e) * w - w / 2;
      const x1 = (a1 + (1 - a1) * e) * w - w / 2;
      const y = ((r - MID) / ROWS) * hFull * (1 - conv);
      const a = isMid
        ? o.alpha * L * (0.46 + 0.54 * conv + connLit * (1 - conv))
        : o.alpha * L * (r === 0 ? 0.6 : 0.4) * (1 - conv);
      if (a <= 0.012) continue;
      ctx.fillStyle = col(a);
      ctx.fillRect(x0, y - lw / 2, Math.max(1, x1 - x0), isMid ? lw : lw * 0.85);
    }

    /* 値を表す短い棒（桁の抽象・文字は書かない） */
    if (detail > 0.02) {
      ctx.fillStyle = col(detail * 0.62);
      for (let k = 0; k < f.bars.length; k += 3) {
        const r = f.bars[k];
        const y = ((r - MID) / ROWS) * hFull * (1 - conv);
        const x0 = f.bars[k + 1] * w - w / 2;
        const x1 = f.bars[k + 2] * w - w / 2;
        ctx.fillRect(x0, y - lw, Math.max(2, x1 - x0), lw * 2);
      }
    }
    ctx.restore();

    /* ラベル（CSV / XLSX / PDF）— 断片の左上に小さく */
    if (detail > 0.05) {
      ctx.save();
      ctx.translate(cx, cy);
      if (rot) ctx.rotate(rot);
      ctx.font = o.labelFont;
      ctx.fillStyle = col(detail * 0.42);
      ctx.fillText(f.label, -w / 2, -h / 2 - 5);
      ctx.restore();
    }
  }

  /* 橋＝隣の断片の端どうしを繋ぐ（帯の両端も締める） */
  if (bridgeK > 0.004) {
    const a = o.alpha * bridgeK * (0.3 + 0.7 * Math.max(o.collapse, o.connect * 0.7) + connLit);
    if (a > 0.012) {
      const seg = (x0: number, x1: number, y: number) => {
        if (x1 - x0 <= 0.5) return;
        ctx.fillStyle = col(a * lit((x0 + x1) / 2, y));
        ctx.fillRect(x0, y - lw / 2, x1 - x0, lw);
      };
      seg(row.left, bx[0] - bw[0] / 2, by[0]);
      for (let i = 0; i < n - 1; i++) {
        seg(bx[i] + bw[i] / 2, bx[i + 1] - bw[i + 1] / 2, (by[i] + by[i + 1]) / 2);
      }
      seg(bx[n - 1] + bw[n - 1] / 2, row.right, by[n - 1]);
    }
  }

  /* 連結の合図＝繋がった線を左→右へ光が走る */
  if (o.connect > 0.001 && o.connect < 1.001) {
    const e = easeIO(clamp01(o.connect));
    const span = row.right - row.left;
    const x = row.left + span * e;
    const trail = Math.max(40, span * 0.24);
    const x0 = Math.max(row.left, x - trail);
    if (x - x0 > 1) {
      const g = ctx.createLinearGradient(x0, 0, x, 0);
      g.addColorStop(0, col(0));
      g.addColorStop(1, col(0.85 * o.alpha));
      ctx.fillStyle = g;
      ctx.fillRect(x0, row.y - 1.4, x - x0, 2.8);
    }
    const R = Math.max(10, row.h * 0.75);
    const gr = ctx.createRadialGradient(x, row.y, 0, x, row.y, R);
    gr.addColorStop(0, col(0.5 * o.alpha));
    gr.addColorStop(1, col(0));
    ctx.fillStyle = gr;
    ctx.fillRect(x - R, row.y - R, R * 2, R * 2);
  }

  ctx.globalCompositeOperation = prev;
}
