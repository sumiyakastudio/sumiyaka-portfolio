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
import { buildInvoices, checkCompliance } from "@/lib/tools/invoice/calc";
import { SAMPLE_ISSUER, SAMPLE_LEDGER } from "@/lib/tools/invoice/sample";
import { formatYen, safeFileName } from "@/lib/tools/_shared/format";
import { useTrialLimit } from "@/lib/tools/_shared/trialLimit";
import type {
  Issuer,
  LedgerRow,
  ParseIssue,
  Rounding,
} from "@/lib/tools/invoice/types";
import ToolMark from "@/components/tools/_marks/ToolMark";
import TrialNotice from "@/components/tools/_shared-ui/TrialNotice";
import InvoicePaper from "./InvoicePaper";
import styles from "./InvoiceBatchTool.module.css";

/**
 * 請求書PDF 一括作成 — ツール本体
 *
 * ⚠ 設計の芯：**ブラウザ内で完結する**。
 *    読み込んだ台帳も、入力した自社情報も、生成したPDFも、一切サーバへ送らない。
 *    ネットワークに出るのは、PDF用の日本語フォント（当サイトの静的ファイル）だけ。
 *
 * 重い依存（fflate / pdf-lib）はすべて動的 import にしてある。
 * ページを開いただけでは読み込まれず、操作した時だけ落ちてくる。
 */

const STORAGE_KEY = "akashiki.tools.invoice.issuer.v1";
/** 角印・ロゴの上限（data URL 化するので大きい画像は弾く） */
const IMAGE_MAX_BYTES = 400 * 1024;

function emptyIssuer(): Issuer {
  return {
    companyName: "",
    registrationNo: "",
    zip: "",
    address: "",
    tel: "",
    email: "",
    personName: "",
    bank: { name: "", branch: "", type: "普通", number: "", holder: "" },
    closingNote: "",
    sealDataUrl: "",
    logoDataUrl: "",
  };
}

/** 保存済みの自社情報を読む。壊れていたら黙って捨てる */
function loadIssuer(): Issuer | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Issuer>;
    if (typeof parsed !== "object" || parsed === null) return null;
    return { ...emptyIssuer(), ...parsed, bank: { ...emptyIssuer().bank, ...(parsed.bank ?? {}) } };
  } catch {
    return null;
  }
}

