/**
 * 入金消込 突合ツール — 段階法による突合
 *
 * ⚠ **点数と閾値による判定にしない。段階法にする。**
 *    「78点だから一致」は利用者に説明できない。段階法なら
 *    「名義が一致し、金額も一致し、期日の範囲内だったから自動一致です」と1行で書ける。
 *    88.0% が目視で確認している業務を置き換えるには、判定の根拠が見えることが要る。
 *
 * ⚠ 上から順に実行し、**消費された請求・入金は次の段階へ持ち越さない**（貪欲法）。
 *    各段階の中では入金を (日付, 行番号) 昇順、Step 4 だけ請求を行番号昇順で回す。
 *    これで入力の並び順が変わっても結果が変わらない（決定的）。
 *
 * ⚠ 迷ったら「要確認」へ倒す。
 *    誤って消し込んだ売掛金を後から見つけるより、要確認を1件多く見るほうが軽い。
 */

import { formatYen } from "../_shared/format";
import { MAX_COMBINE_BITS, MIN_PREFIX_LEN } from "./types";
import type {
  InvoiceEntry,
  MatchConfidence,
  MatchOptions,
  MatchReason,
  MatchResult,
  MatchRow,
  MatchStatus,
  StatementEntry,
} from "./types";

/* ------------------------------------------------------------------ *
 * 小道具
 * ------------------------------------------------------------------ */

const DAY_MS = 86400000;

