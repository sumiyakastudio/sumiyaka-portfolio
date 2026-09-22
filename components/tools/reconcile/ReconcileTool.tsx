"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import ToolMark from "@/components/tools/_marks/ToolMark";
import TrialNotice from "@/components/tools/_shared-ui/TrialNotice";
import { formatYen, safeFileName } from "@/lib/tools/_shared/format";
import { useTrialLimit } from "@/lib/tools/_shared/trialLimit";
import { reconcile } from "@/lib/tools/reconcile/calc";
import {
  SAMPLE_LEDGER,
  SAMPLE_LEDGER_ISSUES,
  SAMPLE_LEDGER_NAME,
  SAMPLE_STATEMENT,
  SAMPLE_STATEMENT_LAYOUT,
  SAMPLE_STATEMENT_NAME,
} from "@/lib/tools/reconcile/sample";
import {
  DEFAULT_MATCH_OPTIONS,
  FEE_TOLERANCE_CHOICES,
  REASON_LABELS,
  STATUS_LABELS,
  formatIsoSlash,
} from "@/lib/tools/reconcile/types";
import type {
  InvoiceEntry,
  MatchOptions,
  MatchRow,
  MatchStatus,
  ParseIssue,
  StatementEntry,
  StatementLayout,
} from "@/lib/tools/reconcile/types";
import styles from "./ReconcileTool.module.css";

/**
 * 入金消込 突合 — ツール本体
 *
 * ⚠ 設計の芯：**ブラウザ内で完結する**。
 *    読み込んだ請求台帳も銀行明細も、一切サーバへ送らない。fetch を書かない。
 *
 * ⚠ 端末に残すのは**照合の条件だけ**。金額と取引先名は業務データなので localStorage にも置かない。
 *
 * 重い依存（fflate を引く parse / csv）は動的 import。ページを開いただけでは落ちてこない。
 */

const STORAGE_KEY = "akashiki.tools.reconcile.options.v1";

const DAY_CHOICES = [0, 30, 60, 90, 180, 365] as const;

type FilterKey = "all" | MatchStatus;

/** 保存済みの条件を読む。壊れていたら黙って既定へ戻す */
function loadOptions(): MatchOptions | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MatchOptions>;
    if (typeof parsed !== "object" || parsed === null) return null;
    const num = (value: unknown, fallback: number, allowed: readonly number[]) =>
      typeof value === "number" && allowed.includes(value) ? value : fallback;
    return {
      feeTolerance: num(parsed.feeTolerance, DEFAULT_MATCH_OPTIONS.feeTolerance, FEE_TOLERANCE_CHOICES),
      feeAsMatched: typeof parsed.feeAsMatched === "boolean" ? parsed.feeAsMatched : true,
      daysBefore: num(parsed.daysBefore, DEFAULT_MATCH_OPTIONS.daysBefore, DAY_CHOICES),
      daysAfter: num(parsed.daysAfter, DEFAULT_MATCH_OPTIONS.daysAfter, DAY_CHOICES),
      findCombined: typeof parsed.findCombined === "boolean" ? parsed.findCombined : true,
      findSplit: typeof parsed.findSplit === "boolean" ? parsed.findSplit : true,
    };
  } catch {
    return null;
  }
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari は revoke が早すぎるとダウンロードが落ちるので少し待つ
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 元ファイルの何行を突合から外したか（error の行番号の数） */
function countDroppedLines(issues: readonly ParseIssue[]): number {
  return new Set(issues.filter((i) => i.level === "error" && i.line > 0).map((i) => i.line)).size;
}

