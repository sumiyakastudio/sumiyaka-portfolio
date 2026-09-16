/**
 * FDE事業（導入事例）の定義。
 *
 * ⚠ Works（クライアントへ納品した実案件）・Tools（自社開発の道具）とは別の器。
 *    「制作実績」の見出しの下で 03 として並べ、取り違えさせない。
 * ⚠ 載せる数字は実測記録（事業戦略\削減時間_実測記録.md ／ 削減時間_業務別想定時間_2026-09-16.md）
 *    に基づく。外に出すのは「数字と業務の名前」まで。仕組み（何をどう使ったか）は書かない。
 * ⚠ 導入先は「自社の受託制作業務」。存在しない導入先企業名・導入社数は書かない（2026-09-16 確定）。
 * ⚠ 「導入前」はすべて見積（同じ精度で手作業した場合を少なめに置いた値）。表示では必ず「見積」と添える。
 */

export interface CaseDuration {
  /** 分。人の時間が分離計測できていない事例は humanMinutes を null にする */
  minutes: number;
  /** 表示の上書き（例「5分18秒」）。無ければ formatDuration() で分から作る */
  display?: string;
}

export interface CaseStudy {
  /** URL のアンカー。/cases#{slug} */
  slug: string;
  /** 通し番号（C-01 形式） */
  no: string;
  /** 業務名（企業の言葉で） */
  title: string;
  /** 英字名（見出しの添え字） */
  titleEn: string;
  /** 誰の、どんな仕事か（1〜2文） */
  task: string;
  /** 計測の単位（例「1本（一式）」「1バッチ＝候補20件→提案7件」） */
  unit: string;
  /** 導入前＝手作業（見積・少なめ） */
  before: CaseDuration & { basis: string };
  /** 導入後＝人の手が動いた時間（null＝分離計測なし）と、AIが動いた時間 */
  after: {
    human: CaseDuration | null;
    ai: CaseDuration;
  };
  /** 削減率（%・小数1桁）。既定＝壁時計ベース＝1−(AI＋人)÷手作業 */
  reduction: number;
  /** 削減率の但し書き（例「機械が動いた時間だけの比較」） */
  reductionNote?: string;
  /** カードの一言（20字前後） */
  headline: string;
  /** カード1行の要約 */
  summary: string;
  /** 導入前の状態／導入後の状態（詳細の本文） */
  story: { before: string; after: string };
  /** 人の判断が残る箇所（省略しない） */
  humanKeeps: string;
  /** 正直な注意（見積・未検証・偏り） */
  caveat: string;
  /** サムネイル（webp・1280×800） public/cases/{slug}/thumbnail.webp */
  thumbnail: string;
  /** テーマカラー（HEX）。白い紙の地で、この1色だけを点と線に使う */
  accent: string;
  /** テーマカラーの和名 */
  accentName: string;
  /** 一覧・トップでの並び順 */
  order: number;
  /** トップの実績枠（03 FDE事業）に出す6選か */
  isPickUp: boolean;
}

/** FDE事業の見出し・説明（トップの03枠と /cases の冒頭で共通） */
export interface FdeIntro {
  /** 章の添え字 */
  eyebrow: string;
  /** トップの枠の見出し（03 の枠名＝「FDE事業」） */
  title: string;
  /** 英字の添え字 */
  titleEn: string;
  /** ページ名（ナビ・/cases の FV・タイトル＝「FDE」。2026-09-16 あおき指示） */
  pageTitle: string;
  /** ページ名の正式名称（FV の添え字＝「Forward Deployed Engineer」） */
  pageTitleEn: string;
  /** FDEの仕事の3段（現場に入る→教え込む→回る）。/cases の説明ブロック用 */
  steps: { no: string; title: string; body: string }[];
  /** 一言（キャッチ） */
  tagline: string;
  /** FDEを知らない人向けの説明（2〜3文） */
  explain: string;
  /** 説明の結び＝1文だけ少し目立たせる（2026-09-16 あおき指示「仕事の完了は、私が必要なくなることです」） */
  closing: string;
  /** 数字の測り方（正直な但し書き） */
  measured: string;
  /** 導入先（正直に） */
  deployedIn: string;
}
