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

import { formatNumber, formatYen, safeFileName } from "@/lib/tools/_shared/format";
import { useTrialLimit } from "@/lib/tools/_shared/trialLimit";
import { buildReport, foldMonthly } from "@/lib/tools/report/calc";
import { formatMonthJa } from "@/lib/tools/report/display";
import {
  SAMPLE_META,
  SAMPLE_SALES,
  SAMPLE_SOURCE_NAME,
} from "@/lib/tools/report/sample";
import {
  DEFAULT_REPORT_OPTIONS,
  MAX_SPAN_MONTHS,
} from "@/lib/tools/report/types";
import type {
  BreakdownAxis,
  ParseIssue,
  ReportMeta,
  ReportOptions,
  SalesRow,
} from "@/lib/tools/report/types";
import ToolMark from "@/components/tools/_marks/ToolMark";
import TrialNotice from "@/components/tools/_shared-ui/TrialNotice";
import MonthlyReportPaper from "./MonthlyReportPaper";
import styles from "./MonthlyReportTool.module.css";

/**
 * 月次レポートPDF — ツール本体
 *
 * ⚠ 設計の芯：**ブラウザ内で完結する**。
 *    読み込んだ売上表も、入力した会社名も、書き出したPDFも、一切サーバへ送らない。
 *    ネットワークに出るのは、PDF用の日本語書体（当サイトの静的ファイル）だけ。
 *
 * 重い依存（fflate / pdf-lib / 書体 5.4MB）はすべて動的 import にしてある。
 * ページを開いただけでは落ちてこない。
 */

const STORAGE_KEY = "akashiki.tools.report.meta.v1";
/** 表示する月数の選択肢（版面の都合で 14 が上限） */
const SPAN_CHOICES = [12, MAX_SPAN_MONTHS];

function emptyMeta(): ReportMeta {
  return { organization: "", authorName: "", createdDate: "", title: "" };
}

/** 保存済みの表題・作成者を読む。壊れていたら黙って捨てる */
function loadMeta(): ReportMeta | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReportMeta>;
    if (typeof parsed !== "object" || parsed === null) return null;
    return { ...emptyMeta(), ...parsed };
  } catch {
    return null;
  }
}