function todayIso(): string {
  const now = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 支払期日と入金日の差（日数）。どちらかが空なら null */
function gapDays(due: string, paid: string): number | null {
  if (!due || !paid) return null;
  const a = Date.parse(`${paid}T00:00:00Z`);
  const b = Date.parse(`${due}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

export default function ReconcileTool() {
  const [ledger, setLedger] = useState<InvoiceEntry[]>(SAMPLE_LEDGER);
  const [ledgerName, setLedgerName] = useState(SAMPLE_LEDGER_NAME);
  const [ledgerIsSample, setLedgerIsSample] = useState(true);
  const [ledgerIssues, setLedgerIssues] = useState<ParseIssue[]>(SAMPLE_LEDGER_ISSUES);

  const [statement, setStatement] = useState<StatementEntry[]>(SAMPLE_STATEMENT);
  const [statementName, setStatementName] = useState(SAMPLE_STATEMENT_NAME);
  const [statementIsSample, setStatementIsSample] = useState(true);
  const [statementIssues, setStatementIssues] = useState<ParseIssue[]>([]);
  const [layout, setLayout] = useState<StatementLayout | null>(SAMPLE_STATEMENT_LAYOUT);

  const [options, setOptions] = useState<MatchOptions>(DEFAULT_MATCH_OPTIONS);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const [dragging, setDragging] = useState<"ledger" | "statement" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // お試し版の上限（書き出し＝CSVダウンロードを1回と数える。端末側だけで数え、サーバへは送らない）
  const trial = useTrialLimit("reconcile");

  const ledgerInputRef = useRef<HTMLInputElement>(null);
  const statementInputRef = useRef<HTMLInputElement>(null);

  // 保存済みの条件を復元する。
  // ⚠ 描画中に setState しないこと。サーバが描いた HTML と食い違って hydration が壊れる。
  useEffect(() => {
    const saved = loadOptions();
    if (saved) setOptions(saved);
  }, []);

  const updateOptions = useCallback((patch: Partial<MatchOptions>) => {
    setOptions((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* 保存できない設定のブラウザでは黙って諦める */
      }
      return next;
    });
  }, []);

  const result = useMemo(
    () => reconcile(ledger, statement, options),
    [ledger, statement, options],
  );

  const droppedLedger = useMemo(() => countDroppedLines(ledgerIssues), [ledgerIssues]);
  const droppedStatement = useMemo(() => countDroppedLines(statementIssues), [statementIssues]);

  /** 台帳と明細の指摘を1本のリストにまとめる */
  const issues = useMemo(
    () => [
      ...ledgerIssues.map((i) => ({ ...i, source: "台帳" })),
      ...statementIssues.map((i) => ({ ...i, source: "明細" })),
    ],
    [ledgerIssues, statementIssues],
  );

  const visibleRows = useMemo(
    () => (filter === "all" ? result.rows : result.rows.filter((r) => r.status === filter)),
    [result, filter],
  );

  /* ---------------- 読み込み ---------------- */

  const readLedgerFile = useCallback(async (file: File) => {
    setMessage(null);
    setBusy("請求台帳を読み込んでいます…");
    try {
      const { parseLedger } = await import("@/lib/tools/reconcile/parse");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseLedger({ name: file.name, bytes });
      setLedgerIssues(parsed.issues);
      if (parsed.entries.length > 0) {
        setLedger(parsed.entries);
        setLedgerName(parsed.sourceName || file.name);
        setLedgerIsSample(false);
        setOpenGroup(null);
      } else {
        setMessage(
          "請求台帳から読み取れる行がありませんでした。テンプレートの形式をご確認ください。",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ファイルを読み取れませんでした。");
    } finally {
      setBusy(null);
    }
  }, []);

  const readStatementFile = useCallback(async (file: File) => {
    setMessage(null);
    setBusy("入出金明細を読み込んでいます…");
    try {
      const { parseStatement } = await import("@/lib/tools/reconcile/parse");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseStatement({ name: file.name, bytes });
      setStatementIssues(parsed.issues);
      if (parsed.entries.length > 0) {
        setStatement(parsed.entries);
        setStatementName(parsed.sourceName || file.name);
        setStatementIsSample(false);
        setLayout(parsed.layout);
        setOpenGroup(null);
      } else {
        setMessage(
          "入出金明細から読み取れる行がありませんでした。見出し行のあるCSVか、最小テンプレートの形でお試しください。",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ファイルを読み取れませんでした。");
    } finally {
      setBusy(null);
    }
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, which: "ledger" | "statement") => {
      event.preventDefault();
      setDragging(null);
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      void (which === "ledger" ? readLedgerFile(file) : readStatementFile(file));
    },
    [readLedgerFile, readStatementFile],
  );

  const onFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>, which: "ledger" | "statement") => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      void (which === "ledger" ? readLedgerFile(file) : readStatementFile(file));
    },
    [readLedgerFile, readStatementFile],
  );

  const useSample = useCallback(() => {
    setLedger(SAMPLE_LEDGER);
    setLedgerName(SAMPLE_LEDGER_NAME);
    setLedgerIsSample(true);
    setLedgerIssues(SAMPLE_LEDGER_ISSUES);
    setStatement(SAMPLE_STATEMENT);
    setStatementName(SAMPLE_STATEMENT_NAME);
    setStatementIsSample(true);
    setStatementIssues([]);
    setLayout(SAMPLE_STATEMENT_LAYOUT);
    setFilter("all");
    setOpenGroup(null);
    setMessage(null);
  }, []);

  /* ---------------- 書き出し ---------------- */

  const exportCsv = useCallback(async () => {
    // お試し版の上限：数えてから書き出す。上限なら何もしない（重い処理の前に止める）
    if (!trial.consume()) return;
    setMessage(null);
    setBusy("突合表を組んでいます…");
    try {
      const { buildResultCsv, resultCsvFileName } = await import("@/lib/tools/reconcile/csv");
      const text = buildResultCsv(result, { onlyIssues });
      triggerDownload(
        new Blob([text], { type: "text/csv;charset=utf-8" }),
        safeFileName(resultCsvFileName(todayIso())),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CSVを書き出せませんでした。");
    } finally {
      setBusy(null);
    }
  }, [result, onlyIssues, trial]);

  /* ---------------- 描画 ---------------- */

  const tabs: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "すべて", count: result.rows.length },
    { key: "matched", label: STATUS_LABELS.matched, count: result.counts.matched },
    { key: "review", label: STATUS_LABELS.review, count: result.counts.review },
    { key: "unpaid", label: STATUS_LABELS.unpaid, count: result.counts.unpaid },
  ];

  return (
    <div className={styles.tool}>
      {/* ================= ステータス ================= */}
      <div className={styles.status}>
        <div className={styles.statusMain}>
          <ToolMark tool="reconcile" size={22} className={styles.statusMark} />
          <span className={styles.statusFile}>{ledgerName}</span>
          {ledgerIsSample ? <span className={styles.chipSample}>サンプル</span> : null}
          <span className={styles.statusSep} aria-hidden="true">
            ×
          </span>
          <span className={styles.statusFile}>{statementName}</span>
          {statementIsSample ? <span className={styles.chipSample}>サンプル</span> : null}
        </div>
        <dl className={styles.statusStats}>
          <div>
            <dt>自動一致</dt>
            <dd>
              {result.counts.matched}
              <span>件</span>
            </dd>
          </div>
          <div>
            <dt>要確認</dt>
            <dd>
              {result.counts.review}
              <span>件</span>
            </dd>
          </div>
          <div>
            <dt>未入金</dt>
            <dd>
              {result.counts.unpaid}
              <span>件</span>
            </dd>
          </div>
          <div>
            <dt>消込できた金額</dt>
            <dd>{formatYen(result.clearedAmount)}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.layout}>
        {/* ================= 左：操作 ================= */}
        <div className={styles.panel}>
          {/* ---- 01 請求台帳 ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>01</span>請求台帳を読み込む
            </h3>

            <div
              className={`${styles.drop} ${dragging === "ledger" ? styles.dropOver : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging("ledger");
              }}
              onDragLeave={() => setDragging(null)}
              onDrop={(e) => onDrop(e, "ledger")}
              onClick={() => ledgerInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  ledgerInputRef.current?.click();
                }
              }}
            >
              <span className={styles.dropIcon} aria-hidden="true" />
              <span className={styles.dropText}>Excel（.xlsx）か CSV をここへ</span>
              <span className={styles.dropSub}>1行 ＝ 請求1件／押しても選べます</span>
              <input
                ref={ledgerInputRef}
                type="file"
                accept=".xlsx,.csv,text/csv"
                className={styles.fileInput}
                onChange={(e) => onFileChange(e, "ledger")}
              />
            </div>

            <div className={styles.rowButtons}>
              <a
                className={styles.ghostButton}
                href="/tools/reconcile/reconcile-ledger-template.xlsx"
                download="請求台帳テンプレート.xlsx"
              >
                テンプレート .xlsx
              </a>
              <a
                className={styles.ghostButton}
                href="/tools/reconcile/reconcile-ledger-template.csv"
                download="請求台帳テンプレート.csv"
              >
                .csv
              </a>
              <button type="button" className={styles.ghostButton} onClick={useSample}>
                サンプルで試す
              </button>
            </div>

            <p className={styles.stepNote}>
              請求{result.invoiceCount}件を突合に使います。
              {droppedLedger > 0 ? `（${droppedLedger}行は読み取れず、含めていません）` : ""}
            </p>
          </section>

          {/* ---- 02 入出金明細 ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>02</span>入出金明細を読み込む
            </h3>

            <div
              className={`${styles.drop} ${dragging === "statement" ? styles.dropOver : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging("statement");
              }}
              onDragLeave={() => setDragging(null)}
              onDrop={(e) => onDrop(e, "statement")}
              onClick={() => statementInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  statementInputRef.current?.click();
                }
              }}
            >
              <span className={styles.dropIcon} aria-hidden="true" />
              <span className={styles.dropText}>銀行の入出金明細 CSV をここへ</span>
              <span className={styles.dropSub}>
                見出し行があれば、多くの銀行の形をそのまま読みます／押しても選べます
              </span>
              <input
                ref={statementInputRef}
                type="file"
                accept=".csv,text/csv,.xlsx"
                className={styles.fileInput}
                onChange={(e) => onFileChange(e, "statement")}
              />
            </div>

            <div className={styles.rowButtons}>
              <a
                className={styles.ghostButton}
                href="/tools/reconcile/reconcile-statement-template.csv"
                download="入出金明細テンプレート.csv"
              >
                最小テンプレート .csv
              </a>
            </div>

            {layout ? (
              <dl className={styles.layoutInfo}>
                {layout.guessedBank ? (
                  <div>
                    <dt>形式</dt>
                    <dd>{layout.guessedBank}の明細のようです</dd>
                  </div>
                ) : null}
                <div>
                  <dt>日付</dt>
                  <dd>{layout.dateHeader || "—"}</dd>
                </div>
                <div>
                  <dt>摘要</dt>
                  <dd>{layout.descHeaders.length > 0 ? layout.descHeaders.join(" ＋ ") : "—"}</dd>
                </div>
                <div>
                  <dt>入金</dt>
                  <dd>
                    {layout.amountShape === "twoColumn"
                      ? layout.creditHeader || "—"
                      : layout.amountShape === "signed"
                        ? "符号つきの1列"
                        : `${layout.kindHeader} で判定`}
                  </dd>
                </div>
              </dl>
            ) : null}

            <p className={styles.stepNote}>
              入金{result.paymentCount}件を突合に使います。
              {layout && layout.skippedDebits > 0
                ? `出金${layout.skippedDebits}行は対象外にしました。`
                : ""}
              {droppedStatement > 0 ? `（${droppedStatement}行は読み取れず、含めていません）` : ""}
            </p>

          </section>

          {/* ---- 読み取りの指摘（台帳と明細をまとめて1本に） ---- */}
          {issues.length > 0 ? (
            <section className={styles.stepPlain} aria-label="読み取りの指摘">
              <h3 className={styles.stepTitlePlain}>読み取りの指摘</h3>
              <ul className={styles.issues}>
                {issues.slice(0, 8).map((issue, i) => (
                  <li
                    key={i}
                    className={issue.level === "error" ? styles.issueError : styles.issueWarn}
                  >
                    <span className={styles.issueLine}>
                      {issue.source}
                      {issue.line > 0 ? ` ${issue.line}行目` : " 全体"}
                    </span>
                    <span>{issue.message}</span>
                  </li>
                ))}
                {issues.length > 8 ? (
                  <li className={styles.issueMore}>ほか{issues.length - 8}件</li>
                ) : null}
              </ul>
              {droppedLedger + droppedStatement > 0 ? (
                <p className={styles.stepNote}>
                  読み取れなかった{droppedLedger + droppedStatement}行は、突合に含めていません。
                  0円や空欄で埋めて通すと、間違いに気づけなくなるためです。
                </p>
              ) : null}
            </section>
          ) : null}

          {/* ---- 03 照合の条件 ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>03</span>照合の条件
            </h3>

            <label className={styles.selectRow}>
              <span>振込手数料として見る差額</span>
              <select
                value={options.feeTolerance}
                onChange={(e) => updateOptions({ feeTolerance: Number(e.target.value) })}
              >
                {FEE_TOLERANCE_CHOICES.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? "見ない" : `${v.toLocaleString("ja-JP")}円まで`}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.selectRow}>
              <span>支払期日より前</span>
              <select
                value={options.daysBefore}
                onChange={(e) => updateOptions({ daysBefore: Number(e.target.value) })}
              >
                {DAY_CHOICES.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? "当日まで" : `${v}日前まで`}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.selectRow}>
              <span>支払期日より後</span>
              <select
                value={options.daysAfter}
                onChange={(e) => updateOptions({ daysAfter: Number(e.target.value) })}
              >
                {DAY_CHOICES.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? "当日まで" : `${v}日後まで`}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.checkRow}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={options.feeAsMatched}
                  onChange={(e) => updateOptions({ feeAsMatched: e.target.checked })}
                />
                <span>手数料差引を自動一致に含める</span>
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={options.findCombined}
                  onChange={(e) => updateOptions({ findCombined: e.target.checked })}
                />
                <span>合算入金を探す</span>
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={options.findSplit}
                  onChange={(e) => updateOptions({ findSplit: e.target.checked })}
                />
                <span>分割入金を探す</span>
              </label>
            </div>

            <p className={styles.stepNote}>
              読み込んだ台帳と明細は、この端末の中だけで処理され、どこにも送信されません。
              入金のデータは保存せず、上の条件だけがこの端末に残ります。
            </p>
          </section>

          {/* ---- 04 書き出す ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>04</span>突合表を書き出す
            </h3>

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={onlyIssues}
                onChange={(e) => setOnlyIssues(e.target.checked)}
              />
              <span>要確認と未入金だけを書き出す</span>
            </label>

            <div className={styles.exportRow}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={exportCsv}
                disabled={result.rows.length === 0 || busy !== null || trial.limited}
              >
                突合表をCSVで書き出す
              </button>
            </div>

            <TrialNotice trial={trial} />

            {busy ? <p className={styles.busy}>{busy}</p> : null}
            {message ? <p className={styles.message}>{message}</p> : null}
          </section>
        </div>

        {/* ================= 右：突合リスト（主役） ================= */}
        <div className={styles.stage}>
          <div className={styles.tabs} role="group" aria-label="表示の絞り込み">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`${styles.tab} ${filter === tab.key ? styles.tabActive : ""} ${
                  tab.key !== "all" ? styles[`tab_${tab.key}`] : ""
                }`}
                onClick={() => setFilter(tab.key)}
                aria-pressed={filter === tab.key}
              >
                {tab.label}
                <span className={styles.tabCount}>{tab.count}</span>
              </button>
            ))}
          </div>

          {visibleRows.length === 0 ? (
            <p className={styles.empty}>この区分に当てはまる行はありません。</p>
          ) : (
            <ul className={styles.docList}>
              {visibleRows.map((row) => (
                <ReconcileRow
                  key={row.group}
                  row={row}
                  open={openGroup === row.group}
                  onToggle={() => setOpenGroup(openGroup === row.group ? null : row.group)}
                />
              ))}
            </ul>
          )}

          <p className={styles.stageNote}>
            行を押すと、判定の理由と、照合に使ったキーが開きます。
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 1行（主役の絵）
 * ------------------------------------------------------------------ */