function triggerDownload(bytes: Uint8Array | Blob, fileName: string) {
  const blob =
    bytes instanceof Blob
      ? bytes
      : new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
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

export default function InvoiceBatchTool() {
  const [rows, setRows] = useState<LedgerRow[]>(SAMPLE_LEDGER);
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [sourceName, setSourceName] = useState("サンプル台帳");
  const [isSample, setIsSample] = useState(true);
  const [issuer, setIssuer] = useState<Issuer>(SAMPLE_ISSUER);
  const [issuerIsSample, setIssuerIsSample] = useState(true);
  const [remember, setRemember] = useState(false);
  const [rounding, setRounding] = useState<Rounding>("floor");
  const [selected, setSelected] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fontPct, setFontPct] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trial = useTrialLimit("invoice");

  // 保存済みの自社情報があれば復元する（初回描画後・SSRでは触らない）
  useEffect(() => {
    const saved = loadIssuer();
    if (saved && saved.companyName) {
      setIssuer(saved);
      setIssuerIsSample(false);
      setRemember(true);
    }
  }, []);

  // 「この端末に保存する」が入っている間だけ書き戻す
  useEffect(() => {
    if (!remember || issuerIsSample) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(issuer));
    } catch {
      /* 保存できない設定のブラウザでは黙って諦める */
    }
  }, [issuer, remember, issuerIsSample]);

  const docs = useMemo(
    () => buildInvoices(rows, { rounding }),
    [rows, rounding],
  );

  const current = docs[Math.min(selected, Math.max(docs.length - 1, 0))];
  const compliance = useMemo(
    () => (current ? checkCompliance(issuer, current) : []),
    [issuer, current],
  );
  const grandTotal = useMemo(
    () => docs.reduce((sum, doc) => sum + doc.total, 0),
    [docs],
  );

  const updateIssuer = useCallback(
    (patch: Partial<Issuer>) => {
      setIssuer((prev) => ({ ...prev, ...patch }));
      setIssuerIsSample(false);
    },
    [],
  );

  const updateBank = useCallback(
    (patch: Partial<Issuer["bank"]>) => {
      setIssuer((prev) => ({ ...prev, bank: { ...prev.bank, ...patch } }));
      setIssuerIsSample(false);
    },
    [],
  );

  const readLedgerFile = useCallback(async (file: File) => {
    setMessage(null);
    setBusy("台帳を読み込んでいます…");
    try {
      const { parseLedger } = await import("@/lib/tools/invoice/parse");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await parseLedger({ name: file.name, bytes });
      setIssues(result.issues);
      setSourceName(result.sourceName || file.name);

      // ⚠ 読み取れなかった値は 0 で埋められて返ってくる。そのまま請求書にすると
      //    「¥0の明細」が黙って紛れ込む＝いちばん危ない事故になるので、
      //    error のある行は請求書に載せない（何行外したかは画面に出す）。
      const errorLines = new Set(
        result.issues
          .filter((issue) => issue.level === "error" && issue.line > 0)
          .map((issue) => issue.line),
      );
      const usable = result.rows.filter(
        (row) => !errorLines.has(row.sourceLine),
      );
      setSkipped(result.rows.length - usable.length);

      if (usable.length > 0) {
        setRows(usable);
        setIsSample(false);
        setSelected(0);
      } else {
        setMessage(
          "読み取れる明細がありませんでした。テンプレートの形式をご確認ください。",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "ファイルを読み取れませんでした。",
      );
    } finally {
      setBusy(null);
    }
  }, []);

  const onFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void readLedgerFile(file);
      event.target.value = "";
    },
    [readLedgerFile],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void readLedgerFile(file);
    },
    [readLedgerFile],
  );

  const onSealChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>, key: "sealDataUrl" | "logoDataUrl") => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (file.size > IMAGE_MAX_BYTES) {
        setMessage("角印の画像は400KB以内にしてください。");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          updateIssuer({ [key]: reader.result } as Partial<Issuer>);
        }
      };
      reader.readAsDataURL(file);
    },
    [updateIssuer],
  );

  const useSample = useCallback(() => {
    setRows(SAMPLE_LEDGER);
    setIssues([]);
    setSkipped(0);
    setSourceName("サンプル台帳");
    setIsSample(true);
    setSelected(0);
    setMessage(null);
    if (issuerIsSample) setIssuer(SAMPLE_ISSUER);
  }, [issuerIsSample]);

  /** フォント（5.4MB）を必要になった時だけ落とす */
  const ensureFont = useCallback(async () => {
    const { loadJpFont } = await import("@/lib/tools/_shared/font");
    return loadJpFont((loaded, total) => {
      setFontPct(total > 0 ? Math.round((loaded / total) * 100) : null);
    }).finally(() => setFontPct(null));
  }, []);

  const exportOne = useCallback(async () => {
    if (!current) return;
    if (!trial.consume()) return;
    setMessage(null);
    setBusy("PDFを組んでいます…");
    try {
      const fontBytes = await ensureFont();
      const { renderInvoicePdf } = await import("@/lib/tools/invoice/pdf");
      const pdf = await renderInvoicePdf({ doc: current, issuer, fontBytes });
      triggerDownload(
        pdf,
        `${safeFileName(current.invoiceNo)}_${safeFileName(current.client.name)}.pdf`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "PDFを書き出せませんでした。",
      );
    } finally {
      setBusy(null);
    }
  }, [current, issuer, ensureFont, trial]);

  const exportAll = useCallback(async () => {
    if (docs.length === 0) return;
    if (!trial.consume()) return;
    setMessage(null);
    setBusy("すべての請求書を組んでいます…");
    try {
      const fontBytes = await ensureFont();
      const { renderInvoicePdf } = await import("@/lib/tools/invoice/pdf");
      const { zipSync } = await import("fflate");
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < docs.length; i += 1) {
        const doc = docs[i];
        setBusy(`PDFを組んでいます… ${i + 1} / ${docs.length}`);
        const pdf = await renderInvoicePdf({ doc, issuer, fontBytes });
        const name = `${safeFileName(doc.invoiceNo)}_${safeFileName(doc.client.name)}.pdf`;
        files[name in files ? `${i + 1}_${name}` : name] = pdf;
      }
      // PDFは既に圧縮済みなので再圧縮しない（level:0＝格納のみ）
      const zipped = zipSync(files, { level: 0 });
      triggerDownload(
        new Blob([zipped.slice().buffer as ArrayBuffer], { type: "application/zip" }),
        `請求書_${docs.length}件.zip`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "PDFを書き出せませんでした。",
      );
    } finally {
      setBusy(null);
    }
  }, [docs, issuer, ensureFont, trial]);

  return (
    <div className={styles.tool}>
      {/* ================= ステータス ================= */}
      <div className={styles.status}>
        <div className={styles.statusMain}>
          <ToolMark tool="invoice" size={22} className={styles.statusMark} />
          <span className={styles.statusFile}>{sourceName}</span>
          {isSample ? <span className={styles.chipSample}>サンプル</span> : null}
        </div>
        <dl className={styles.statusStats}>
          <div>
            <dt>請求書</dt>
            <dd>{docs.length}<span>件</span></dd>
          </div>
          <div>
            <dt>明細</dt>
            <dd>{rows.length}<span>行</span></dd>
          </div>
          <div>
            <dt>合計（税込）</dt>
            <dd>{formatYen(grandTotal)}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.layout}>
        {/* ================= 左：操作 ================= */}
        <div className={styles.panel}>
          {/* ---- 1. 台帳 ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>01</span>台帳を読み込む
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
              <span className={styles.dropText}>
                Excel（.xlsx）か CSV をここへ
              </span>
              <span className={styles.dropSub}>押しても選べます</span>
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
                href="/tools/invoice/invoice-ledger-template.xlsx"
                download="請求書台帳テンプレート.xlsx"
              >
                テンプレート .xlsx
              </a>
              <a
                className={styles.ghostButton}
                href="/tools/invoice/invoice-ledger-template.csv"
                download="請求書台帳テンプレート.csv"
              >
                .csv
              </a>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={useSample}
              >
                サンプルで試す
              </button>
            </div>

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
                    {/* 列名は message 側に必ず含まれているので、ここでは重ねない */}
                    <span>{issue.message}</span>
                  </li>
                ))}
                {issues.length > 8 ? (
                  <li className={styles.issueMore}>
                    ほか{issues.length - 8}件
                  </li>
                ) : null}
              </ul>
            ) : null}
            {skipped > 0 ? (
              <p className={styles.issueSummary}>
                {skipped}行を請求書に載せていません。台帳を直してから読み込み直してください。
              </p>
            ) : null}
          </section>

          {/* ---- 2. 自社情報 ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>02</span>自社情報を入れる
            </h3>
            <p className={styles.stepNote}>
              入力した内容はこの端末の中だけに残ります。送信されません。
            </p>

            <div className={styles.fields}>
              <label className={styles.fieldWide}>
                <span>会社名・屋号</span>
                <input
                  type="text"
                  value={issuer.companyName}
                  placeholder="株式会社〇〇"
                  onChange={(e) => updateIssuer({ companyName: e.target.value })}
                />
              </label>
              <label className={styles.fieldWide}>
                <span>登録番号（インボイス）</span>
                <input
                  type="text"
                  value={issuer.registrationNo}
                  placeholder="T1234567890123"
                  onChange={(e) =>
                    updateIssuer({ registrationNo: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span>郵便番号</span>
                <input
                  type="text"
                  value={issuer.zip}
                  placeholder="100-0001"
                  onChange={(e) => updateIssuer({ zip: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span>電話</span>
                <input
                  type="text"
                  value={issuer.tel}
                  placeholder="03-0000-0000"
                  onChange={(e) => updateIssuer({ tel: e.target.value })}
                />
              </label>
              <label className={styles.fieldWide}>
                <span>住所</span>
                <input
                  type="text"
                  value={issuer.address}
                  onChange={(e) => updateIssuer({ address: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span>メール</span>
                <input
                  type="text"
                  value={issuer.email}
                  onChange={(e) => updateIssuer({ email: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span>担当者</span>
                <input
                  type="text"
                  value={issuer.personName}
                  onChange={(e) => updateIssuer({ personName: e.target.value })}
                />
              </label>

              <label className={styles.field}>
                <span>銀行名</span>
                <input
                  type="text"
                  value={issuer.bank.name}
                  onChange={(e) => updateBank({ name: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span>支店名</span>
                <input
                  type="text"
                  value={issuer.bank.branch}
                  onChange={(e) => updateBank({ branch: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span>種別</span>
                <input
                  type="text"
                  value={issuer.bank.type}
                  onChange={(e) => updateBank({ type: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span>口座番号</span>
                <input
                  type="text"
                  value={issuer.bank.number}
                  onChange={(e) => updateBank({ number: e.target.value })}
                />
              </label>
              <label className={styles.fieldWide}>
                <span>口座名義</span>
                <input
                  type="text"
                  value={issuer.bank.holder}
                  onChange={(e) => updateBank({ holder: e.target.value })}
                />
              </label>
              <label className={styles.fieldWide}>
                <span>備考（振込手数料の扱いなど）</span>
                <input
                  type="text"
                  value={issuer.closingNote}
                  onChange={(e) => updateIssuer({ closingNote: e.target.value })}
                />
              </label>
            </div>

            <div className={styles.rowButtons}>
              <label className={styles.ghostButton}>
                角印を選ぶ
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className={styles.fileInput}
                  onChange={(e) => onSealChange(e, "sealDataUrl")}
                />
              </label>
              {issuer.sealDataUrl ? (
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => updateIssuer({ sealDataUrl: "" })}
                >
                  角印を外す
                </button>
              ) : null}
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => {
                    setRemember(e.target.checked);
                    if (!e.target.checked) {
                      try {
                        window.localStorage.removeItem(STORAGE_KEY);
                      } catch {
                        /* noop */
                      }
                    }
                  }}
                />
                <span>この端末に保存する</span>
              </label>
            </div>

            {compliance.length > 0 ? (
              <>
                <ul className={styles.checks}>
                  {compliance.map((check) => (
                    <li
                      key={check.key}
                      className={check.ok ? styles.checkOk : styles.checkNg}
                    >
                      <span className={styles.checkMark} aria-hidden="true">
                        {check.ok ? "✓" : "―"}
                      </span>
                      <span className={styles.checkLabel}>{check.label}</span>
                      {!check.ok && check.hint ? (
                        <span className={styles.checkHint}>{check.hint}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {/* ✓ は記載項目が入っているかを見ているだけで、登録番号が実在の
                    登録事業者のものかまでは確かめていない（calc.ts は書式のみ判定）。
                    印だけを見て「要件を満たした」と読まれないよう必ず添える */}
                <p className={styles.checksNote}>
                  記載項目が入っているかを機械的に確かめています。適格請求書として有効かどうかの判断は代われません。
                </p>
              </>
            ) : null}
          </section>

          {/* ---- 3. 書き出し ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>03</span>確認して書き出す
            </h3>

            <label className={styles.selectRow}>
              <span>消費税の端数</span>
              <select
                value={rounding}
                onChange={(e) => setRounding(e.target.value as Rounding)}
              >
                <option value="floor">切り捨て</option>
                <option value="round">四捨五入</option>
                <option value="ceil">切り上げ</option>
              </select>
            </label>

            <ul className={styles.docList}>
              {docs.map((doc, i) => (
                <li key={`${doc.invoiceNo}-${i}`}>
                  <button
                    type="button"
                    className={`${styles.docItem} ${i === selected ? styles.docItemActive : ""}`}
                    onClick={() => setSelected(i)}
                  >
                    <span className={styles.docNo}>{doc.invoiceNo}</span>
                    <span className={styles.docClient}>{doc.client.name}</span>
                    <span className={styles.docAmount}>
                      {formatYen(doc.total)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className={styles.exportRow}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={exportOne}
                disabled={!current || busy !== null || trial.limited}
              >
                この1件をPDFで書き出す
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={exportAll}
                disabled={docs.length === 0 || busy !== null || trial.limited}
              >
                {docs.length}件まとめてZIPで書き出す
              </button>
            </div>
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

        {/* ================= 右：プレビュー ================= */}
        <div className={styles.stage}>
          <div className={styles.stageHead}>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => setSelected((i) => Math.max(0, i - 1))}
              disabled={selected <= 0}
              aria-label="前の請求書"
            >
              ←
            </button>
            <span className={styles.stageCount}>
              {docs.length === 0 ? "0 / 0" : `${selected + 1} / ${docs.length}`}
            </span>
            <button
              type="button"
              className={styles.navButton}
              onClick={() =>
                setSelected((i) => Math.min(docs.length - 1, i + 1))
              }
              disabled={selected >= docs.length - 1}
              aria-label="次の請求書"
            >
              →
            </button>
          </div>

          {current ? (
            /* SPではA4を縮めると読めないので、最低幅を確保して横スクロールにする */
            <div className={styles.paperScroll}>
              <InvoicePaper doc={current} issuer={issuer} />
            </div>
          ) : (
            <p className={styles.empty}>
              読み取れる請求書がありません。テンプレートの形式をご確認ください。
            </p>
          )}

          <p className={styles.spHint}>横にスクロールできます。</p>
          <p className={styles.stageNote}>
            プレビューは1ページ目です。PDFにはすべての明細が入り、A4で自動的に改ページされます。
          </p>
        </div>
      </div>
    </div>
  );
}
