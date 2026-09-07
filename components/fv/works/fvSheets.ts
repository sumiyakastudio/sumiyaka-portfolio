import type { Work } from "@/types/work";

/**
 * /works FV「紙の束」に敷く掲載サイトのフルスクリーンショットを選ぶ（2026-09-07）。
 *
 * ★ ここでは枚数も並びもハードコードしない。data/works.ts の tier と order から
 *    毎回組み立てるので、作品を足す・tier を変えるだけで FV の顔ぶれが入れ替わる。
 * ★ サーバー側（app/works/page.tsx）で呼ぶこと。Work をまるごと client へ渡すと
 *    RSC のペイロードが 28件ぶん膨らむため、必要なパス文字列だけに絞って渡す。
 */

/** FV が読み込むフルスクショの上限。1枚 ~0.5MB の素材なので、ここは増やさない */
export const FV_SHEET_MAX = 8;

/** タッチ端末・狭幅（prefersLightVisuals）で使う枚数。SP で大量に読ませない */
export const FV_SHEET_LIGHT = 4;

const TIER_RANK: Record<Work["tier"], number> = { S: 0, A: 1, B: 2, C: 3 };

/**
 * 束に使うフルスクショのパスを返す（先頭ほど手前で使われる）。
 * 並びは tier（S→A→B→C）→ order の昇順。images[0] が無い作品は落とす。
 */
export function pickFVSheets(works: Work[]): string[] {
  return [...works]
    .filter((w) => typeof w.images?.[0] === "string" && w.images[0].length > 0)
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.order - b.order)
    .slice(0, FV_SHEET_MAX)
    .map((w) => w.images[0]);
}
