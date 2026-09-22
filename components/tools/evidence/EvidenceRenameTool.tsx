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
import {
  buildPlan,
  buildZipFileName,
  collectFiles,
} from "@/lib/tools/evidence/calc";
import { buildIndexCsv, buildMapCsv } from "@/lib/tools/evidence/csv";
import { buildZipInput, listZipEntries } from "@/lib/tools/evidence/zip";
import {
  SAMPLE_FILES,
  SAMPLE_LEDGER,
  SAMPLE_SOURCE_NAME,
} from "@/lib/tools/evidence/sample";
import { formatDateJa, formatYen } from "@/lib/tools/_shared/format";
import {
  ACCEPTED_EXTENSIONS,
  DEFAULT_NAMING,
  INDEX_CSV_NAME,
  LEDGER_COLUMNS,
  MAP_CSV_NAME,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_LEDGER_ROWS,
  MAX_TOTAL_BYTES,
  NAMING_STORAGE_KEY,
  TABLE_INITIAL_ROWS,
  UNMATCHED_FOLDER,
} from "@/lib/tools/evidence/types";
import type {
  DateFormat,
  Delimiter,
  EvidenceFile,
  FolderMode,
  LedgerRow,
  NamePattern,
  NamingOptions,
  ParseIssue,
  RenamePair,
  RenamePlan,
  RenameStatus,
} from "@/lib/tools/evidence/types";
import ToolMark from "@/components/tools/_marks/ToolMark";
import { useTrialLimit } from "@/lib/tools/_shared/trialLimit";
import TrialNotice from "@/components/tools/_shared-ui/TrialNotice";
import styles from "./EvidenceRenameTool.module.css";

/**
 * 電帳法ファイル名 一括リネーム — ツール本体
 *
 * ⚠ 設計の芯：**ブラウザ内で完結する**。
 *    読み込んだ証憑も台帳も、書き出したZIPも、一切サーバへ送らない。
 *    T-03 は書体（PDF用フォント）を使わないので、
 *    このツールにはネットワークへ出る箇所が 1 つも無い（fetch も XHR も書かない）。
 *
 * ⚠ 元のファイルのバイト列は変えない。付け替えるのは名前だけ。
 * ⚠ 法令の要件を満たすことを保証しない。但し書きを常時表示する（§3-8）。
 *
 * 重い依存（fflate）は動的 import。ページを開いただけでは落ちてこない。
 */

/* ------------------------------------------------------------------ *
 * 画面の文言・選択肢
 * ------------------------------------------------------------------ */

/** 拡張子ホワイトリストから input[accept] を組む */
const ACCEPT_EVIDENCE = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

const PATTERN_OPTIONS: readonly { value: NamePattern; label: string }[] = [
  { value: "date_vendor_amount", label: "日付・取引先・金額" },
  { value: "date_amount_vendor", label: "日付・金額・取引先" },
  { value: "vendor_date_amount", label: "取引先・日付・金額" },
  { value: "serial", label: "連番のみ（索引簿で管理）" },
];

const DATE_OPTIONS: readonly { value: DateFormat; label: string }[] = [
  { value: "yyyymmdd", label: "20210131" },
  { value: "yyyy-mm-dd", label: "2021-01-31" },
];

const DELIMITER_OPTIONS: readonly { value: Delimiter; label: string }[] = [
  { value: "_", label: "_（アンダースコア）" },
  { value: "-", label: "-（ハイフン）" },
];

const FOLDER_OPTIONS: readonly { value: FolderMode; label: string }[] = [
  { value: "none", label: "分けない（ZIP直下）" },
  { value: "vendor", label: "取引先ごとのフォルダ" },
  { value: "vendor_short", label: "取引先フォルダ＋名前から取引先を省く" },
];

const STATUS_LABEL: Record<RenameStatus, string> = {
  ok: "そのまま",
  renumbered: "枝番あり",
  truncated: "切り詰め",
  unmatched: "未処理",
  missing: "ファイルなし",
  rejected: "対象外",
};

const STATUS_CLASS: Record<RenameStatus, string> = {
  ok: "rowOk",
  renumbered: "rowWarn",
  truncated: "rowWarn",
  unmatched: "rowMuted",
  missing: "rowBad",
  rejected: "rowBad",
};

/**
 * ★§3-8 の但し書き。文言は一言一句そのまま。折りたたまない。
 *   （計画書の行折り返しは原稿の都合なので、文としてつなげてある）
 */
