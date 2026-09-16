import type { CaseStudy, CaseDuration } from "@/types/case";
import { cases as casesData, fdeIntro } from "@/data/cases";

/**
 * 導入事例（FDE事業）カタログの参照口。
 * 件数はここから毎回集計する（ハードコード禁止＝事例追加で自動追従）。
 */
export function getAllCases(): CaseStudy[] {
  return [...casesData].sort((a, b) => a.order - b.order);
}

export function getPickUpCases(): CaseStudy[] {
  return getAllCases().filter((c) => c.isPickUp);
}

export function getCaseBySlug(slug: string): CaseStudy | undefined {
  return casesData.find((c) => c.slug === slug);
}

export function getFdeIntro() {
  return fdeIntro;
}

/**
 * 分 → 表示用の文字列。
 *   60分未満 … 「8分」「11分」（四捨五入。1.3分のような端数は「1分」）
 *   60分以上 … 「1.5時間」「15.5時間」「48.2時間」（小数1桁・.0 は落とす）
 *   display があればそれを優先（例「5分18秒」）
 */
export function formatDuration(d: CaseDuration): string {
  if (d.display) return d.display;
  const m = d.minutes;
  if (m < 60) return `${Math.max(1, Math.round(m))}分`;
  const h = m / 60;
  const s = h.toFixed(1).replace(/\.0$/, "");
  return `${s}時間`;
}

/** 分 → 人日（8時間＝480分）。「約2人日」のような添え字に使う。2人日未満は null */
export function formatPersonDays(minutes: number): string | null {
  const days = minutes / 480;
  if (days < 1.5) return null;
  const s = days.toFixed(1).replace(/\.0$/, "");
  return `約${s}人日`;
}

/** 削減率 → 「94.0%」。小数1桁固定 */
export function formatReduction(rate: number): string {
  return `${rate.toFixed(1)}%`;
}

/** 「導入後」の1行。人の時間が無い事例は AI の時間だけ */
export function formatAfter(c: CaseStudy): string {
  const ai = formatDuration(c.after.ai);
  if (!c.after.human) return `${ai}（AIが動いた時間）`;
  return `人 ${formatDuration(c.after.human)}（AI ${ai}）`;
}