function triggerDownload(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari は revoke が早すぎるとダウンロードが落ちるので次のフレームまで待つ
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function MonthlyReportTool() {
  const [rows, setRows] = useState<SalesRow[]>(SAMPLE_SALES);
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [dropped, setDropped] = useState(0);
  const [sourceName, setSourceName] = useState(SAMPLE_SOURCE_NAME);
  const [isSample, setIsSample] = useState(true);
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_REPORT_OPTIONS);
  const [meta, setMeta] = useState<ReportMeta>(SAMPLE_META);
  const [metaIsSample, setMetaIsSample] = useState(true);
  const [remember, setRemember] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fontPct, setFontPct] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trial = useTrialLimit("report");

  // 保存済みの表題・作成者があれば復元する（初回描画後・SSRでは触らない）
  useEffect(() => {
    const saved = loadMeta();
    if (saved && (saved.organization || saved.title || saved.authorName)) {
      setMeta(saved);
      setMetaIsSample(false);
      setRemember(true);
    }
  }, []);

  // 「この端末に保存する」が入っている間だけ書き戻す
  useEffect(() => {
    if (!remember || metaIsSample) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
    } catch {
      /* 保存できない設定のブラウザでは黙って諦める */
    }
  }, [meta, remember, metaIsSample]);

  const doc = useMemo(() => buildReport(rows, options), [rows, options]);

  /** 対象月の候補（新しい順） */
  const months = useMemo(() => [...foldMonthly(rows).values()].reverse(), [rows]);

  const period = useMemo(() => {
    if (months.length === 0) return "—";
    const oldest = months[months.length - 1];
    const newest = months[0];
    return oldest.key === newest.key
      ? formatMonthJa(newest.key)
      : `${formatMonthJa(oldest.key)}〜${formatMonthJa(newest.key)}`;
  }, [months]);

  const updateMeta = useCallback((patch: Partial<ReportMeta>) => {
    setMeta((prev) => ({ ...prev, ...patch }));
    setMetaIsSample(false);
  }, []);

  const readSalesFile = useCallback(async (file: File) => {
    setMessage(null);
    setBusy("売上表を読み込んでいます…");
    try {
      const { parseSales } = await import("@/lib/tools/report/parse");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await parseSales({ name: file.name, bytes });
      setIssues(result.issues);
      setDropped(result.droppedRows);
      setSourceName(result.sourceName || file.name);

      if (result.rows.length > 0) {
        setRows(result.rows);
        setIsSample(false);
        // 新しい表を読んだら対象月は自動（＝いちばん新しい月）に戻す
        setOptions((prev) => ({ ...prev, targetKey: "" }));
      } else {
        setMessage(
          "集計できる明細がありませんでした。テンプレートの形式をご確認ください。",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ファイルを読み取れませんでした。",
      );
    } finally {
      setBusy(null);
    }
  }, []);

  const onFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void readSalesFile(file);
      event.target.value = "";
    },
    [readSalesFile],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void readSalesFile(file);
    },
    [readSalesFile],
  );

  const useSample = useCallback(() => {
    setRows(SAMPLE_SALES);
    setIssues([]);
    setDropped(0);
    setSourceName(SAMPLE_SOURCE_NAME);
    setIsSample(true);
    setOptions(DEFAULT_REPORT_OPTIONS);
    setMessage(null);
    if (metaIsSample) setMeta(SAMPLE_META);
  }, [metaIsSample]);

  /** 書体（5.4MB）を必要になった時だけ落とす */
  const ensureFont = useCallback(async () => {
    const { loadJpFont } = await import("@/lib/tools/_shared/font");
    return loadJpFont((loaded, total) => {
      setFontPct(total > 0 ? Math.round((loaded / total) * 100) : null);
    }).finally(() => setFontPct(null));
  }, []);

  const exportPdf = useCallback(async () => {
    if (!doc) return;
    if (!trial.consume()) return;
    setMessage(null);
    setBusy("レポートを組んでいます…");
    try {
      const fontBytes = await ensureFont();
      const { renderMonthlyReportPdf } = await import("@/lib/tools/report/pdf");
      const pdf = await renderMonthlyReportPdf({
        doc,
        meta,
        fontBytes,
        source: { name: sourceName, rows: rows.length },
      });
      triggerDownload(pdf, `${safeFileName(`月次レポート_${doc.target.key}`)}.pdf`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "PDFを書き出せませんでした。",
      );
    } finally {
      setBusy(null);
    }
  }, [doc, meta, sourceName, rows.length, ensureFont, trial]);

  const selectedKey = doc?.target.key ?? "";

  return (
    <div className={styles.tool}>
      {/* ================= ステータス ================= */}
      <div className={styles.status}>
        <div className={styles.statusMain}>
          <ToolMark tool="report" size={22} className={styles.statusMark} />
          <span className={styles.statusFile}>{sourceName}</span>
          {isSample ? <span className={styles.chipSample}>サンプル</span> : null}
        </div>
        <dl className={styles.statusStats}>
          <div>
            <dt>明細</dt>
            <dd>
              {formatNumber(rows.length)}
              <span>行</span>
            </dd>
          </div>
          <div>
            <dt>期間</dt>
            <dd>{period}</dd>
          </div>
          <div>
            <dt>対象月</dt>
            <dd>{selectedKey ? formatMonthJa(selectedKey) : "—"}</dd>
          </div>
          <div>
            <dt>区分</dt>
            <dd>
              {doc ? formatNumber(doc.breakdown.length) : "0"}
              <span>件</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className={styles.layout}>
        {/* ================= 左：操作 ================= */}
        <div className={styles.panel}>
          {/* ---- 1. 売上表 ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>01</span>売上表を読み込む
            </h3>

            <div
              className={`${styles.drop} ${dragging ? styles.dropOver : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <span className={styles.dropIcon} aria-hidden="true" />
              <span className={styles.dropText}>Excel（.xlsx）か CSV をここへ</span>
              <span className={styles.dropSub}>
                日付と金額の列があれば読めます／押しても選べます
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv,text/csv"
                className={styles.fileInput}
                onChange={onFileChange}
              />
            </div>

            <div className={styles.rowButtons}>
              <a
                className={styles.ghostButton}
                href="/tools/report/monthly-sales-template.xlsx"
                download="売上表テンプレート.xlsx"
              >
                テンプレート .xlsx
              </a>
              <a
                className={styles.ghostButton}
                href="/tools/report/monthly-sales-template.csv"
                download="売上表テンプレート.csv"
              >
                .csv
              </a>
              <button type="button" className={styles.ghostButton} onClick={useSample}>
                サンプルで試す
              </button>
            </div>

            <p className={styles.privacy}>
              読み込んだ売上表も、入力した会社名も、この端末の中だけで処理されます。
              どこにも送信されません。
            </p>

            {issues.length > 0 ? (
              <ul className={styles.issues}>
                {issues.slice(0, 8).map((issue, i) => (
                  <li
                    key={i}
                    className={
                      issue.level === "error" ? styles.issueError : styles.issueWarn
                    }
                  >
                    <span className={styles.issueLine}>
                      {issue.line > 0 ? `${issue.line}行目` : "全体"}
                    </span>
                    <span>{issue.message}</span>
                  </li>
                ))}
                {issues.length > 8 ? (
                  <li className={styles.issueMore}>ほか{issues.length - 8}件</li>
                ) : null}
              </ul>
            ) : null}
            {dropped > 0 ? (
              <p className={styles.issueSummary}>
                {dropped}行を集計に含めていません。読み取れなかった値を0円として混ぜると、
                合計が静かにずれるためです。
              </p>
            ) : null}
          </section>

          {/* ---- 2. 条件 ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>02</span>レポートの条件
            </h3>

            <p className={styles.stepNote}>対象月（新しい順）</p>
            <ul className={styles.docList}>
              {months.map((month) => (
                <li key={month.key}>
                  <button
                    type="button"
                    className={`${styles.docItem} ${
                      month.key === selectedKey ? styles.docItemActive : ""
                    }`}
                    onClick={() =>
                      setOptions((prev) => ({ ...prev, targetKey: month.key }))
                    }
                  >
                    <span className={styles.docNo}>{formatMonthJa(month.key)}</span>
                    <span className={styles.docAmount}>{formatYen(month.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className={styles.selectGrid}>
              <label className={styles.selectRow}>
                <span>年度の期首月</span>
                <select
                  value={options.fiscalStartMonth}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      fiscalStartMonth: Number(e.target.value),
                    }))
                  }
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}月
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.selectRow}>
                <span>区分の軸</span>
                <select
                  value={options.axis}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      axis: e.target.value as BreakdownAxis,
                    }))
                  }
                >
                  <option value="item">商品・サービス別</option>
                  <option value="client">取引先別</option>
                </select>
              </label>

              <label className={styles.selectRow}>
                <span>表示する月数</span>
                <select
                  value={options.spanMonths}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      spanMonths: Number(e.target.value),
                    }))
                  }
                >
                  {SPAN_CHOICES.map((n) => (
                    <option key={n} value={n}>
                      {n}か月
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* ---- 3. 表題と作成者 ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>03</span>表題と作成者
            </h3>
            <p className={styles.stepNote}>
              入力した内容はこの端末の中だけに残ります。送信されません。
            </p>

            <div className={styles.fields}>
              <label className={styles.fieldWide}>
                <span>表題</span>
                <input
                  type="text"
                  value={meta.title}
                  placeholder="月次レポート"
                  onChange={(e) => updateMeta({ title: e.target.value })}
                />
              </label>
              <label className={styles.fieldWide}>
                <span>会社名・部署</span>
                <input
                  type="text"
                  value={meta.organization}
                  placeholder="株式会社〇〇　営業部"
                  onChange={(e) => updateMeta({ organization: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span>作成者</span>
                <input
                  type="text"
                  value={meta.authorName}
                  placeholder="山田 太郎"
                  onChange={(e) => updateMeta({ authorName: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span>作成日</span>
                <input
                  type="date"
                  value={meta.createdDate}
                  onChange={(e) => updateMeta({ createdDate: e.target.value })}
                />
              </label>
            </div>

            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>この端末に保存する</span>
            </label>
          </section>

          {/* ---- 4. 書き出し ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>04</span>書き出す
            </h3>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={exportPdf}
              disabled={!doc || busy !== null || trial.limited}
            >
              このレポートをPDFで書き出す
            </button>
            <TrialNotice trial={trial} />

            {busy ? (
              <p className={styles.busy}>
                {busy}
                {fontPct !== null ? `（書体 ${fontPct}%）` : ""}
              </p>
            ) : null}
            {message ? <p className={styles.message}>{message}</p> : null}
          </section>
        </div>

        {/* ================= 右：紙面 ================= */}
        <div className={styles.stage}>
          {doc ? (
            /* SPではA4横を縮めると読めないので、最低幅を確保して横スクロールにする */
            <div className={styles.paperScroll}>
              <MonthlyReportPaper
                doc={doc}
                meta={meta}
                source={{ name: sourceName, rows: rows.length }}
              />
            </div>
          ) : (
            <p className={styles.empty}>
              集計できる売上表がありません。テンプレートの形式をご確認ください。
            </p>
          )}

          <p className={styles.spHint}>横にスクロールできます。</p>
          <p className={styles.stageNote}>
            紙面はA4横1枚です。PDFにも同じ内容が入ります。
            {doc && doc.missing.length > 0
              ? `　表示期間のうち${doc.missing.length}か月はデータが無いため、棒を描かずに要約で明記しています。`
              : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