const DISCLAIMER_LINES: readonly string[] = [
  "このツールが行うのは、ファイル名の付け替えと索引簿の作成だけです。",
  "電子帳簿保存法の要件を満たすことを保証するものではありません。",
  "検索要件は、事業者の状況によって不要になる場合があります（判定期間に係る基準期間の売上高が5,000万円以下のときなど）。一方で、ファイル名以外にも必要な対応（改ざん防止措置、事務処理規程の備付けなど）があります。",
  "ご自身に必要な要件については、国税庁「電子帳簿保存法一問一答【電子取引関係】」をご確認のうえ、必要に応じて顧問税理士にご相談ください。",
];

const NTA_QA_URL =
  "https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/07denshi/index.htm";
const NTA_SAMPLE_URL =
  "https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/0021006-031.htm";

const PLACEHOLDER_TO = "台帳を読み込むと決まります";

/* ------------------------------------------------------------------ *
 * 小さな道具
 * ------------------------------------------------------------------ */

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return "0KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${formatMb(bytes)}MB`;
}

/** 保存済みの値が選択肢に無ければ既定へ落とす */
function pickOption<T extends string>(
  value: unknown,
  options: readonly { value: T }[],
  fallback: T,
): T {
  return options.some((option) => option.value === value)
    ? (value as T)
    : fallback;
}

