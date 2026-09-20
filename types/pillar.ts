/**
 * トップ「01 何をする人か」の3本柱（FDE／TOOLS／WEB）と、「02 実測」の要約の定義。
 * P17 トップのハブ化（2026-09-20）。
 *
 * ⚠ 数字・画像はハードコードしない。lib/pillarCatalog.ts が
 *    data/cases.ts・data/tools.ts・data/works.ts から毎回集計する
 *    （事例・ツール・作品を足せばトップも自動で追従する）。
 * ⚠ 柱を足すのは「実物ができてから」（準備中の枠は作らない＝2026-08-23 の判断）。
 */

export type PillarKey = "fde" | "tools" | "web";

/** data/pillars.ts に書く静的な部分（文言とリンク） */
export interface PillarCopy {
  key: PillarKey;
  /** 通し番号（01…） */
  no: string;
  /** 英字名＝ナビの表記と揃える（FDE／TOOLS／WEB） */
  nameEn: string;
  /** 和名（FDE事業／ツール制作／Web制作） */
  nameJa: string;
  /** 1行の説明 */
  line: string;
  /** 数字の単位と添え書き（数字そのものはデータから）。statLabel の {n} は事例数に置き換わる */
  statUnit: string;
  statLabel: string;
  /** 飛び先と導線の文言 */
  href: string;
  cta: string;
}

/** 画面に渡す完成形（文言＋データ由来の数字と代表画像） */
export interface Pillar extends PillarCopy {
  /** データ由来の数字（表示用の文字列。例「8」「6」「29」） */
  statValue: string;
  /** 代表画像＝各ページの pick up 先頭（public/ 配下のパス） */
  image: { src: string; alt: string };
}

/** 「02 実測」の要約。すべて data/cases.ts（/cases と同じ出典）から計算する */
export interface MeasuredSummary {
  /** 公開している事例の数 */
  caseCount: number;
  /** 人の手が動いた時間の中央値（分・四捨五入済みの整数） */
  humanMedianMinutes: number;
  /** 上の中央値の対象＝人の時間を分けて計測できている事例の数 */
  humanMeasuredCount: number;
  /** 削減率の最小・最大（%・小数1桁の文字列。例「76.0」「98.5」） */
  reductionMin: string;
  reductionMax: string;
  /** 削減率の中央値（%・小数1桁の文字列。例「87.7」）。3本柱の FDE の数字に使う */
  reductionMedian: string;
}
