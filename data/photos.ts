/**
 * 本人が写っている写真（ロードマップ 4-13・2026-09-22）— 文言と寸法の契約ファイル。
 * 構図の正本＝`事業戦略\ポートフォリオ大改修\撮影リスト_本人写真_2026-09-20.md`。
 *
 * 画像はすべて public/ 直下に WebP で置く。色調はアセット側で焼き込む（CSS filter は当てない）：
 *   mono  … teaching.webp と同じ調子（影の下限 RGB(39,36,37)・白 255・中間調はそのまま）
 *   color … トップ 04 の portrait-tall.webp と同じ彩度−15%（2026-09-22 あおき指示＝C-3・C-5）
 * メタデータ（EXIF／XMP／ICC／C2PA）は生成時に全て落としてある＝再書き出しするときも付けない。
 *
 * ★文言の方針（2026-09-22 あおき指示）＝**クライアント先の現場で、実際に教えている場面**であることが
 *   伝わる言い回しにする。「実際の様子」が売りなので、alt も caption もそこを落とさない。
 *   ⚠ 相手の氏名・社名・場所が特定できる語は書かない（撮影リスト§3）。
 * alt は「どこで・誰と・何をしている写真か」を一文で。caption は額の下の小さな一行（11px・字間広め）。
 */
export type SitePhoto = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
};

/** C-1 クライアント先で、担当者の話を聞いている → /about 02 STANCE（4:3・mono） */
export const stancePhoto: SitePhoto = {
  src: "/about/stance.webp",
  width: 1440,
  height: 1080,
  alt: "クライアント先で、担当者の方と向き合って話を聞いている実際の様子",
  caption: "クライアント先で、担当者の方の話を聞く",
};

/** C-2 クライアント先で、社員の方の作業を一歩引いて見ている → /cases FDEとは（3:2・mono） */
export const observePhoto: SitePhoto = {
  src: "/cases/observe.webp",
  width: 1440,
  height: 960,
  alt: "クライアント先で、社員の方が作業する手元と画面を後ろから見ている実際の様子",
  caption: "クライアント先で、実際の作業を見る",
};

/** C-3 クライアントの案件を、設計から実装まで一人で進めている → /about 05 SCOPE OF WORK（3:2・color） */
export const scopePhoto: SitePhoto = {
  src: "/about/scope-color.webp",
  width: 1440,
  height: 960,
  alt: "クライアント案件の設計画面とコードを並べて、一人で実装を進めている実際の様子",
  caption: "クライアントの案件を、設計から実装まで一人で",
};

/** C-4 クライアント先で、社員の方と業務の棚卸し → /service 第1の柱（3:2・mono） */
export const inventoryPhoto: SitePhoto = {
  src: "/service/inventory.webp",
  width: 1440,
  height: 960,
  alt: "クライアント先で、社員の方とホワイトボードに工程を描きながら業務の棚卸しをしている実際の様子",
  caption: "クライアント先で、社員の方と業務の棚卸し",
};

/** C-5 納品前に、出来上がったものを自分の目で確かめる → /cases 人が決めるところ（4:3・color） */
export const reviewPhoto: SitePhoto = {
  src: "/cases/review-color.webp",
  width: 1360,
  height: 1020,
  alt: "クライアントへ納める前に、出来上がった書類を自分の目で確かめている実際の様子",
  caption: "納品前の最終確認は、人の目で",
};
