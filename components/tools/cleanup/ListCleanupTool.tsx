"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
} from "react";
import { runCleanup } from "@/lib/tools/cleanup/apply";
import { DEFAULT_SWITCHES, RULES } from "@/lib/tools/cleanup/rules";
import { SAMPLE_FILE_NAME, sampleParseResult } from "@/lib/tools/cleanup/sample";
import {
  DEFAULT_DEDUPE_OPTIONS,
  DEFAULT_RULE_OPTIONS,
  DUPLICATE_LEVEL_LABELS,
  RISK_LABELS,
  ROLE_LABELS,
  ROLE_ORDER,
  RULES_STORAGE_KEY,
  type CellChange,
  type CleanResult,
  type CleanupRule,
  type ColumnRole,
  type ColumnSpec,
  type DedupeOptions,
  type DiffSpan,
  type ParseResult,
  type RuleId,
  type RuleOptions,
  type RuleRisk,
  type RuleSwitches,
} from "@/lib/tools/cleanup/types";
import { formatNumber } from "@/lib/tools/_shared/format";
import { useTrialLimit } from "@/lib/tools/_shared/trialLimit";
import ToolMark from "@/components/tools/_marks/ToolMark";
import TrialNotice from "@/components/tools/_shared-ui/TrialNotice";
import styles from "./ListCleanupTool.module.css";

/**
 * 名簿クレンジング（T-05） — ツール本体
 *
 * ⚠ 設計の芯：**ブラウザ内で完結する**。読み込んだ名簿も、書き出したファイルも、
 *    一切サーバへ送らない。この層に fetch / "use server" を書かない。
 *
 * ⚠ 画面の主役は「ビフォーアフター対比」（計画書§11-2）。他の5本と絵を被らせない。
 *
 * 重い依存（fflate を引く parse / export）は動的 import にしてある。
 * ページを開いただけでは落ちてこない。
 */

/* ------------------------------------------------------------------ *
 * 画面の定数
 * ------------------------------------------------------------------ */

/** 対比表の1行の高さ（px）。**左右の高さを揃える契約そのもの**なので JS と CSS で共有する */
const ROW_H = 34;
/** 対比表の見出し行の高さ（px） */
const HEAD_H = 30;
/** 対比表の最大の高さ（px）。100vh を前提にしない（iOS のアドレスバー対策） */
const STAGE_MAX_H = 560;
/** 一度に描画する行数の上限。5,000行×40列を2枚描くとブラウザが落ちる */
const STAGE_MAX_ROWS = 300;
/** 左パネルの一覧に並べるボタン数の上限 */
const LIST_MAX = 300;
/** 既定表示で、修正が入った行の前後に何行付けるか */
const NEIGHBOR = 1;

const RISK_ORDER: readonly RuleRisk[] = ["safe", "caution", "danger"];

/** 波ダッシュの寄せ先。**文字そのものが値**なのでエスケープで書く（取り違え防止） */
const WAVE_DASH_CHOICES = [
  { value: "～", label: "～（全角チルダ・Windowsで多い）" },
  { value: "〜", label: "〜（波ダッシュ・JIS）" },
] as const satisfies readonly { value: RuleOptions["waveDashTo"]; label: string }[];

/** 不可視文字。**常に**「·」に置き換えて表示する（何も変わっていないのに色が付いて見えるのを防ぐ） */
const INVISIBLE_RE = /[\u0000-\u001F\u007F\u00A0\u200B-\u200D\uFEFF]/g;

/* ------------------------------------------------------------------ *
 * 小さな道具
 * ------------------------------------------------------------------ */

/** ファイル名に入れる日付。`_shared/format` は表示用なのでここは自前で持つ */
function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function triggerDownload(data: Uint8Array | string, fileName: string, mime: string) {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: mime })
      : new Blob([data.slice().buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari は revoke が早すぎるとダウンロードが落ちるので待ち時間を削らない
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 不可視文字と（任意で）空白を、目に見える記号へ置き換える */
function visualize(text: string, showSpaces: boolean): string {
  const out = text.replace(INVISIBLE_RE, "·");
  if (!showSpaces) return out;
  return out.replace(/\u0020/g, "␣").replace(/\u3000/g, "□");
}

/** 全角を2・半角を1として数えたおおよその表示幅 */
function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    w += code < 0x1100 || (code >= 0xff61 && code <= 0xff9f) ? 1 : 2;
    if (w > 80) return 80;
  }
  return w;
}