/** "YYYY-MM-DD" → UTC のミリ秒。読めなければ null */
function isoToMs(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** a - b（日数）。どちらかが読めなければ 0 */
function dayDiff(a: string, b: string): number {
  const ma = isoToMs(a);
  const mb = isoToMs(b);
  if (ma === null || mb === null) return 0;
  return Math.round((ma - mb) / DAY_MS);
}

/**
 * 入金日が請求の期日の許容範囲にあるか。
 *
 * ⚠ **支払期日が空なら常に許容する。** 日付で切り捨てて「入っているのに未入金」と
 *    出すのがいちばん危ない。範囲外でも候補からは外さず、他に候補が無ければ
 *    dateOutOfRange として「要確認」に落とす。
 */
function dateAllowed(inv: InvoiceEntry, pay: StatementEntry, o: MatchOptions): boolean {
  if (!inv.dueDate) return true;
  const d = dayDiff(pay.date, inv.dueDate);
  if (d < -o.daysBefore) return false;
  if (d > o.daysAfter) return false;
  return true;
}

/** 支払期日の古い順 → 行番号の順。候補が複数のときの選び方を1か所に固める */
function byDueThenLine(a: InvoiceEntry, b: InvoiceEntry): number {
  const da = a.dueDate || "9999-12-31";
  const db = b.dueDate || "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  return a.sourceLine - b.sourceLine;
}

/** 金額の列挙（¥66,000 ＋ ¥88,000 ＋ ¥44,000） */
function joinAmounts(values: readonly number[]): string {
  return values.map((v) => formatYen(v)).join(" ＋ ");
}

/** 行番号の並びを辞書順で比べる（同点のときの決定的なタイブレーク） */
function compareLines(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */

export function reconcile(
  invoices: readonly InvoiceEntry[],
  statement: readonly StatementEntry[],
  options: MatchOptions,
): MatchResult {
  /* --- 前処理 ------------------------------------------------------ */

  // 1. 出金は突合の対象から外す（何行外したかは読み取り側が画面に出す）
  const payments = statement
    .filter((p) => p.direction === "credit")
    .sort((a, b) => (a.date === b.date ? a.sourceLine - b.sourceLine : a.date < b.date ? -1 : 1));

  const invs = [...invoices].sort((a, b) => a.sourceLine - b.sourceLine);

  // 2. 索引。キーの区切りは NUL（照合キーには絶対に現れない文字）。
  // ⚠ ソースに生の NUL バイトを置かない。書くと git がこのファイルをバイナリ扱いにして
  //   差分が読めなくなる（T-01 で実際に踏んだ）。実体は NUL のままでよいので関数で作る。
  const SEP = String.fromCharCode(0);
  const byKey = new Map<string, InvoiceEntry[]>();
  const byKeyAmount = new Map<string, InvoiceEntry[]>();
  const byPrefix3 = new Map<string, InvoiceEntry[]>();
  const payByKey = new Map<string, StatementEntry[]>();

  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const hit = map.get(key);
    if (hit) hit.push(value);
    else map.set(key, [value]);
  };

  for (const inv of invs) {
    if (!inv.key) continue;
    push(byKey, inv.key, inv);
    push(byKeyAmount, `${inv.key}${SEP}${inv.amount}`, inv);
    push(byPrefix3, inv.key.slice(0, 3), inv);
  }
  for (const pay of payments) {
    if (!pay.key) continue;
    push(payByKey, pay.key, pay);
  }

  // 合算の貪欲法（Step 3）が使う「金額の降順」は、入金ごとに並べ替えると
  // 同一名義に請求が数千件ある表で並べ替えを何千回も繰り返すことになる。キーごとに1回だけ作る。
  const byKeyDesc = new Map<string, InvoiceEntry[]>();
  for (const [key, list] of byKey) {
    byKeyDesc.set(
      key,
      [...list].sort((a, b) => (a.amount !== b.amount ? b.amount - a.amount : a.sourceLine - b.sourceLine)),
    );
  }

  const usedInv = new Set<InvoiceEntry>();
  const usedPay = new Set<StatementEntry>();
  const rows: MatchRow[] = [];

  const add = (
    status: MatchStatus,
    reason: MatchReason,
    confidence: MatchConfidence,
    groupInvoices: InvoiceEntry[],
    groupPayments: StatementEntry[],
    note: string,
  ) => {
    for (const i of groupInvoices) usedInv.add(i);
    for (const p of groupPayments) usedPay.add(p);
    const invoiceTotal = groupInvoices.reduce((s, i) => s + i.amount, 0);
    const paymentTotal = groupPayments.reduce((s, p) => s + p.amount, 0);
    rows.push({
      group: 0, // 並べ替えたあとに振り直す
      status,
      reason,
      confidence,
      invoices: groupInvoices,
      payments: groupPayments,
      invoiceTotal,
      paymentTotal,
      diff: invoiceTotal - paymentTotal,
      note,
    });
  };

  const freeInv = (list: readonly InvoiceEntry[] | undefined): InvoiceEntry[] =>
    (list ?? []).filter((i) => !usedInv.has(i));

  /* --- Step 1  完全一致（1入金 : 1請求） --------------------------- */

  for (const pay of payments) {
    if (usedPay.has(pay) || !pay.key) continue;
    const all = freeInv(byKeyAmount.get(`${pay.key}${SEP}${pay.amount}`));
    if (all.length === 0) continue;

    const inRange = all.filter((inv) => dateAllowed(inv, pay, options)).sort(byDueThenLine);

    if (inRange.length === 1) {
      add("matched", "exact", "exact", [inRange[0]], [pay], "");
    } else if (inRange.length >= 2) {
      add(
        "review",
        "ambiguous",
        "likely",
        [inRange[0]],
        [pay],
        `同じ名義・同じ金額の請求が ${inRange.length}件あります。どれに当てるかご確認ください。`,
      );
    } else {
      const picked = [...all].sort(byDueThenLine)[0];
      const gap = Math.abs(dayDiff(pay.date, picked.dueDate));
      add(
        "review",
        "dateOutOfRange",
        "likely",
        [picked],
        [pay],
        `名義と金額は一致しますが、入金日が支払期日から ${gap}日 離れています。`,
      );
    }
  }

  /* --- Step 2  振込手数料の差引（1入金 : 1請求） ------------------- */

  if (options.feeTolerance > 0) {
    for (const pay of payments) {
      if (usedPay.has(pay) || !pay.key) continue;
      const cands = freeInv(byKey.get(pay.key))
        .filter((inv) => {
          const d = inv.amount - pay.amount;
          return d > 0 && d <= options.feeTolerance;
        })
        .filter((inv) => dateAllowed(inv, pay, options))
        .sort((a, b) => {
          const da = a.amount - pay.amount;
          const db = b.amount - pay.amount;
          return da !== db ? da - db : byDueThenLine(a, b);
        });
      if (cands.length === 0) continue;

      const picked = cands[0];
      const fee = picked.amount - pay.amount;
      if (cands.length === 1) {
        const asMatched = options.feeAsMatched;
        add(
          asMatched ? "matched" : "review",
          "feeDeducted",
          asMatched ? "exact" : "likely",
          [picked],
          [pay],
          `振込手数料とみられる ${formatYen(fee)} が差し引かれています。`,
        );
      } else {
        add(
          "review",
          "ambiguous",
          "likely",
          [picked],
          [pay],
          `手数料を引くと合う請求が ${cands.length}件あります。差額のいちばん小さいものを当てました。ご確認ください。`,
        );
      }
    }
  }

  /* --- Step 3  合算入金（1入金 : 複数請求） ------------------------ */

  if (options.findCombined) {
    for (const pay of payments) {
      if (usedPay.has(pay) || !pay.key) continue;
      const pool = freeInv(byKey.get(pay.key));
      if (pool.length < 2) continue;

      const total = pool.reduce((s, i) => s + i.amount, 0);
      if (total < pay.amount) continue; // どう足しても届かない

      const fits = (sum: number): boolean => {
        if (sum === pay.amount) return true;
        const over = sum - pay.amount;
        return options.feeTolerance > 0 && over > 0 && over <= options.feeTolerance;
      };

      let best: InvoiceEntry[] | null = null;
      let hits = 0;

      if (pool.length <= MAX_COMBINE_BITS) {
        // すべての部分集合（最大 2^12 = 4,096 通り）
        const n = pool.length;
        for (let mask = 1; mask < 1 << n; mask++) {
          let sum = 0;
          let count = 0;
          for (let b = 0; b < n; b++) {
            if (mask & (1 << b)) {
              sum += pool[b].amount;
              count++;
              if (sum > pay.amount + options.feeTolerance) break;
            }
          }
          if (count < 2 || !fits(sum)) continue;
          hits++;
          if (
            best === null ||
            count < best.length ||
            (count === best.length &&
              compareLines(
                pool.filter((_, b) => mask & (1 << b)).map((i) => i.sourceLine),
                best.map((i) => i.sourceLine),
              ) < 0)
          ) {
            best = pool.filter((_, b) => mask & (1 << b));
          }
        }
      } else {
        // 組合せ爆発を避け、金額の降順に貪欲へ足す1通りだけ試す
        const sorted = freeInv(byKeyDesc.get(pay.key));
        const cap = pay.amount + options.feeTolerance;
        const picked: InvoiceEntry[] = [];
        let sum = 0;
        for (const inv of sorted) {
          if (sum + inv.amount <= cap) {
            picked.push(inv);
            sum += inv.amount;
          }
        }
        if (picked.length >= 2 && fits(sum)) {
          best = picked.sort((a, b) => a.sourceLine - b.sourceLine);
          hits = 1;
        }
      }

      if (!best) continue;
      const chosen = [...best].sort((a, b) => a.sourceLine - b.sourceLine);
      const sum = chosen.reduce((s, i) => s + i.amount, 0);
      const fee = sum - pay.amount;

      if (hits === 1) {
        // ⚠ 合算は自動一致にしない。19.4% が「複数件合算入金の確認が困難」と答えている領域
        let note = `${chosen.length}件の請求が1本にまとまっています（${joinAmounts(chosen.map((i) => i.amount))}）。`;
        if (fee > 0) note += `振込手数料とみられる ${formatYen(fee)} の差があります。`;
        add("review", "combined", "likely", chosen, [pay], note);
      } else {
        add(
          "review",
          "ambiguous",
          "likely",
          chosen,
          [pay],
          `合計が合う組み合わせが ${hits} 通りあります。件数のいちばん少ない組を当てました。ご確認ください。`,
        );
      }
    }
  }

  /* --- Step 4  分割入金・過不足（複数入金 : 1請求） ---------------- */

  if (options.findSplit) {
    for (const inv of invs) {
      if (usedInv.has(inv) || !inv.key) continue;
      const pool = (payByKey.get(inv.key) ?? []).filter((p) => !usedPay.has(p));
      if (pool.length === 0) continue;

      const sum = pool.reduce((s, p) => s + p.amount, 0);
      const amounts = joinAmounts(pool.map((p) => p.amount));

      if (sum === inv.amount) {
        add(
          "review",
          "split",
          "likely",
          [inv],
          pool,
          `${pool.length}回に分けて入金されています（${amounts}）。`,
        );
      } else if (options.feeTolerance > 0 && inv.amount - sum > 0 && inv.amount - sum <= options.feeTolerance) {
        add(
          "review",
          "feeDeducted",
          "likely",
          [inv],
          pool,
          `振込手数料とみられる ${formatYen(inv.amount - sum)} が差し引かれています。`,
        );
      } else if (sum < inv.amount) {
        add("review", "short", "likely", [inv], pool, `${formatYen(inv.amount - sum)} 不足しています。`);
      } else {
        add("review", "over", "likely", [inv], pool, `${formatYen(sum - inv.amount)} 多く入金されています。`);
      }
    }
  }

  /* --- Step 5  前方一致（名義が途中で切れている） ------------------ */

  for (const pay of payments) {
    if (usedPay.has(pay) || !pay.key) continue;
    const cands = freeInv(byPrefix3.get(pay.key.slice(0, 3)))
      .filter(
        (inv) =>
          (inv.key.startsWith(pay.key) && pay.key.length >= MIN_PREFIX_LEN) ||
          (pay.key.startsWith(inv.key) && inv.key.length >= MIN_PREFIX_LEN),
      )
      .filter((inv) => {
        if (inv.amount === pay.amount) return true;
        const d = inv.amount - pay.amount;
        return options.feeTolerance > 0 && d > 0 && d <= options.feeTolerance;
      })
      .sort((a, b) => {
        const la = Math.min(a.key.length, pay.key.length);
        const lb = Math.min(b.key.length, pay.key.length);
        return la !== lb ? lb - la : a.sourceLine - b.sourceLine;
      });
    if (cands.length === 0) continue;

    const picked = cands[0];
    // ⚠ 前方一致は絶対に「自動一致」にしない（同名企業・カナ表記の重複で一意に決まらない）
    if (cands.length === 1) {
      add(
        "review",
        "prefix",
        "likely",
        [picked],
        [pay],
        `振込名義が途中で切れているようです（明細＝${pay.payerRaw} ／ 台帳＝${picked.payerName || picked.clientName}）。`,
      );
    } else {
      add(
        "review",
        "ambiguous",
        "likely",
        [picked],
        [pay],
        `名義が前方一致する請求が ${cands.length}件あります。いちばん長く一致するものを当てました。ご確認ください。`,
      );
    }
  }

  /* --- Step 6  残り ------------------------------------------------ */

  for (const inv of invs) {
    if (usedInv.has(inv)) continue;
    add("unpaid", "none", "none", [inv], [], "対応する入金が明細にありません。");
  }
  for (const pay of payments) {
    if (usedPay.has(pay)) continue;
    add("review", "orphan", "none", [], [pay], "この入金に対応する請求が台帳にありません。");
  }

  /* --- 並び順（問題のあるものを上に置く） -------------------------- */

  const statusRank: Record<MatchStatus, number> = { unpaid: 0, review: 1, matched: 2 };
  rows.sort((a, b) => {
    if (a.status !== b.status) return statusRank[a.status] - statusRank[b.status];
    const ai = a.invoices.length > 0;
    const bi = b.invoices.length > 0;
    if (ai !== bi) return ai ? -1 : 1; // 請求のない行（orphan）は末尾へ
    if (ai) return a.invoices[0].sourceLine - b.invoices[0].sourceLine;
    return a.payments[0].sourceLine - b.payments[0].sourceLine;
  });
  rows.forEach((row, i) => {
    row.group = i + 1;
  });

  const counts = { matched: 0, review: 0, unpaid: 0 };
  let clearedAmount = 0;
  let unpaidAmount = 0;
  for (const row of rows) {
    counts[row.status]++;
    if (row.status === "matched") clearedAmount += row.invoiceTotal;
    if (row.status === "unpaid") unpaidAmount += row.invoiceTotal;
  }

  return {
    rows,
    counts,
    clearedAmount,
    unpaidAmount,
    invoiceCount: invs.length,
    paymentCount: payments.length,
  };
}