/** 命名オプションだけを localStorage から復元する。壊れていたら黙って捨てる */
function loadNaming(): NamingOptions | null {
  try {
    const raw = window.localStorage.getItem(NAMING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NamingOptions>;
    if (typeof parsed !== "object" || parsed === null) return null;
    const pattern = pickOption(
      parsed.pattern,
      PATTERN_OPTIONS,
      DEFAULT_NAMING.pattern,
    );
    let folder = pickOption(parsed.folder, FOLDER_OPTIONS, DEFAULT_NAMING.folder);
    // 連番には取引先が入っていないので「省く」対象が無い（§7-2 の組み合わせ制約）
    if (pattern === "serial" && folder === "vendor_short") folder = "vendor";
    return {
      pattern,
      dateFormat: pickOption(
        parsed.dateFormat,
        DATE_OPTIONS,
        DEFAULT_NAMING.dateFormat,
      ),
      delimiter: pickOption(
        parsed.delimiter,
        DELIMITER_OPTIONS,
        DEFAULT_NAMING.delimiter,
      ),
      folder,
      serialDigits: DEFAULT_NAMING.serialDigits,
    };
  } catch {
    return null;
  }
}

/** 対応表の行を識別する鍵（設定を変えても開閉が飛ばないように） */
function pairKey(pair: RenamePair, index: number): string {
  if (pair.file) return `f:${pair.file.key}`;
  if (pair.row) return `r:${pair.row.sourceLine}`;
  return `i:${index}`;
}

function triggerDownload(blob: Blob, fileName: string) {
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

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */

export default function EvidenceRenameTool() {
  const [files, setFiles] = useState<EvidenceFile[]>(SAMPLE_FILES);
  const [rows, setRows] = useState<LedgerRow[]>(SAMPLE_LEDGER);
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [sourceName, setSourceName] = useState(SAMPLE_SOURCE_NAME);
  const [isSample, setIsSample] = useState(true);
  const [naming, setNaming] = useState<NamingOptions>(DEFAULT_NAMING);
  const [restored, setRestored] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [collectNote, setCollectNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ledgerDragging, setLedgerDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState(TABLE_INITIAL_ROWS);
  // お試し版の上限（書き出し＝ZIP・CSVのダウンロードを1回と数える。端末側だけ）
  const trial = useTrialLimit("evidence");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const ledgerInputRef = useRef<HTMLInputElement>(null);

  /**
   * webkitdirectory は React の InputHTMLAttributes に無いので JSX の属性で書けない。
   * HTMLInputElement 側には lib.dom.d.ts の定義があるので ref から立てる。
   */
  useEffect(() => {
    if (dirInputRef.current) dirInputRef.current.webkitdirectory = true;
  }, []);

  // 保存してあるのは命名オプションだけ。台帳の中身も証憑も保存しない
  useEffect(() => {
    const saved = loadNaming();
    if (saved) setNaming(saved);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(naming));
    } catch {
      /* 保存できない設定のブラウザでは黙って諦める */
    }
  }, [naming, restored]);

  // 読み込み直したら表示件数を戻す
  useEffect(() => {
    setVisibleRows(TABLE_INITIAL_ROWS);
    setOpenKey(null);
  }, [files, rows]);

  // 型を明示しておくと、対応表まわりの型がロジック層の実装に依存せず確定する
  const plan = useMemo<RenamePlan>(
    () => buildPlan(files, rows, naming),
    [files, rows, naming],
  );

  const hasFiles = files.length > 0;
  const hasLedger = rows.length > 0;
  const totalBytes = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  );
  const zipCount = plan.counts.named + plan.counts.unmatched;
  const canZip = !isSample && hasFiles && hasLedger && zipCount > 0;

  const allIssues = useMemo(
    () => [...issues, ...plan.issues],
    [issues, plan.issues],
  );

  /* ---------------- 証憑の取り込み（マージ方式） ---------------- */

  const addFiles = useCallback(
    (input: readonly File[]) => {
      if (input.length === 0) return;
      setMessage(null);
      // サンプルの証憑は実体を持たないので、実データが来たら混ぜずに捨てる
      const base = isSample ? [] : files;
      const result = collectFiles(input, base);
      if (!result.ok) {
        setCollectNote(null);
        setMessage(result.message);
        return;
      }
      setFiles(result.files);
      if (isSample) {
        setIsSample(false);
        setRows([]);
        setIssues([]);
        setSkipped(0);
        setSourceName("");
      }
      if (result.addedCount === 0 && result.skippedCount > 0) {
        setCollectNote(`${result.skippedCount}件はすでに読み込み済みです。`);
      } else if (result.skippedCount > 0) {
        setCollectNote(
          `${result.addedCount}件を追加しました（${result.skippedCount}件はすでに読み込み済み）。`,
        );
      } else {
        setCollectNote(`${result.addedCount}件を追加しました。`);
      }
    },
    [files, isSample],
  );

  const onFilesChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = "";
      addFiles(picked);
    },
    [addFiles],
  );

  const onDirChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (picked.length === 0) {
        // 事前の機能検出では判定できない（iOS 18.3 以前もプロパティ自体は存在する）
        setMessage(
          "フォルダから読み込めませんでした。お使いの環境ではフォルダ選択に対応していない可能性があります。ファイルを個別に選んでください。",
        );
        return;
      }
      addFiles(picked);
    },
    [addFiles],
  );

  const onEvidenceDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (busy !== null) return;
      const items = event.dataTransfer.items;
      if (
        items &&
        Array.from(items).some((item) => item.webkitGetAsEntry?.()?.isDirectory)
      ) {
        setMessage(
          "フォルダのドロップには対応していません。「フォルダごと選ぶ」からお選びください。",
        );
        return;
      }
      addFiles(Array.from(event.dataTransfer.files ?? []));
    },
    [addFiles, busy],
  );

  const clearFiles = useCallback(() => {
    setFiles([]);
    setCollectNote(null);
    setMessage(null);
    setOpenKey(null);
  }, []);

  /* ---------------- 台帳の読み込み ---------------- */

  const readLedgerFile = useCallback(
    async (file: File) => {
      setMessage(null);
      setBusy("台帳を読み込んでいます…");
      try {
        const { parseLedger } = await import("@/lib/tools/evidence/parse");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = await parseLedger({ name: file.name, bytes });
        setIssues(result.issues);

        // ⚠ error のある行は対応表に載せない（0や空で埋めて通さない）。
        //    何行落としたかは必ず画面に出す。
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
          setSourceName(result.sourceName || file.name);
          if (isSample) {
            // サンプルの証憑は実体を持たない。実台帳と混ぜない
            setIsSample(false);
            setFiles([]);
            setCollectNote(null);
          }
        } else {
          setMessage(
            "読み取れる行がありませんでした。テンプレートの形式をご確認ください。",
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
    },
    [isSample],
  );

  const onLedgerChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void readLedgerFile(file);
    },
    [readLedgerFile],
  );

  const onLedgerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setLedgerDragging(false);
      if (busy !== null) return;
      const file = event.dataTransfer.files?.[0];
      if (file) void readLedgerFile(file);
    },
    [busy, readLedgerFile],
  );

  const useSample = useCallback(() => {
    setFiles(SAMPLE_FILES);
    setRows(SAMPLE_LEDGER);
    setIssues([]);
    setSkipped(0);
    setSourceName(SAMPLE_SOURCE_NAME);
    setIsSample(true);
    setCollectNote(null);
    setMessage(null);
    setOpenKey(null);
    setVisibleRows(TABLE_INITIAL_ROWS);
  }, []);

  /* ---------------- 命名オプション ---------------- */

  const changePattern = useCallback((pattern: NamePattern) => {
    setNaming((prev) => ({
      ...prev,
      pattern,
      folder:
        pattern === "serial" && prev.folder === "vendor_short"
          ? "vendor"
          : prev.folder,
    }));
  }, []);

  const hyphenNote = naming.dateFormat === "yyyy-mm-dd" && naming.delimiter === "-";

  /* ---------------- 書き出し ---------------- */

  const exportZip = useCallback(async () => {
    if (!canZip) return;
    if (!trial.consume()) return;
    setMessage(null);
    try {
      const entries = listZipEntries(plan);
      const bytesList: Uint8Array[] = [];
      setBusy(`ZIPを組んでいます… 0 / ${entries.length}`);
      for (let i = 0; i < entries.length; i++) {
        bytesList.push(new Uint8Array(await entries[i].file.blob.arrayBuffer()));
        if (i % 10 === 0) setBusy(`ZIPを組んでいます… ${i} / ${entries.length}`);
      }
      // 「ZIPを組んでいます…」の描画を先に出してから同期処理へ入る
      await new Promise((resolve) => setTimeout(resolve, 0));
      const input = buildZipInput(plan, bytesList);
      const { zipSync } = await import("fflate");
      // PDFも画像も既に圧縮済み。再圧縮しても縮まらないので格納のみ
      const zipped = zipSync(input, { level: 0 });
      triggerDownload(
        new Blob([zipped.slice().buffer as ArrayBuffer], {
          type: "application/zip",
        }),
        buildZipFileName(plan, new Date()),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ZIPを書き出せませんでした。",
      );
    } finally {
      setBusy(null);
    }
  }, [canZip, plan, trial]);

  const exportCsv = useCallback(
    (kind: "index" | "map") => {
      if (!trial.consume()) return;
      setMessage(null);
      try {
        const bytes = kind === "index" ? buildIndexCsv(plan) : buildMapCsv(plan);
        triggerDownload(
          new Blob([bytes.slice().buffer as ArrayBuffer], {
            type: "text/csv;charset=utf-8",
          }),
          kind === "index" ? INDEX_CSV_NAME : MAP_CSV_NAME,
        );
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "CSVを書き出せませんでした。",
        );
      }
    },
    [plan, trial],
  );

  /* ---------------- 状態のひとこと ---------------- */

  const hint =
    !isSample && !hasFiles && hasLedger
      ? "証憑ファイルを読み込んでください。"
      : !isSample && hasFiles && !hasLedger
        ? "台帳を読み込むと、新しいファイル名が決まります。"
        : null;

  const shownPairs = plan.pairs.slice(0, visibleRows);
  const restCount = plan.pairs.length - shownPairs.length;

  return (
    <div className={styles.tool}>
      {/* ================= ステータス ================= */}
      <div className={styles.status}>
        <div className={styles.statusMain}>
          {/* 図像（小）＝サムネイルにも映る。テーマ色はここと番号・主ボタンだけ */}
          <ToolMark tool="evidence" size={22} className={styles.statusMark} />
          <span className={styles.statusFile}>
            {sourceName || "台帳は未読み込み"}
          </span>
          {isSample ? <span className={styles.chipSample}>サンプル</span> : null}
        </div>
        <dl className={styles.statusStats}>
          <div>
            <dt>証憑</dt>
            <dd>
              {files.length}
              <span>件</span>
            </dd>
          </div>
          <div>
            <dt>台帳</dt>
            <dd>
              {rows.length}
              <span>行</span>
            </dd>
          </div>
          <div>
            <dt>紐付き</dt>
            <dd>
              {plan.counts.named}
              <span>件</span>
            </dd>
          </div>
          <div>
            <dt>合計</dt>
            <dd>
              {formatMb(totalBytes)}
              <span>/ {formatMb(MAX_TOTAL_BYTES)}MB</span>
            </dd>
          </div>
        </dl>
      </div>

      <p className={styles.privacy}>
        証憑も台帳も、この端末の中だけで処理されます。
        {/* 「一度も接続しない」とは書かない。同じ画面にテンプレートとサンプルZIPの
            ダウンロードリンクがあり、押せばHTTPが飛ぶ＝厳密には成り立たないため。
            約束しているのは「読み込んだファイルを送らない」ことなので、そう書く */}
        <span className={styles.privacyStrong}>
          読み込んだファイルをネットワークへ送信することはありません。
        </span>
      </p>

      <div className={styles.layout}>
        {/* ================= 左：操作 ================= */}
        <div className={styles.panel}>
          {/* 広い画面（1180px 以上）では 01/02 と 03/04 の 2 列に並ぶ */}
          <div className={styles.panelCol}>
            {/* ---- 01 証憑 ---- */}
            <section className={styles.step}>
              <h3 className={styles.stepTitle}>
                <span className={styles.stepNum}>01</span>証憑を読み込む
              </h3>

              <div
                className={`${styles.drop} ${dragging ? styles.dropOver : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onEvidenceDrop}
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
                <span className={styles.dropText}>PDF・画像をここへ</span>
                <span className={styles.dropSub}>押しても選べます</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPT_EVIDENCE}
                  className={styles.fileInput}
                  onChange={onFilesChange}
                />
              </div>

              <div className={styles.rowButtons}>
                <label className={styles.ghostButton}>
                  フォルダごと選ぶ
                  <input
                    ref={dirInputRef}
                    type="file"
                    multiple
                    className={styles.fileInput}
                    onChange={onDirChange}
                  />
                </label>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={clearFiles}
                  disabled={isSample || !hasFiles || busy !== null}
                >
                  証憑をすべて外す
                </button>
              </div>

              <p className={styles.stepNote}>
                iPhone・iPadでは、iOS 18.4 より前のSafariでフォルダを選べません。
                その場合は上の「PDF・画像をここへ」を押して、証憑を個別に選んでください。
              </p>
              <p className={styles.stepNote}>
                対応する形式は {ACCEPTED_EXTENSIONS.join(" / ")} です。
                最大{MAX_FILES}件・1件あたり{formatMb(MAX_FILE_BYTES)}MB・合計
                {formatMb(MAX_TOTAL_BYTES)}MBまで。
                台帳に無いファイルは {UNMATCHED_FOLDER}/ に元の名前のまま入ります（黙って落としません）。
              </p>

              {collectNote ? (
                <p className={styles.issueSummary}>{collectNote}</p>
              ) : null}
            </section>

            {/* ---- 02 台帳 ---- */}
            <section className={styles.step}>
              <h3 className={styles.stepTitle}>
                <span className={styles.stepNum}>02</span>台帳を読み込む
              </h3>

              <div
                className={`${styles.drop} ${ledgerDragging ? styles.dropOver : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setLedgerDragging(true);
                }}
                onDragLeave={() => setLedgerDragging(false)}
                onDrop={onLedgerDrop}
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
                <span className={styles.dropText}>
                  Excel（.xlsx）か CSV をここへ
                </span>
                <span className={styles.dropSub}>押しても選べます</span>
                <input
                  ref={ledgerInputRef}
                  type="file"
                  accept=".xlsx,.csv,text/csv"
                  className={styles.fileInput}
                  onChange={onLedgerChange}
                />
              </div>

              <div className={styles.rowButtons}>
                <a
                  className={styles.ghostButton}
                  href="/tools/evidence/evidence-ledger-template.xlsx"
                  download="証憑台帳テンプレート.xlsx"
                >
                  テンプレート .xlsx
                </a>
                <a
                  className={styles.ghostButton}
                  href="/tools/evidence/evidence-ledger-template.csv"
                  download="証憑台帳テンプレート.csv"
                >
                  .csv
                </a>
                <a
                  className={styles.ghostButton}
                  href="/tools/evidence/evidence-sample.zip"
                  download="証憑サンプル一式.zip"
                >
                  サンプル一式（ZIP）
                </a>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={useSample}
                  disabled={busy !== null}
                >
                  サンプルで試す
                </button>
              </div>

              <p className={styles.stepNote}>
                列は {LEDGER_COLUMNS.join("・")} の6つ。
                見出しは名前で照合するので、並び順が違っても、余計な列があっても読めます。
                {MAX_LEDGER_ROWS}行まで。
              </p>

              {allIssues.length > 0 ? (
                <ul className={styles.issues}>
                  {allIssues.slice(0, 8).map((issue, i) => (
                    <li
                      key={`${issue.line}-${i}`}
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
                  {allIssues.length > 8 ? (
                    <li className={styles.issueMore}>
                      ほか{allIssues.length - 8}件
                    </li>
                  ) : null}
                </ul>
              ) : null}
              {skipped > 0 ? (
                <p className={styles.issueSummary}>
                  {skipped}行を対応表に載せていません。台帳を直してから読み込み直してください。
                </p>
              ) : null}
            </section>
          </div>

          <div className={styles.panelCol}>
            {/* ---- 03 名前の付け方 ---- */}
            <section className={styles.step}>
              <h3 className={styles.stepTitle}>
                <span className={styles.stepNum}>03</span>名前の付け方
              </h3>
              <p className={styles.stepNote}>
                国税庁の一問一答が例示している形（20210131_㈱霞商店_110000）に合わせて付け替えます。
              </p>

              <div className={styles.selects}>
                <label className={styles.selectRow}>
                  <span>並び順</span>
                  <select
                    value={naming.pattern}
                    onChange={(e) => changePattern(e.target.value as NamePattern)}
                  >
                    {PATTERN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.selectRow}>
                  <span>日付の書式</span>
                  <select
                    value={naming.dateFormat}
                    onChange={(e) =>
                      setNaming((prev) => ({
                        ...prev,
                        dateFormat: e.target.value as DateFormat,
                      }))
                    }
                  >
                    {DATE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.selectRow}>
                  <span>区切り文字</span>
                  <select
                    value={naming.delimiter}
                    onChange={(e) =>
                      setNaming((prev) => ({
                        ...prev,
                        delimiter: e.target.value as Delimiter,
                      }))
                    }
                  >
                    {DELIMITER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.selectRow}>
                  <span>フォルダ分け</span>
                  <select
                    value={naming.folder}
                    onChange={(e) =>
                      setNaming((prev) => ({
                        ...prev,
                        folder: e.target.value as FolderMode,
                      }))
                    }
                  >
                    {FOLDER_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        disabled={
                          option.value === "vendor_short" &&
                          naming.pattern === "serial"
                        }
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {hyphenNote ? (
                <p className={styles.optionNote}>
                  日付の書式が 2021-01-31 のときは区切りに _ をおすすめします。
                </p>
              ) : null}
              {naming.pattern === "serial" ? (
                <p className={styles.optionNote}>
                  連番には取引先が入らないため、「取引先フォルダ＋名前から取引先を省く」は選べません。
                  内容は索引簿（連番・日付・金額・取引先・備考）で管理します。
                </p>
              ) : null}

              <p className={styles.stepNote}>
                この設定はこの端末の中だけに残ります。送信されません。
                台帳の中身も証憑も保存しません。
              </p>

              {/* ★§3-8 の但し書き。常時表示・折りたたまない */}
              <div className={styles.disclaimer}>
                {DISCLAIMER_LINES.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <a
                  className={styles.discLink}
                  href={NTA_QA_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  電子帳簿保存法一問一答【電子取引関係】（国税庁）
                </a>
                <a
                  className={styles.discLink}
                  href={NTA_SAMPLE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  参考資料（各種規程等のサンプル・索引簿サンプル）（国税庁）
                </a>
              </div>
            </section>

            {/* ---- 04 書き出す ---- */}
            <section className={styles.step}>
              <h3 className={styles.stepTitle}>
                <span className={styles.stepNum}>04</span>書き出す
              </h3>

              <div className={styles.exportRow}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={exportZip}
                  disabled={!canZip || busy !== null || trial.limited}
                >
                  {canZip ? `${zipCount}件をZIPで書き出す` : "ZIPで書き出す"}
                </button>
              </div>
              <TrialNotice trial={trial} />

              {isSample ? (
                <p className={styles.stepNote}>
                  サンプルは対応表の見本です。ZIPで書き出すには、実際のファイルを読み込んでください。
                  （「サンプル一式（ZIP）」をダウンロードして解凍し、中の「証憑」フォルダを 01
                  で、「記入済み台帳.xlsx」を 02 で読み込むと最後まで試せます）
                </p>
              ) : null}

              <div className={styles.rowButtons}>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => exportCsv("index")}
                  disabled={busy !== null || trial.limited}
                >
                  {INDEX_CSV_NAME}
                </button>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => exportCsv("map")}
                  disabled={busy !== null || trial.limited}
                >
                  {MAP_CSV_NAME}
                </button>
              </div>

              <p className={styles.stepNote}>
                ZIPには元のファイルをそのまま詰め直します。中身（バイト列）は1バイトも変えません。
              </p>

              {busy ? <p className={styles.busy}>{busy}</p> : null}
              {message ? (
                <p className={styles.message}>{message}</p>
              ) : hint ? (
                // 状態の案内であってエラーではないので、色だけ落として同じ枠に出す
                <p className={`${styles.message} ${styles.messageHint}`}>{hint}</p>
              ) : null}
            </section>
          </div>
        </div>

        {/* ================= 右：対応表（主役） ================= */}
        <div className={styles.stage}>
          <div className={styles.legend}>
            <span>
              ZIPに入る <b>{zipCount}</b> 件
            </span>
            <span>
              枝番 <b>{plan.counts.renumbered}</b>
            </span>
            <span>
              切り詰め <b>{plan.counts.truncated}</b>
            </span>
            <span>
              未処理 <b>{plan.counts.unmatched}</b>
            </span>
            <span>
              ファイルなし <b>{plan.counts.missing}</b>
            </span>
            <span>
              対象外 <b>{plan.counts.rejected}</b>
            </span>
          </div>

          <div className={styles.tableHead}>
            <span>元のファイル名</span>
            <span />
            <span>新しいファイル名</span>
            <span>状態</span>
          </div>

          {plan.pairs.length === 0 ? (
            <p className={styles.empty}>
              証憑と台帳を読み込むと、ここに新旧の対応表が並びます。
            </p>
          ) : (
            <div className={styles.tableScroll}>
              <ul className={styles.rowList}>
                {shownPairs.map((pair, i) => {
                  const key = pairKey(pair, i);
                  const open = openKey === key;
                  const toText = !hasLedger
                    ? PLACEHOLDER_TO
                    : pair.to || "—";
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={`${styles.docItem} ${styles[STATUS_CLASS[pair.status]]}`}
                        data-status={pair.status}
                        aria-expanded={open}
                        onClick={() => setOpenKey(open ? null : key)}
                      >
                        <span className={styles.rowFrom} title={pair.from}>
                          {pair.from}
                        </span>
                        <span className={styles.rowArrow} aria-hidden="true" />
                        <span
                          className={`${styles.rowTo} ${
                            hasLedger && pair.to ? "" : styles.rowToMuted
                          }`}
                          title={hasLedger ? pair.to || "—" : PLACEHOLDER_TO}
                        >
                          {toText}
                        </span>
                        <span className={styles.rowBadge}>
                          {STATUS_LABEL[pair.status]}
                        </span>
                      </button>

                      {open ? (
                        <dl className={styles.detail}>
                          <div>
                            <dt>台帳の行</dt>
                            <dd>
                              {pair.row ? `${pair.row.sourceLine}行目` : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt>取引年月日</dt>
                            <dd>{pair.row ? formatDateJa(pair.row.date) : "—"}</dd>
                          </div>
                          <div>
                            <dt>取引先</dt>
                            <dd>{pair.row?.vendor || "—"}</dd>
                          </div>
                          <div>
                            <dt>取引金額</dt>
                            <dd>{pair.row ? formatYen(pair.row.amount) : "—"}</dd>
                          </div>
                          <div>
                            <dt>書類の種類</dt>
                            <dd>{pair.row?.docType || "—"}</dd>
                          </div>
                          <div>
                            <dt>サイズ</dt>
                            <dd>{pair.file ? formatSize(pair.file.size) : "—"}</dd>
                          </div>
                          <div className={styles.detailWide}>
                            <dt>ZIP内のパス</dt>
                            <dd className={styles.detailPath}>{pair.to || "—"}</dd>
                          </div>
                          {pair.note ? (
                            <div className={styles.detailWide}>
                              <dt>備考</dt>
                              <dd>{pair.note}</dd>
                            </div>
                          ) : null}
                        </dl>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {restCount > 0 ? (
            <div className={styles.moreRow}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setVisibleRows(plan.pairs.length)}
              >
                残り{restCount}件を表示
              </button>
            </div>
          ) : null}

          <p className={styles.stageNote}>
            設定を変えると、右側の名前がその場で書き換わります。
            行を押すと、台帳のどの行と結びついたかを開けます。
          </p>
        </div>
      </div>
    </div>
  );
}