/** localStorage から規則の入り切りを読む。壊れていたら黙って捨てる */
function loadSwitches(): RuleSwitches | null {
  try {
    const raw = window.localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const saved = parsed as Record<string, unknown>;
    const next = { ...DEFAULT_SWITCHES };
    let hit = false;
    for (const rule of RULES) {
      const value = saved[rule.id];
      if (typeof value === "boolean") {
        next[rule.id] = value;
        hit = true;
      }
    }
    return hit ? next : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * 対比表の1セル
 * ------------------------------------------------------------------ */

type Side = "before" | "after";

function CellText({
  value,
  span,
  side,
  showSpaces,
}: {
  value: string;
  span: DiffSpan | null;
  side: Side;
  showSpaces: boolean;
}) {
  if (!span) return <>{visualize(value, showSpaces)}</>;

  // ⚠ コードポイント単位で切る。String.prototype.slice は UTF-16 単位なので
  //    サロゲートペア（𠮷 など）でズレる（計画書§8-6）。
  const chars = Array.from(value);
  const start = side === "before" ? span.beforeStart : span.afterStart;
  const end = side === "before" ? span.beforeEnd : span.afterEnd;
  const head = visualize(chars.slice(0, start).join(""), showSpaces);
  // 差分の中は、トグルに関わらず常に空白を可視化する（空白だけの差分が見えなくなるため）
  const mid = visualize(chars.slice(start, end).join(""), true);
  const tail = visualize(chars.slice(end).join(""), showSpaces);

  return (
    <>
      {head}
      {mid ? (
        <span className={side === "before" ? styles.markBefore : styles.markAfter}>
          {mid}
        </span>
      ) : (
        <span className={styles.markCaret} aria-hidden="true" />
      )}
      {tail}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */

/** 読み込み結果と列の役割は必ず一緒に差し替える（片方だけ新しくすると列がズレる） */
interface Source {
  parsed: ParseResult;
  columns: ColumnSpec[];
  isSample: boolean;
}

function makeSampleSource(): Source {
  const parsed = sampleParseResult();
  return { parsed, columns: parsed.columns.map((c) => ({ ...c })), isSample: true };
}

type StageEntry =
  | { kind: "row"; row: number }
  | { kind: "gap"; count: number };

export default function ListCleanupTool() {
  const [source, setSource] = useState<Source>(makeSampleSource);
  const [switches, setSwitches] = useState<RuleSwitches>(DEFAULT_SWITCHES);
  const [dedupe, setDedupe] = useState<DedupeOptions>(DEFAULT_DEDUPE_OPTIONS);
  const [ruleOptions, setRuleOptions] = useState<RuleOptions>(DEFAULT_RULE_OPTIONS);

  const [showAllRows, setShowAllRows] = useState(false);
  const [showSpaces, setShowSpaces] = useState(false);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [pendingRule, setPendingRule] = useState<RuleId | null>(null);
  const [pendingBulk, setPendingBulk] = useState<RuleRisk | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  /* お試し版の上限（書き出し＝ダウンロード操作だけを数える。共通契約 T-08） */
  const trial = useTrialLimit("cleanup");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<number | null>(null);
  const dupCursorRef = useRef<Map<string, number>>(new Map());

  /* -------- 保存してある規則の入り切りを戻す（初回描画後・SSRでは触らない） -------- */
  useEffect(() => {
    const saved = loadSwitches();
    if (saved) setSwitches(saved);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(switches));
    } catch {
      /* 保存できない設定のブラウザでは黙って諦める */
    }
  }, [switches, storageReady]);

  /* -------- SP（〜640px）では左右に並べず、上下2段の行カードへ切り替える -------- */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  /* -------- 計算（重いので入力を遅延させ、操作の手応えを落とさない） -------- */
  const deferredSource = useDeferredValue(source);
  const deferredSwitches = useDeferredValue(switches);
  const deferredDedupe = useDeferredValue(dedupe);
  const deferredOptions = useDeferredValue(ruleOptions);

  const { parsed, columns, isSample } = deferredSource;

  // 計算が落ちても画面が真っ白にならないようにする（原因は .message に出す）
  const computed = useMemo(() => {
    try {
      return {
        result: runCleanup(
          deferredSource.parsed,
          deferredSource.columns,
          deferredSwitches,
          deferredDedupe,
          deferredOptions,
        ),
        error: null as string | null,
      };
    } catch (error) {
      return {
        result: {
          rows: deferredSource.parsed.rows,
          changes: [],
          findings: [],
          notices: [],
          duplicates: [],
          changedRows: [],
          messages: [],
        } satisfies CleanResult,
        error:
          error instanceof Error
            ? `診断できませんでした：${error.message}`
            : "診断できませんでした。",
      };
    }
  }, [deferredSource, deferredSwitches, deferredDedupe, deferredOptions]);

  const result = computed.result;

  const stale =
    source !== deferredSource ||
    switches !== deferredSwitches ||
    dedupe !== deferredDedupe ||
    ruleOptions !== deferredOptions;

  /* -------- 派生 -------- */

  /** `${row},${col}` → 修正 */
  const changeMap = useMemo(() => {
    const map = new Map<string, CellChange>();
    for (const change of result.changes) map.set(`${change.row},${change.col}`, change);
    return map;
  }, [result.changes]);

  /** 表示上の行番号 → 重複グループ */
  const dupMap = useMemo(() => {
    const map = new Map<number, { mark: string; index: number }>();
    for (const group of result.duplicates) {
      group.rows.forEach((row, index) => map.set(row, { mark: group.mark, index }));
    }
    return map;
  }, [result.duplicates]);

  /** 規則ごとの該当セル数。**全規則を ON にした仮定**の数（計画書§7-1） */
  const findingCells = useMemo(() => {
    const map = new Map<RuleId, number>();
    for (const finding of result.findings) map.set(finding.ruleId, finding.cells);
    return map;
  }, [result.findings]);

  const rulesByRisk = useMemo(() => {
    const map = new Map<RuleRisk, CleanupRule[]>();
    for (const risk of RISK_ORDER) map.set(risk, []);
    for (const rule of RULES) map.get(rule.risk)?.push(rule);
    return map;
  }, []);

  /** 行ごとの修正一覧（04のボタン用） */
  const changesByRow = useMemo(() => {
    const map = new Map<number, CellChange[]>();
    for (const change of result.changes) {
      const list = map.get(change.row);
      if (list) list.push(change);
      else map.set(change.row, [change]);
    }
    return map;
  }, [result.changes]);

  /** 列幅（実データから決める。狭すぎると語が折れる＝共通仕様§7-7） */
  const colWidths = useMemo(() => {
    const sampleRows = parsed.rows.slice(0, 400);
    return columns.map((col) => {
      let width = displayWidth(col.header);
      for (const row of sampleRows) {
        const value = row.cells[col.index] ?? "";
        if (value.length > 0) width = Math.max(width, displayWidth(value));
      }
      return Math.min(320, Math.max(92, 22 + width * 8));
    });
  }, [columns, parsed.rows]);

  const gridWidth = useMemo(
    () => colWidths.reduce((sum, w) => sum + w, 0) + 64,
    [colWidths],
  );

  /** 対比表に出す行。既定は「修正が入った行 ＋ 前後1行」＋「重複の疑いの行」 */
  const stageEntries = useMemo(() => {
    const total = parsed.rows.length;
    const entries: StageEntry[] = [];
    let truncated = 0;

    const push = (entry: StageEntry) => {
      if (entries.length < STAGE_MAX_ROWS) entries.push(entry);
      else if (entry.kind === "row") truncated += 1;
    };

    if (showAllRows) {
      for (let row = 1; row <= total; row += 1) push({ kind: "row", row });
      return { entries, truncated };
    }

    const keep = new Set<number>();
    for (const row of result.changedRows) {
      for (let d = -NEIGHBOR; d <= NEIGHBOR; d += 1) {
        const target = row + d;
        if (target >= 1 && target <= total) keep.add(target);
      }
    }
    // 重複の疑いの行は、修正が無くても出す（[A] の印が見えないと意味がないため）
    for (const group of result.duplicates) for (const row of group.rows) keep.add(row);

    // 汚れが1つも無い名簿では対比が空になってしまう。先頭の数行を出して形を見せる
    if (keep.size === 0) {
      for (let row = 1; row <= Math.min(total, 12); row += 1) keep.add(row);
    }

    const sorted = [...keep].sort((a, b) => a - b);
    let prev = 0;
    for (const row of sorted) {
      if (row - prev > 1) push({ kind: "gap", count: row - prev - 1 });
      push({ kind: "row", row });
      prev = row;
    }
    if (total - prev > 0) push({ kind: "gap", count: total - prev });
    return { entries, truncated };
  }, [parsed.rows.length, result.changedRows, result.duplicates, showAllRows]);

  /** 行番号 → 対比表の中での位置（スクロールに使う） */
  const rowOffset = useMemo(() => {
    const map = new Map<number, number>();
    stageEntries.entries.forEach((entry, index) => {
      if (entry.kind === "row") map.set(entry.row, index);
    });
    return map;
  }, [stageEntries]);

  const stageHeight = Math.max(
    180,
    Math.min(STAGE_MAX_H, HEAD_H + stageEntries.entries.length * ROW_H + 2),
  );

  /* -------- スクロールの同期 -------- */

  const syncScroll = useCallback((from: Side) => {
    // ⚠ 相手の scrollTop を代入すると相手の onScroll が発火する。
    //    フラグで片方向に倒し、requestAnimationFrame で解除する（無限ループ防止）。
    if (syncingRef.current) return;
    const src = from === "before" ? beforeRef.current : afterRef.current;
    const dst = from === "before" ? afterRef.current : beforeRef.current;
    if (!src || !dst) return;
    if (dst.scrollTop === src.scrollTop && dst.scrollLeft === src.scrollLeft) return;
    syncingRef.current = true;
    dst.scrollTop = src.scrollTop;
    dst.scrollLeft = src.scrollLeft;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      syncingRef.current = false;
      rafRef.current = null;
    });
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    // 左だけを動かし、右は同期に任せる（両方に scrollTo を掛けると滑らかな移動が途中で切れる）
    const pane = beforeRef.current;
    if (!pane) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pane.scrollTo({ top: index * ROW_H, behavior: reduce ? "auto" : "smooth" });
  }, []);

  /** SP（行カード）のとき、選ばれたカードを画面内へ送る */
  const focusCardRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, []);

  const focusOnRow = useCallback(
    (row: number) => {
      setFocusRow(row);
      const index = rowOffset.get(row);
      if (index === undefined) {
        // 既定表示に入っていない行（すべて表示に切り替えてから送る）
        pendingScrollRef.current = row;
        setShowAllRows(true);
        return;
      }
      scrollToIndex(index);
    },
    [rowOffset, scrollToIndex],
  );

  useEffect(() => {
    const row = pendingScrollRef.current;
    if (row === null) return;
    const index = rowOffset.get(row);
    if (index === undefined) return;
    pendingScrollRef.current = null;
    scrollToIndex(index);
  }, [rowOffset, scrollToIndex]);

  /** [A] を押すと同じグループの次の行へ送る */
  const cycleDuplicate = useCallback(
    (mark: string) => {
      const group = result.duplicates.find((g) => g.mark === mark);
      if (!group || group.rows.length === 0) return;
      const cursor = (dupCursorRef.current.get(mark) ?? 0) + 1;
      dupCursorRef.current.set(mark, cursor);
      focusOnRow(group.rows[cursor % group.rows.length]);
    },
    [result.duplicates, focusOnRow],
  );

  /* -------- 読み込み -------- */

  const readFile = useCallback(async (file: File) => {
    setMessage(null);
    setBusy("名簿を読み込んでいます…");
    try {
      // 重い層（fflate を引く）は動的 import。ページを開いただけでは落ちてこない
      const { parseNameList } = await import("@/lib/tools/cleanup/parse");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const next = parseNameList(bytes, file.name);
      if (next.rows.length === 0) {
        setMessage(
          "読み取れる行がありませんでした。1行目（またはメモ行の下）に見出し行がある表をお試しください。",
        );
        return;
      }
      setSource({
        parsed: next,
        columns: next.columns.map((c) => ({ ...c })),
        isSample: false,
      });
      setFocusRow(null);
      setShowAllRows(false);
      dupCursorRef.current.clear();
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
      if (file) void readFile(file);
      event.target.value = "";
    },
    [readFile],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void readFile(file);
    },
    [readFile],
  );

  const useSample = useCallback(() => {
    setSource(makeSampleSource());
    setFocusRow(null);
    setShowAllRows(false);
    setMessage(null);
    dupCursorRef.current.clear();
  }, []);

  /* -------- 列の役割 -------- */

  const setRole = useCallback((index: number, role: ColumnRole) => {
    setSource((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.index === index ? { ...col, role, guessed: false } : col,
      ),
    }));
  }, []);

  /* -------- 規則の入り切り -------- */

  const toggleRule = useCallback(
    (rule: CleanupRule, next: boolean) => {
      // 危険な規則は1段挟む。確認文が出た状態でもう一度押すと有効になる
      if (next && rule.risk === "danger" && pendingRule !== rule.id) {
        setPendingRule(rule.id);
        return;
      }
      setPendingRule(null);
      setSwitches((prev) => ({ ...prev, [rule.id]: next }));
    },
    [pendingRule],
  );

  const setGroup = useCallback(
    (risk: RuleRisk, value: boolean) => {
      if (value && risk === "danger" && pendingBulk !== risk) {
        setPendingBulk(risk);
        return;
      }
      setPendingBulk(null);
      setPendingRule(null);
      setSwitches((prev) => {
        const next = { ...prev };
        for (const rule of RULES) if (rule.risk === risk) next[rule.id] = value;
        return next;
      });
    },
    [pendingBulk],
  );

  /* -------- 書き出し -------- */

  const runExport = useCallback(
    async (kind: "xlsx" | "csv" | "report") => {
      // お試し版の上限：busy を立てる前・重い処理の前に数える（上限なら中止）
      if (!trial.consume()) return;
      setMessage(null);
      setBusy("書き出しています…");
      try {
        const stamp = todayStamp();
        const input = { parsed, result, columns, stamp };
        const {
          buildCleanedWorkbook,
          buildCleanedCsv,
          buildChangeReportCsv,
          exportFileName,
        } = await import("@/lib/tools/cleanup/export");

        if (kind === "xlsx") {
          triggerDownload(
            buildCleanedWorkbook(input),
            exportFileName("list", "xlsx", stamp),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          );
        } else if (kind === "csv") {
          triggerDownload(
            buildCleanedCsv(input),
            exportFileName("list", "csv", stamp),
            "text/csv;charset=utf-8",
          );
        } else {
          triggerDownload(
            buildChangeReportCsv(input),
            exportFileName("report", "csv", stamp),
            "text/csv;charset=utf-8",
          );
        }
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "書き出せませんでした。",
        );
      } finally {
        setBusy(null);
      }
    },
    [parsed, result, columns, trial],
  );

  /* -------- 指摘（読み取りの指摘 ＋ 直さずに知らせるもの）を1つのリストに -------- */
  const issueLines = useMemo(() => {
    const lines: {
      key: string;
      kind: "error" | "warn" | "notice";
      head: string;
      body: string;
      sub?: string;
    }[] = [];

    parsed.issues.forEach((issue, i) => {
      lines.push({
        key: `i${i}`,
        kind: issue.level === "error" ? "error" : "warn",
        head: issue.line > 0 ? `${issue.line}行目` : "全体",
        body: issue.message,
      });
    });

    result.notices.forEach((notice, i) => {
      lines.push({
        key: `n${i}`,
        kind: "notice",
        head: "直しません",
        body: notice.label,
        sub: notice.samples.length > 0 ? notice.samples.join("　/　") : undefined,
      });
    });

    return lines;
  }, [parsed.issues, result.notices]);

  const changedRowList = result.changedRows.slice(0, LIST_MAX);
  const gridStyle = {
    "--row-h": `${ROW_H}px`,
    "--head-h": `${HEAD_H}px`,
    width: `${gridWidth}px`,
  } as CSSProperties;

  /* ------------------------------------------------------------------ *
   * 描画
   * ------------------------------------------------------------------ */

  const renderRow = (entry: StageEntry, index: number, side: Side) => {
    if (entry.kind === "gap") {
      return (
        <div className={styles.gapRow} key={`gap-${index}`} role="row">
          <span role="cell">… {formatNumber(entry.count)}行</span>
        </div>
      );
    }

    const rowIndex = entry.row - 1;
    const cells = side === "before" ? parsed.rows[rowIndex] : result.rows[rowIndex];
    const dup = dupMap.get(entry.row);
    const isFocus = focusRow === entry.row;

    return (
      <div
        className={`${styles.row} ${isFocus ? styles.rowFocus : ""}`}
        key={`${side}-${entry.row}`}
        role="row"
      >
        <span className={styles.gutter} role="cell">
          <span className={styles.rowNo}>{entry.row}</span>
          {dup ? (
            <button
              type="button"
              className={styles.dupBadge}
              onClick={() => cycleDuplicate(dup.mark)}
              aria-label={`重複の疑い ${dup.mark} の次の行へ`}
              title={`重複の疑い ${dup.mark}（押すと同じ組の次の行へ）`}
            >
              {dup.mark}
            </button>
          ) : null}
        </span>

        {columns.map((col, c) => {
          const value = cells?.cells[col.index] ?? "";
          const change = changeMap.get(`${entry.row},${col.index}`) ?? null;
          const label = change
            ? `${col.header} ${side === "before" ? "修正前" : "修正後"} ${change.ruleIds.join(" / ")}`
            : undefined;
          return (
            <span
              className={`${styles.cell} ${change ? styles.cellChanged : ""} ${
                col.role === "skip" ? styles.cellSkip : ""
              }`}
              style={{ width: `${colWidths[c]}px` }}
              key={col.index}
              role="cell"
              title={value}
              aria-label={label}
            >
              <CellText
                value={value}
                span={change ? change.span : null}
                side={side}
                showSpaces={showSpaces}
              />
            </span>
          );
        })}
      </div>
    );
  };

  const renderPane = (side: Side) => (
    <div className={styles.pane}>
      <p className={side === "before" ? styles.paneTitleBefore : styles.paneTitleAfter}>
        {side === "before" ? "修正前" : "修正後"}
      </p>
      <div
        className={styles.scroll}
        style={{ height: `${stageHeight}px` }}
        ref={side === "before" ? beforeRef : afterRef}
        onScroll={() => syncScroll(side)}
      >
        <div className={styles.grid} style={gridStyle} role="table" aria-label={side === "before" ? "修正前" : "修正後"}>
          <div className={styles.headRow} role="row">
            <span className={styles.gutterHead} role="columnheader">
              行
            </span>
            {columns.map((col, c) => (
              <span
                className={styles.cellHead}
                style={{ width: `${colWidths[c]}px` }}
                key={col.index}
                role="columnheader"
                title={`${col.header}（${ROLE_LABELS[col.role]}）`}
              >
                {col.header || `列${col.index + 1}`}
              </span>
            ))}
          </div>
          {stageEntries.entries.map((entry, i) => renderRow(entry, i, side))}
        </div>
      </div>
    </div>
  );

  const renderCards = () => (
    <div className={styles.cards}>
      {stageEntries.entries.map((entry, index) => {
        if (entry.kind === "gap") {
          return (
            <p className={styles.cardGap} key={`gap-${index}`}>
              … {formatNumber(entry.count)}行
            </p>
          );
        }
        const rowIndex = entry.row - 1;
        const before = parsed.rows[rowIndex];
        const dup = dupMap.get(entry.row);
        const rowChanges = changesByRow.get(entry.row) ?? [];
        const identity = columns.filter((col) => col.role !== "skip").slice(0, 2);

        return (
          <div
            className={`${styles.card} ${focusRow === entry.row ? styles.cardFocus : ""}`}
            key={`card-${entry.row}`}
            ref={focusRow === entry.row ? focusCardRef : undefined}
          >
            <p className={styles.cardHead}>
              <span className={styles.rowNo}>{entry.row}行目</span>
              {dup ? (
                <button
                  type="button"
                  className={styles.dupBadge}
                  onClick={() => cycleDuplicate(dup.mark)}
                  aria-label={`重複の疑い ${dup.mark} の次の行へ`}
                >
                  {dup.mark}
                </button>
              ) : null}
            </p>

            {rowChanges.length === 0 ? (
              <p className={styles.cardQuiet}>
                この行に修正はありません（
                {identity
                  .map((col) => before?.cells[col.index] ?? "")
                  .filter((v) => v.length > 0)
                  .join(" / ") || "空の行"}
                ）
              </p>
            ) : (
              rowChanges.map((change) => (
                <div className={styles.cardField} key={`${change.row}-${change.col}`}>
                  <p className={styles.cardLabel}>{change.header}</p>
                  <p className={styles.cardBefore}>
                    <span className={styles.cardSide}>前</span>
                    <CellText
                      value={change.before}
                      span={change.span}
                      side="before"
                      showSpaces={showSpaces}
                    />
                  </p>
                  <p className={styles.cardAfter}>
                    <span className={styles.cardSide}>後</span>
                    <CellText
                      value={change.after}
                      span={change.span}
                      side="after"
                      showSpaces={showSpaces}
                    />
                  </p>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={styles.tool}>
      {/* ================= ステータス ================= */}
      <div className={styles.status}>
        <div className={styles.statusMain}>
          <ToolMark tool="cleanup" size={22} className={styles.statusMark} />
          <span className={styles.statusFile}>{parsed.sourceName}</span>
          {isSample ? <span className={styles.chipSample}>サンプル</span> : null}
        </div>
        <dl className={styles.statusStats}>
          <div>
            <dt>行</dt>
            <dd>
              {formatNumber(parsed.rows.length)}
              <span>行</span>
            </dd>
          </div>
          <div>
            <dt>修正が入る行</dt>
            <dd>
              {formatNumber(result.changedRows.length)}
              <span>行</span>
            </dd>
          </div>
          <div>
            <dt>修正</dt>
            <dd>
              {formatNumber(result.changes.length)}
              <span>箇所</span>
            </dd>
          </div>
          <div>
            <dt>重複の疑い</dt>
            <dd>
              {formatNumber(result.duplicates.length)}
              <span>組</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className={styles.layout}>
        {/* ================= 左：操作 ================= */}
        <div className={styles.panel}>
          {/* ---- 01 読み込む ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>01</span>名簿を読み込む
            </h3>
            <p className={styles.stepNote}>
              読み込んだ名簿はこの端末の中だけで処理され、どこにも送信されません。
            </p>

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
              <button type="button" className={styles.ghostButton} onClick={useSample}>
                サンプルで試す
              </button>
              {/* ⚠ 配布ファイルの実体は public/tools/cleanup/ に置く（計画書§12）。
                  名前は SAMPLE_FILE_NAME に合わせているので、片方だけ変えないこと */}
              <a
                className={styles.ghostButton}
                href={`/tools/cleanup/${SAMPLE_FILE_NAME}`}
                download={SAMPLE_FILE_NAME}
              >
                サンプル .xlsx
              </a>
            </div>

            <p className={styles.stepFine}>
              1行に1件・見出し行のある表を読みます。複数シートのブックは先頭のシートだけを読みます。
              結合されたセルのある表は読めません。
              {parsed.sheetName ? `　いま読んでいるシート：${parsed.sheetName}` : ""}
              {parsed.encoding === "shift_jis" ? "　Shift_JIS として読みました。" : ""}
            </p>

            {issueLines.length > 0 ? (
              <ul className={styles.issues}>
                {issueLines.slice(0, 10).map((line) => (
                  <li
                    key={line.key}
                    className={
                      line.kind === "error"
                        ? styles.issueError
                        : line.kind === "warn"
                          ? styles.issueWarn
                          : styles.issueNotice
                    }
                  >
                    <span className={styles.issueLine}>{line.head}</span>
                    <span className={styles.issueBody}>
                      {line.body}
                      {line.sub ? (
                        <span className={styles.issueSample}>{line.sub}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
                {issueLines.length > 10 ? (
                  <li className={styles.issueMore}>ほか{issueLines.length - 10}件</li>
                ) : null}
              </ul>
            ) : null}
          </section>

          {/* ---- 02 列の役割 ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>02</span>列の役割を決める
            </h3>
            <p className={styles.stepNote}>
              見出しから推定しています。推定は外れることがありますので、違っていたら直してください。
              「触らない」にした列は、どの規則も当たりません。
            </p>
            <ul className={styles.roleList}>
              {columns.map((col) => (
                <li key={col.index} className={styles.roleItem}>
                  <span className={styles.roleHeader} title={col.header}>
                    {col.header || `列${col.index + 1}`}
                  </span>
                  {col.guessed ? <span className={styles.roleGuess}>推定</span> : null}
                  <select
                    className={styles.roleSelect}
                    value={col.role}
                    onChange={(e) => setRole(col.index, e.target.value as ColumnRole)}
                    aria-label={`${col.header || `列${col.index + 1}`} の役割`}
                  >
                    {ROLE_ORDER.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>

          {/* ---- 03 規則 ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>03</span>直す規則を選ぶ
            </h3>
            <p className={styles.stepNote}>
              件数は「この規則を入れると何セル変わるか」です。すべての規則を入れたと仮定して数えているので、
              規則を外しても件数は減りません。選んだ内容はこの端末の中だけに残ります。
            </p>

            {RISK_ORDER.map((risk) => {
              const list = rulesByRisk.get(risk) ?? [];
              if (list.length === 0) return null;
              return (
                <div className={styles.ruleGroup} key={risk}>
                  <div className={styles.ruleGroupHead}>
                    <span
                      className={`${styles.riskTag} ${
                        risk === "danger"
                          ? styles.riskDanger
                          : risk === "caution"
                            ? styles.riskCaution
                            : styles.riskSafe
                      }`}
                    >
                      {RISK_LABELS[risk]}
                    </span>
                    <span className={styles.ruleGroupCount}>{list.length}規則</span>
                    <span className={styles.ruleGroupActions}>
                      <button
                        type="button"
                        className={styles.miniButton}
                        onClick={() => setGroup(risk, true)}
                      >
                        すべて入れる
                      </button>
                      <button
                        type="button"
                        className={styles.miniButton}
                        onClick={() => setGroup(risk, false)}
                      >
                        すべて外す
                      </button>
                    </span>
                  </div>

                  {pendingBulk === risk ? (
                    <p className={styles.confirm} role="status">
                      危険度「危険」の規則をまとめて入れます。値が別のものに化けることがあります。もう一度「すべて入れる」を押すと有効になります。
                    </p>
                  ) : null}

                  <ul className={styles.ruleList}>
                    {list.map((rule) => (
                      <li key={rule.id} className={styles.ruleItem}>
                        <label className={styles.ruleLabel}>
                          <input
                            type="checkbox"
                            checked={switches[rule.id] ?? false}
                            onChange={(e) => toggleRule(rule, e.target.checked)}
                          />
                          <span className={styles.ruleName}>{rule.label}</span>
                          <span className={styles.ruleExample}>{rule.example}</span>
                          <span className={styles.ruleBadge}>
                            {formatNumber(findingCells.get(rule.id) ?? 0)}
                            <span>セル</span>
                          </span>
                        </label>
                        <p className={styles.ruleDetail}>{rule.detail}</p>
                        {pendingRule === rule.id ? (
                          <p className={styles.confirm} role="status">
                            {rule.confirm ??
                              "この規則は、値が別のものに化けることがあります。"}
                            <button
                              type="button"
                              className={styles.miniButton}
                              onClick={() => toggleRule(rule, true)}
                            >
                              このまま入れる
                            </button>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            <label className={styles.selectRow}>
              <span>波ダッシュの寄せ先</span>
              <select
                value={ruleOptions.waveDashTo}
                onChange={(e) =>
                  setRuleOptions({
                    ...ruleOptions,
                    waveDashTo: e.target.value as RuleOptions["waveDashTo"],
                  })
                }
              >
                {WAVE_DASH_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {/* ---- 04 見つかったもの ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>04</span>修正が入る行
            </h3>

            {result.changedRows.length === 0 ? (
              <p className={styles.stepFine}>修正が入る行はありません。</p>
            ) : (
              <ul className={styles.docList}>
                {changedRowList.map((row) => {
                  const list = changesByRow.get(row) ?? [];
                  const head = list[0]?.header ?? "";
                  const sourceLine = list[0]?.sourceLine ?? row;
                  return (
                    <li key={row}>
                      <button
                        type="button"
                        className={`${styles.docItem} ${
                          focusRow === row ? styles.docItemActive : ""
                        }`}
                        onClick={() => focusOnRow(row)}
                        title={`元ファイル ${sourceLine}行目`}
                      >
                        <span className={styles.docNo}>{row}行目</span>
                        <span className={styles.docWhere}>
                          {list.length > 1 ? `${head}ほか${list.length - 1}箇所` : head}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {result.changedRows.length > LIST_MAX ? (
                  <li className={styles.issueMore}>
                    ほか{formatNumber(result.changedRows.length - LIST_MAX)}行
                  </li>
                ) : null}
              </ul>
            )}

            <details className={styles.details}>
              <summary className={styles.summary}>
                重複の疑い {formatNumber(result.duplicates.length)}組
              </summary>

              <p className={styles.stepFine}>
                同じ相手に見える行を候補として並べます。行を勝手に消すことはしません。
                照合は先頭の文字が近い組から探すので、先頭が大きく違う組は見つけられません。
              </p>

              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={dedupe.enabled}
                  onChange={(e) => setDedupe({ ...dedupe, enabled: e.target.checked })}
                />
                <span>重複の疑いを探す</span>
              </label>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={dedupe.useNear}
                  onChange={(e) => setDedupe({ ...dedupe, useNear: e.target.checked })}
                />
                <span>似ている組（近似一致）まで探す</span>
              </label>
              <label className={styles.rangeRow}>
                <span>
                  似ていると見なす下限　{Math.round(dedupe.minSimilarity * 100)}%
                </span>
                <input
                  type="range"
                  min={75}
                  max={95}
                  step={1}
                  value={Math.round(dedupe.minSimilarity * 100)}
                  onChange={(e) =>
                    setDedupe({ ...dedupe, minSimilarity: Number(e.target.value) / 100 })
                  }
                />
              </label>

              <ul className={styles.docList}>
                {result.duplicates.slice(0, LIST_MAX).map((group) => (
                  <li key={group.mark}>
                    <button
                      type="button"
                      className={styles.docItem}
                      onClick={() => focusOnRow(group.rows[0])}
                      title={`照合に使った値：${group.key}`}
                    >
                      <span className={styles.docNo}>{group.mark}</span>
                      <span className={styles.docWhere}>
                        {DUPLICATE_LEVEL_LABELS[group.level]}
                        {group.similarity !== undefined
                          ? `（${Math.round(group.similarity * 100)}%）`
                          : ""}
                        　{group.values[0] ?? ""}
                      </span>
                      <span className={styles.docCount}>
                        {group.rows.length}行（{group.rows.join(", ")}）
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </section>

          {/* ---- 05 書き出す ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>05</span>書き出す
            </h3>
            <p className={styles.stepNote}>
              整えた名簿はすべて文字列として書き出します（Excel
              が郵便番号や電話番号の先頭の 0 を落とすのを防ぐため）。CSV は Excel
              が開くときに読み替えることがあるので、.xlsx をおすすめします。
            </p>

            <div className={styles.exportRow}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void runExport("xlsx")}
                disabled={busy !== null || parsed.rows.length === 0 || trial.limited}
              >
                整えた名簿を .xlsx で書き出す
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => void runExport("csv")}
                disabled={busy !== null || parsed.rows.length === 0 || trial.limited}
              >
                名簿 .csv
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => void runExport("report")}
                disabled={busy !== null || result.changes.length === 0 || trial.limited}
              >
                修正レポート .csv
              </button>
            </div>
            <TrialNotice trial={trial} />

            <p className={styles.stepFine}>
              .xlsx は「名簿・修正一覧・重複候補」の3シートです。CSV は Excel
              で開いても文字化けしない形（UTF-8 BOM 付き）で書き出します。
            </p>

            {busy ? <p className={styles.busy}>{busy}</p> : null}
            {computed.error ? (
              <p className={styles.message}>{computed.error}</p>
            ) : null}
            {result.messages.map((text, i) => (
              <p className={styles.message} key={`m${i}`}>
                {text}
              </p>
            ))}
            {message ? <p className={styles.message}>{message}</p> : null}
          </section>
        </div>

        {/* ================= 右：ステージ（★主役） ================= */}
        <div className={styles.stage} aria-busy={stale}>
          <div className={styles.stageBar}>
            <p className={styles.stageTitle}>修正前と修正後</p>
            <div className={styles.stageToggles}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={showAllRows}
                  onChange={(e) => setShowAllRows(e.target.checked)}
                />
                <span>すべての行を表示</span>
              </label>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={showSpaces}
                  onChange={(e) => setShowSpaces(e.target.checked)}
                />
                <span>空白を記号で表示</span>
              </label>
            </div>
          </div>

          {narrow ? (
            renderCards()
          ) : (
            <div className={styles.compare}>
              {renderPane("before")}
              {renderPane("after")}
            </div>
          )}

          <p className={styles.legend}>
            <span className={styles.legendBefore}>消えた文字</span>
            <span className={styles.legendAfter}>入った文字</span>
            <span className={styles.legendNote}>
              不可視文字は「·」、半角空白は「␣」、全角空白は「□」で表します。
            </span>
          </p>

          <p className={styles.stageNote}>
            {showAllRows
              ? "すべての行を出しています。"
              : "修正が入った行と、その前後1行、重複の疑いのある行だけを出しています。"}
            {stageEntries.truncated > 0
              ? `　画面が重くなるため${formatNumber(stageEntries.truncated)}行は表示していません（書き出しにはすべて含まれます）。`
              : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
