/**
 * 本人写真のループ動画（2026-10-01）— 置き場所と寸法の契約ファイル。
 *
 * デスクトップPCで作り、あおきさんが見比べて確定した8本（受け渡しの指示書＝
 * `CC-共通資産\受け渡し\2026-10-01_ポートフォリオ_ループ動画\指示書.md`・受け取り後に削除）。
 * 各本＝8秒・16fps・H.264（yuv420p）・音声なし・faststart・往復版（継ぎ目なし）。
 * poster＝動画の最初のコマ（静止画から動画へ替わる時に絵が飛ばない）。
 *
 * ⚠ 動画の中身は加工しない（再エンコード・高画質化・補間をしない＝あおき方針「生成そのまま」）。
 * ⚠ 元の静止画（.webp）は消さない＝reduced-motion・JS 無し・省データ時はそちらを出す。
 */
export type LoopClip = {
  src: string;
  poster: string;
  width: number;
  height: number;
};

const clip = (base: string, width: number, height: number): LoopClip => ({
  src: `${base}-loop.mp4`,
  poster: `${base}-loop-poster.webp`,
  width,
  height,
});

export const photoLoops = {
  /** /about PROFILE（2:3・全身→胸上へ寄る。元の profile.webp とは構図が違う） */
  profile: clip("/about/profile", 512, 768),
  /** /about 02 STANCE（stance.webp と同じ構図） */
  stance: clip("/about/stance", 736, 544),
  /** /about 05 SCOPE（scope-color.webp と同じ構図） */
  scope: clip("/about/scope-color", 768, 512),
  /** /cases FDEとは（observe.webp と同じ構図） */
  observe: clip("/cases/observe", 768, 512),
  /** /cases 人が決めるところ（review-color.webp と同じ構図） */
  review: clip("/cases/review-color", 736, 544),
  /** トップ 04（portrait-tall.webp と同じ構図） */
  portraitTall: clip("/home/portrait-tall", 560, 704),
  /** トップ 01／/service THE WAY（teaching.webp と同じ構図） */
  teaching: clip("/home/teaching", 736, 544),
  /** /service 第1の柱（inventory.webp と同じ構図） */
  inventory: clip("/service/inventory", 768, 512),
} as const;