function ReconcileRow({
  row,
  open,
  onToggle,
}: {
  row: MatchRow;
  open: boolean;
  onToggle: () => void;
}) {
  const firstInvoice = row.invoices[0];
  const firstPayment = row.payments[0];
  const gap = firstInvoice && firstPayment ? gapDays(firstInvoice.dueDate, firstPayment.date) : null;

  const invoiceLabel =
    row.invoices.length === 0
      ? "台帳に該当なし"
      : row.invoices.length === 1
        ? firstInvoice.invoiceNo
        : `${firstInvoice.invoiceNo} ほか${row.invoices.length - 1}件`;

  const clientLabel =
    row.invoices.length === 0
      ? firstPayment?.payerRaw || "—"
      : firstInvoice.clientName;

  return (
    <li className={styles.docRow}>
      <button
        type="button"
        className={`${styles.docItem} ${styles[`is_${row.status}`]} ${open ? styles.docItemOpen : ""}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={styles.rowTop}>
          {/* 色だけに意味を持たせない。必ず文字のラベルを置く */}
          <span className={styles.rowStatus}>{STATUS_LABELS[row.status]}</span>
          <span className={styles.rowReason}>{REASON_LABELS[row.reason]}</span>
          <span className={styles.rowNo}>{invoiceLabel}</span>
          <span className={styles.rowClient}>{clientLabel}</span>
          <span className={styles.rowAmount}>
            {row.invoices.length > 0 ? `請求 ${formatYen(row.invoiceTotal)}` : ""}
          </span>
        </span>
        {/* 入金が無い行（未入金）では2段目を出さない。
            1段目の判定理由が既に「入金なし」と言っており、繰り返すと同じ情報が2箇所に出る */}
        {firstPayment ? (
          <span className={styles.rowBottom}>
            <span className={styles.rowDate}>{formatIsoSlash(firstPayment.date)}</span>
            <span className={styles.rowDesc}>
              {row.payments.length > 1
                ? `${firstPayment.description} ほか${row.payments.length - 1}件`
                : firstPayment.description}
            </span>
            <span className={styles.rowAmount}>入金 {formatYen(row.paymentTotal)}</span>
            {/* 「自動一致」なのに「不足 ¥550」と出ると判定と矛盾して読める。
                手数料と判断した差額は、そのまま「手数料」と書く */}
            <span className={`${styles.rowDiff} ${row.diff !== 0 ? styles.rowDiffOn : ""}`}>
              {row.invoices.length === 0
                ? ""
                : row.diff === 0
                  ? "±0"
                  : row.reason === "feeDeducted"
                    ? `手数料 ${formatYen(row.diff)}`
                    : row.diff > 0
                      ? `不足 ${formatYen(row.diff)}`
                      : `超過 ${formatYen(-row.diff)}`}
            </span>
          </span>
        ) : null}
      </button>

      {open ? (
        <div className={styles.detail}>
          {row.note ? <p className={styles.detailNote}>{row.note}</p> : null}

          <dl className={styles.detailKeys}>
            <div>
              <dt>台帳の照合キー</dt>
              <dd>{firstInvoice ? firstInvoice.key : "—"}</dd>
            </div>
            <div>
              <dt>明細の照合キー</dt>
              <dd>{firstPayment ? firstPayment.key || "（摘要から取れませんでした）" : "—"}</dd>
            </div>
            {gap !== null ? (
              <div>
                <dt>支払期日との差</dt>
                <dd>
                  {gap === 0
                    ? "期日ちょうど"
                    : gap > 0
                      ? `${gap}日 遅い`
                      : `${-gap}日 早い`}
                </dd>
              </div>
            ) : null}
          </dl>

          {row.invoices.length > 0 ? (
            <table className={styles.detailTable}>
              <caption>この判定に含まれる請求</caption>
              <tbody>
                {row.invoices.map((inv) => (
                  <tr key={inv.invoiceNo + inv.sourceLine}>
                    <th scope="row">{inv.invoiceNo}</th>
                    <td>{inv.clientName}</td>
                    <td>{inv.dueDate ? `期日 ${formatIsoSlash(inv.dueDate)}` : "期日なし"}</td>
                    <td className={styles.num}>{formatYen(inv.amount)}</td>
                    <td className={styles.line}>{inv.sourceLine}行目</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {row.payments.length > 0 ? (
            <table className={styles.detailTable}>
              <caption>この判定に含まれる入金</caption>
              <tbody>
                {row.payments.map((pay) => (
                  <tr key={pay.sourceLine}>
                    <th scope="row">{formatIsoSlash(pay.date)}</th>
                    <td colSpan={2}>{pay.description}</td>
                    <td className={styles.num}>{formatYen(pay.amount)}</td>
                    <td className={styles.line}>{pay.sourceLine}行目</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
