/**
 * FV 背景（Blender のループ動画）の素材と置き方（2026-10-04）。
 *
 * 受け渡し＝デスクトップの本制作（指示書 `受け渡し\2026-10-04_ポートフォリオ_FV背景\指示書.md`）。
 * どれも H.264 High・30fps・四辺は動画の中で地色 #1F1C1C へ溶かしてある。
 * 同じ URL の差し替えは端末に古い版が残るので、作り直した時はファイル名を変える。
 *
 * wide / narrow の切り替えは「FV の箱の縦横比」で決める（画面幅ではない）。
 * - トップの FV＝100vw×100vh。横長（縦横比 1 以上）は PC 用 16:9、それ以外はスマホ用 720×1560。
 *   タブレット縦（820×1180）はスマホ用を下揃えで敷く＝上の灯が切れ、水面と輪が残る（あおきさん確認待ち）。
 * - About の FV＝100vw×50vh（箱の縦横比＝画面の縦横比×2）。PC 用 2560×720 と正方形 1080×1080 の
 *   切り落としが釣り合うのは箱が約 1.9:1（画面 0.95）の所＝それ以上は PC 用。
 */

export type FvBgVariant = {
  /** 継ぎ目のないループ（20 秒） */
  loop: string;
  /** 1 回だけ流す導入（トップのみ・4 秒。最後のコマはループの最初のコマへつながる） */
  intro?: string;
  /** ループの 1 コマ目＝止まっていても完成して見える 1 枚 */
  poster: string;
  /** 動画の寸法（object-fit: cover の切り落とし計算用） */
  width: number;
  height: number;
  /** object-position（0〜1）。既定は中央 */
  posX?: number;
  posY?: number;
  /** 墨の一滴の着地点（動画の枠に対する割合）。導入の 1 コマ目はここを中心に広がる */
  landing?: [number, number];
};

export type FvBg = {
  /** 一致したら wide を使う（matchMedia の式） */
  wideQuery: string;
  wide: FvBgVariant;
  narrow: FvBgVariant;
};

export const TOP_FV_BG: FvBg = {
  wideQuery: "(min-aspect-ratio: 1/1)",
  wide: {
    loop: "/home/fv-water-pc-loop.mp4",
    intro: "/home/fv-water-pc-intro.mp4",
    poster: "/home/fv-water-pc-poster.webp",
    width: 1920,
    height: 1080,
    landing: [0.56, 0.82],
  },
  narrow: {
    loop: "/home/fv-water-sp-loop.mp4",
    intro: "/home/fv-water-sp-intro.mp4",
    poster: "/home/fv-water-sp-poster.webp",
    width: 720,
    height: 1560,
    posY: 1,
    landing: [0.5, 0.92],
  },
};

export const ABOUT_FV_BG: FvBg = {
  wideQuery: "(min-aspect-ratio: 19/20)",
  wide: {
    loop: "/about/fv-serverroom-pc-loop.mp4",
    poster: "/about/fv-serverroom-pc-poster.webp",
    width: 2560,
    height: 720,
  },
  narrow: {
    loop: "/about/fv-serverroom-sq-loop.mp4",
    poster: "/about/fv-serverroom-sq-poster.webp",
    width: 1080,
    height: 1080,
  },
};

/**
 * object-fit: cover で箱に敷いた動画の「枠に対する割合 (fx, fy)」が、箱のどこ（px）に来るか。
 * posX / posY は object-position（0〜1）。トップの一滴の着地点を動画へ合わせるのに使う。
 */
export function coverPoint(
  fx: number,
  fy: number,
  boxW: number,
  boxH: number,
  v: Pick<FvBgVariant, "width" | "height" | "posX" | "posY">
): { x: number; y: number } {
  const scale = Math.max(boxW / v.width, boxH / v.height);
  const dw = v.width * scale;
  const dh = v.height * scale;
  const ox = (boxW - dw) * (v.posX ?? 0.5);
  const oy = (boxH - dh) * (v.posY ?? 0.5);
  return { x: ox + fx * dw, y: oy + fy * dh };
}
