import type { PillarCopy } from "@/types/pillar";

/**
 * トップ「01 何をする人か」の文言の正本（P17 トップのハブ化・2026-09-20）。
 *
 * ⚠ FDE の説明（3段・一言・結びの一文）はここに書かない。
 *    data/cases.ts の fdeIntro が正本（/cases と共通＝2026-09-16 あおき承認済みの文言）。
 * ⚠ 数字・画像はここに書かない（lib/pillarCatalog.ts がデータから集計）。
 * ⚠ 他者を下げる語は書かない。立場は「私はしません」までで言い切る（名指ししない）。
 */

/** 3本柱。並び＝ナビと同じ FDE → TOOLS → WEB */
export const pillarCopies: PillarCopy[] = [
  {
    key: "fde",
    no: "01",
    nameEn: "FDE",
    nameJa: "FDE事業",
    line: "御社の現場に入り、仕事のやり方をAIに教え込みます。",
    statUnit: "%",
    // {n} は公開している事例の数に置き換わる（lib/pillarCatalog.ts）。
    // ⚠「クライアントの作業時間」とは書かない＝導入前は手作業の見積（FDE事例掲載時の線引き）
    statLabel: "削減率の中央値（{n}事例・実測）。導入前は手作業の見積との比較です",
    href: "/cases",
    cta: "導入事例を見る",
  },
  {
    key: "tools",
    no: "02",
    nameEn: "TOOLS",
    nameJa: "ツール制作",
    line: "Excel・CSV・PDFの手作業を、ブラウザだけで動く道具に。",
    statUnit: "本",
    statLabel: "自社で開発したツール（その場で試せます）",
    href: "/tools",
    cta: "ツールを試す",
  },
  {
    key: "web",
    no: "03",
    nameEn: "WEB",
    nameJa: "Web制作",
    line: "設計から実装・公開まで、すべて一人で。",
    statUnit: "サイト",
    statLabel: "掲載中のサイト",
    href: "/works",
    cta: "サイトを見る",
  },
];

/** 01 の頭と、しないこと（1行） */
export const whoCopy = {
  label: "何をする人か",
  labelEn: "WHAT I DO",
  /** しないこと。他者の名指しはしない */
  notDoing: "説明会も、セミナーも、行いません。一社ずつ、深く入ります。",
  /** 3本柱の前置き */
  pillarsLead: "入口は、3つあります。",
};

/** 01 に大きく置く写真（2026-09-20 あおき指示）。/service THE WAY と同じ1枚。
 *  alt と caption は components/home/Way.tsx の文言と同じ（一言一句そろえる） */
export const whoPhoto = {
  src: "/home/teaching.webp",
  width: 1264,
  height: 948,
  alt: "クライアント先での導入指導の様子",
  caption: "クライアント先での導入指導",
};

/** 02 実測 */
export const measuredCopy = {
  label: "実測",
  labelEn: "MEASURED",
  title: "数字は、実測だけを出します。",
  /** 朱の印（このページで色を使うのはここだけ） */
  seal: "実測",
  humanLabel: "人の手が動いた時間",
  humanNote: "1件あたりの中央値",
  reductionLabel: "削減率",
  reductionNote: "導入前（手作業の見積）との比較",
  /** 注記（小さく・必ず出す） */
  caveat:
    "実際の業務で計測した数値です（2026年）。導入前は手作業の見積です。業務の形は企業ごとに異なるため、目安としてご覧ください。",
  href: "/cases",
  cta: "削減の実測（導入事例）",
};

/** 03 VALUE に足す一文（予算が先に決まっている場合） */
export const budgetLine =
  "ご予算が決まっている場合は、先にお聞かせください。その範囲で、現実的なスコープをお出しします。";

/** /about に置く姿勢の全文（P17 計画書 §2-b の案・段落ごと）。見出しは stanceTitle */
export const stanceTitle = "数字で話す。狭く、深く。";
export const stanceFull = [
  "私はプログラマー出身です。判断はすべて数字で行い、出す数字は実際の案件で計測したものだけです。",
  "人を多く集める働き方はせず、一人で御社の中の深いところまで入ります。コンサルティングではなく、現場に入って、社員の方が自分で回せる状態まで仕上げるのが仕事です。",
  "AIで作った時間は、経営者の方と未来の話をする時間に使いたい。自分と、その周りが幸せに、AIでもっと良い未来を作る。そのために、狭く、深く。",
];

/** 04 人 に置く姿勢の宣言（トップ用・4行以内）。全文は /about
 *  「説明会も、セミナーも」は 01 の notDoing で言っているので、ここでは繰り返さない */
export const stanceLines = [
  "数字で話します。",
  "狭く、深く。",
  "AIで浮いた時間は、御社の未来の話をする時間に。",
];
