import type { MeasuredSummary, Pillar } from "@/types/pillar";
import { pillarCopies } from "@/data/pillars";
import { getAllCases, getPickUpCases } from "@/lib/caseCatalog";
import { getAllTools, getPickUpTools } from "@/lib/toolCatalog";
import { getAllWorks, getPickUpWorks } from "@/lib/works";

/**
 * トップの3本柱と「実測」の参照口（P17 トップのハブ化・2026-09-20）。
 * 数字と代表画像はここで毎回集計する（ハードコード禁止＝データを足せば自動追従）。
 */

function median(values: number[]): number {
  const a = [...values].sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return 0;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

/** 「02 実測」の要約。出典は /cases と同じ data/cases.ts */
export function getMeasuredSummary(): MeasuredSummary {
  const cases = getAllCases();
  // 人の時間を分けて計測できている事例だけを中央値の対象にする（null は含めない）
  const human = cases
    .map((c) => c.after.human?.minutes)
    .filter((m): m is number => typeof m === "number");
  const reductions = cases.map((c) => c.reduction);
  return {
    caseCount: cases.length,
    humanMedianMinutes: Math.max(1, Math.round(median(human))),
    humanMeasuredCount: human.length,
    reductionMin: reductions.length ? Math.min(...reductions).toFixed(1) : "0.0",
    reductionMax: reductions.length ? Math.max(...reductions).toFixed(1) : "0.0",
    reductionMedian: median(reductions).toFixed(1),
  };
}

/** 3本柱。代表画像＝各ページの pick up 先頭（無ければ全件の先頭） */
export function getPillars(): Pillar[] {
  const measured = getMeasuredSummary();
  const repCase = getPickUpCases()[0] ?? getAllCases()[0];
  const repTool = getPickUpTools()[0] ?? getAllTools()[0];
  const repWork = getPickUpWorks()[0] ?? getAllWorks()[0];

  const derived: Record<Pillar["key"], { statValue: string; image: Pillar["image"] }> = {
    fde: {
      // 削減率の中央値（2026-09-20 あおき指示＝「8分」より％のほうが一目で伝わる）
      statValue: measured.reductionMedian,
      image: { src: repCase?.thumbnail ?? "", alt: repCase ? `導入事例：${repCase.title}` : "" },
    },
    tools: {
      statValue: String(getAllTools().length),
      image: { src: repTool?.thumbnail ?? "", alt: repTool ? `ツール：${repTool.title}` : "" },
    },
    web: {
      statValue: String(getAllWorks().length),
      image: { src: repWork?.thumbnail ?? "", alt: repWork ? `制作サイト：${repWork.title}` : "" },
    },
  };

  return pillarCopies
    .map((copy) => ({
      ...copy,
      ...derived[copy.key],
      // 添え書きの {n} は公開している事例の数（ハードコードしない）
      statLabel: copy.statLabel.replace("{n}", String(measured.caseCount)),
    }))
    // 代表画像が取れない柱は出さない（作っていないものは載せない）
    .filter((p) => p.image.src !== "");
}
