/**
 * ============================================================
 *  サブページ「墨の五彩」改修 — 型の契約ファイル（2026-09-05）
 * ============================================================
 *
 * サブページ（/about /service /works /contact /tools）は、色ではなく
 * 「明度の段階 × 素材 × 構図 × 動きの語彙」で個性を分ける。
 * 各ページの担当（子CC）はこのファイルの定数・型・規則にだけ依存し、
 * 他ページのファイルは読まない・書かない。
 *
 * ---- 五彩の割り当て ----
 *   About   = 濃（noh） 素材：墨      黒9:白1
 *   Service = 重（juu） 素材：線・図面 黒8:白2
 *   Works   = 清（sei） 素材：紙      黒2:白8（白地に墨）
 *   Contact = 焦（koge）素材：灯      黒9.5:白0.5
 *   Tools   = 淡（tan） 素材：金属・計器 灰6:黒3:白1
 *
 * ---- 共通の舞台（SubPageFVAnim）----
 *   ・FV は 100vh(100svh) で始まり、FV_TIMING.shrinkDelay 秒後に
 *     FV_TIMING.shrinkDuration 秒かけて FV_TIMING.shrunkHeight へ収縮する。
 *   ・収縮のあいだ、`data-fv-depth` を持つ要素は奥へ沈む（scale と yPercent）。
 *     値は 0〜1 の係数（省略時 1）。題字など手前に残したい要素には付けない。
 *   ・位相は section[data-fv] の `data-fv-phase` 属性と、同要素に dispatch される
 *     CustomEvent（FV_PHASE_EVENT）で受け取れる。React からは useFVPhase() を使う。
 *       idle → enter（マウント直後）→ shrink（収縮開始）→ settled（収縮完了）
 *   ・prefers-reduced-motion のときは即 settled（終端値の即置き・トゥイーンなし）。
 *
 * ---- 全員が守る規則（違反は差し戻し）----
 *   1. 既存の文言は一言一句変えない（改行・分割は自由）。セクションの順序・id・
 *      metadata・JSON-LD・リンク先も変えない。
 *   2. 使ってよい動き：transform（2D）/ opacity / text-shadow / box-shadow /
 *      background の位置・サイズ / SVG stroke-dashoffset / canvas 2D。
 *      使わない：filter・backdrop-filter のアニメ、mix-blend-mode、3D transform・
 *      perspective、複雑な clip-path、vw 単位のフォント、JS スクロール連動の視差、
 *      100vh 単独指定（必ず 100vh と 100svh の二段）。
 *   3. WebGL は使わない（2026-10-04 トップと /about の流体は Blender の背景動画
 *      FvBgVideo へ置き換えた＝全画面を毎フレーム描き直す負荷を外すため）。
 *   4. 常時走る演出は InViewGate（components/animation/InViewGate）で囲い、
 *      画面外では止める。ScrollReveal と同じ要素に CSS アニメを当てない（内側に1枚）。
 *   5. タッチ端末・狭幅（lib/device の prefersLightVisuals() が true）では
 *      常時ループを起動しない。静止1コマでも同じ個性が出る「ポスター判定」を満たす。
 *      ※ 動画（LoopVideo・FvBgVideo）はハードウェア再生のため対象外。ただし画面外・
 *        背面タブでは止め、「動きを減らす」設定・省データ・自動再生の拒否ではポスターだけ。
 *   6. 金（--color-accent #c8a96e）はサブページの新規要素で使わない。差し色は白系。
 *   7. 件数は data から取り、数字をハードコードしない。
 *   8. 1920 / 1280 / 390 の3幅で撮影して確認する。横あふれ 0。
 */

export type FVPhase = "idle" | "enter" | "shrink" | "settled";

/** section[data-fv] に dispatch されるイベント名。detail = { phase: FVPhase } */
export const FV_PHASE_EVENT = "fvphase";

/** 収縮の時間設計（秒）。旧 SubPageFVAnim と同じ値＝初速の原則を守る */
export const FV_TIMING = {
  /** 題字の入場が始まる遅れ */
  enterDelay: 0.2,
  /** 収縮が始まる時刻 */
  shrinkDelay: 1.0,
  /** 収縮にかける時間 */
  shrinkDuration: 0.5,
  /** 収縮後の高さ */
  shrunkHeight: "50vh",
} as const;

/** 奥行き（data-fv-depth=1 のときの沈み量） */
export const FV_DEPTH = {
  scale: 0.94,
  yPercent: -4,
} as const;

/** 共通イージング（既存の EASE と同じ） */
export const FV_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** 墨の五彩（globals.css のトークンと同値。canvas/SVG から数値で使うとき用） */
export const SUMI = {
  koge: "#141212",
  noh: "#1f1c1c",
  juu: "#2b2325",
  tan: "#8f8789",
  tanDeep: "#5e5658",
  sei: "#f1eaec",
  seiPaper: "#f6f2f0",
  /** 灯・光のにじみ（白系・彩度なし） */
  glowRGB: "250, 247, 245",
} as const;

/** ページごとの割り当て（参照用。実装はページ側が持つ） */
export const GOSAI_PAGES = {
  about: { tone: "noh", material: "墨", ratio: "黒9:白1" },
  service: { tone: "juu", material: "線・図面", ratio: "黒8:白2" },
  works: { tone: "sei", material: "紙", ratio: "黒2:白8" },
  contact: { tone: "koge", material: "灯", ratio: "黒9.5:白0.5" },
  tools: { tone: "tan", material: "金属・計器", ratio: "灰6:黒3:白1" },
} as const;

/** 非 React コードから位相を購読する */
export function onFVPhase(
  el: Element,
  cb: (phase: FVPhase) => void
): () => void {
  const handler = (e: Event) => {
    const d = (e as CustomEvent<{ phase: FVPhase }>).detail;
    if (d && d.phase) cb(d.phase);
  };
  el.addEventListener(FV_PHASE_EVENT, handler);
  return () => el.removeEventListener(FV_PHASE_EVENT, handler);
}
