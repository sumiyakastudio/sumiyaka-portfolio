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
  profile: clip("/about/profile-v2", 512, 768),
  /** /about 02 STANCE（stance.webp と同じ構図） */
  stance: clip("/about/stance", 736, 544),
  /** /about 05 SCOPE（scope-color.webp と同じ構図） */
  scope: clip("/about/scope-color", 768, 512),
  /** /cases FDEとは（observe.webp と同じ構図） */
  observe: clip("/cases/observe-v3", 768, 512),
  /** /cases 人が決めるところ（review-color.webp と同じ構図） */
  review: clip("/cases/review-color", 736, 544),
  /** トップ 04（portrait-tall.webp と同じ構図） */
  portraitTall: clip("/home/portrait-tall", 560, 704),
  /** トップ 01（3場面×引き・寄りの約27秒。場面の区切りは whoScenes） */
  whoSequence: clip("/home/who-sequence", 736, 544),
  /** /service THE WAY（/service/teaching.webp と同じ構図・約20秒） */
  teaching: clip("/service/teaching", 736, 544),
  /** /service 第1の柱（inventory.webp と同じ構図） */
  inventory: clip("/service/inventory-v2", 768, 512),
} as const;

/**
 * トップ 01 の動画（whoSequence）の場面割り（2026-10-03 動画 v2）。
 * start/end＝秒。動画は 27.375 秒で、最後→最初もクロスフェード済み（<video loop> で継ぎ目なし）。
 * 目盛りと添え書きの切り替えはこの表だけを見る。
 */
export const whoSequenceDuration = 27.375;
export const whoScenes = [
  { no: "01", start: 0, end: 9.125, caption: "オフィスでの導入指導" },
  { no: "02", start: 9.125, end: 18.25, caption: "倉庫での業務観察" },
  { no: "03", start: 18.25, end: 27.375, caption: "事務所での聞き取り" },
] as const;
