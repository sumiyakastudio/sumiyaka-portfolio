/**
 * 本人が写っている写真（ロードマップ 4-13・2026-09-22）— 文言と寸法の契約ファイル。
 * 構図の正本＝`事業戦略\ポートフォリオ大改修\撮影リスト_本人写真_2026-09-20.md`。
 *
 * 画像はすべて public/ 直下に WebP で置く。モノクロは焼き込み済み（teaching.webp と同じ調子＝
 * 影の下限 RGB(39,36,37)・白 255・中間調はそのまま）。CSS filter は当てない。
 * メタデータ（EXIF／XMP／ICC／C2PA）は生成時に全て落としてある＝再書き出しするときも付けない。
 *
 * alt は「何をしている写真か」を一文で。caption は額の下の小さな一行（11px・字間広め）。
 * ⚠ 撮影場所や相手が特定できる語は書かない（撮影リスト§3）。
 */
export type SitePhoto = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
};

/** C-1 対面で、相手の話を聞いている → /about 02 STANCE（4:3） */
export const stancePhoto: SitePhoto = {
  src: "/about/stance.webp",
  width: 1440,
  height: 1080,
  alt: "打ち合わせで、相手の話を聞いている様子",
  caption: "現場で、話を聞く",
};

/** C-2 相手の画面や書類を、一歩引いて観察している → /cases FDEとは（3:2） */
export const observePhoto: SitePhoto = {
  src: "/cases/observe.webp",
  width: 1440,
  height: 960,
  alt: "作業中の社員の斜め後ろから、手元と画面を見ている様子",
  caption: "実際の仕事の流れを、見る",
};

/** C-3 一人で、設計と実装の画面を同時に扱っている → /about 05 SCOPE OF WORK（3:2） */
export const scopePhoto: SitePhoto = {
  src: "/about/scope.webp",
  width: 1440,
  height: 960,
  alt: "モニターに向かい、設計と実装を一人で進めている様子",
  caption: "設計も実装も、一人で",
};

/** C-4 ホワイトボードで業務の棚卸し → /service 第1の柱（3:2） */
export const inventoryPhoto: SitePhoto = {
  src: "/service/inventory.webp",
  width: 1440,
  height: 960,
  alt: "ホワイトボードに工程の流れを描きながら、業務の棚卸しをしている様子",
  caption: "現場で、業務の棚卸し",
};

/** C-5 最終確認 → /cases 人が決めるところ（4:3） */
export const reviewPhoto: SitePhoto = {
  src: "/cases/review.webp",
  width: 1360,
  height: 1020,
  alt: "出来上がった書類に目を通している様子",
  caption: "最後は、人の目で確かめる",
};
