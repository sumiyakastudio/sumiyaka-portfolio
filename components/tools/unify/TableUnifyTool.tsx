"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { aliasGroupOf, aliasKindOf } from "@/lib/tools/unify/aliases";
import { autoMap } from "@/lib/tools/unify/automap";
import { unifyKey } from "@/lib/tools/unify/key";
import { SAMPLE_FILES, SAMPLE_GRIDS } from "@/lib/tools/unify/sample";
import { unify } from "@/lib/tools/unify/unify";
import {
  BUILTIN_SCHEMAS,
  DEFAULT_UNIFY_OPTIONS,
  MAX_FILES,
  MAX_TARGET_COLUMNS,
  MAX_TOTAL_ROWS,
  NO_HEADER_ROW,
  PREVIEW_ROWS,
  type Assignment,
  type ColumnKind,
  type MappingTable,
  type ParseOptions,
  type SourceFile,
  type TargetColumn,
  type TargetSchema,
  type ToolIssue,
  type UnifyOptions,
} from "@/lib/tools/unify/types";
import { formatDateJa, formatNumber, formatQty } from "@/lib/tools/_shared/format";
import { useTrialLimit } from "@/lib/tools/_shared/trialLimit";
import ToolMark from "@/components/tools/_marks/ToolMark";
import TrialNotice from "@/components/tools/_shared-ui/TrialNotice";
import MappingBoard from "./MappingBoard";
import styles from "./TableUnifyTool.module.css";

/**
 * 列マッピング統合 — ツール本体
 *
 * ⚠ 設計の芯：**ブラウザ内で完結する**。読み込んだ表も、決めた管理表の形も、
 *    書き出したファイルも、一切サーバへ送らない。ネットワークへは出ない。
 *
 * ⚠ 重い依存（fflate）を初期バンドルへ入れないため、`_shared/sheetReader` と
 *    `_shared/xlsxWriter` に触る層（`parse.ts` / `exportSheet.ts`）は
 *    **すべて `await import(...)`** で読む。静的に import してよいのは純粋な層だけ。
 *    詳しくは `lib/tools/unify/types.ts` の §0。
 *
 * ⚠ 「統合する」ボタンは作らない。マッピングを変えた瞬間に再計算して
 *    プレビューが変わる。揃っていく様子が即座に見えることがこのツールの価値で、
 *    ボタンを挟むとそれが死ぬ。重いのは書き出しだけ。
 */

const STORAGE_KEY = "akashiki.tools.unify.schema.v1";
/** 1ファイルあたりの受け入れ上限（読み込みで固まらせない） */
const FILE_MAX_BYTES = 12 * 1024 * 1024;

/** 取り込み元。見出し行やシートを変えたときに読み直すために持っておく */
type SourceOrigin =
  | { kind: "bytes"; name: string; bytes: Uint8Array }
  | { kind: "grid"; index: number };

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
  // Safari は revoke が早すぎるとダウンロードが落ちるので少し待つ
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 見出しの語から値の種類を当てる。データが無いひな形でも種類を埋められる */
function kindFromHeader(header: string, fallback: ColumnKind = "text"): ColumnKind {
  const group = aliasGroupOf(unifyKey(header));
  if (!group) return fallback;
  return aliasKindOf(group) ?? fallback;
}

/** 保存済みの出力スキーマを読む。壊れていたら黙って捨てる */
function loadSchema(): TargetSchema | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TargetSchema>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.name !== "string" || !Array.isArray(parsed.columns)) return null;
    const columns: TargetColumn[] = [];
    for (const col of parsed.columns) {
      if (!col || typeof col !== "object") continue;
      const c = col as Partial<TargetColumn>;
      if (typeof c.id !== "string" || typeof c.name !== "string") continue;
      const kind: ColumnKind =
        c.kind === "number" || c.kind === "date" ? c.kind : "text";
      columns.push({ id: c.id, name: c.name, kind, required: c.required === true });
    }
    if (columns.length === 0) return null;
    return { name: parsed.name, columns: columns.slice(0, MAX_TARGET_COLUMNS) };
  } catch {
    return null;
  }
}

/** 数値の見せ方。整数は3桁区切り、小数は第2位まで（出力ファイルの値は別＝生のまま） */
function previewNumber(value: number): string {
  return Number.isInteger(value) ? formatNumber(value) : formatQty(value);
}

/** 拡張子を落とす。ひな形のファイル名をそのまま管理表の名前にする */
function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim() || "管理表";
}

/**
 * 初期表示ぶんの下書きを先に組む。
 * ⚠ useEffect に任せると、最初の1フレームだけ線が無い盤が出る。
 *    このツールは盤が主役なので、描画前に埋めておく。
 */
function initialAutoMap(files: SourceFile[], schema: TargetSchema) {
  const mapping: MappingTable = {};
  const ambiguousByFile: Record<string, Record<string, string[]>> = {};
  for (const file of files) {
    const result = autoMap(file, schema);
    mapping[file.id] = result.assignments;
    ambiguousByFile[file.id] = result.ambiguous;
  }
  return { mapping, ambiguousByFile };
}

export default function TableUnifyTool() {
  const [files, setFiles] = useState<SourceFile[]>(SAMPLE_FILES);
  const [isSample, setIsSample] = useState(true);
  const [activeId, setActiveId] = useState<string>(SAMPLE_FILES[0]?.id ?? "");
  const [schema, setSchema] = useState<TargetSchema>(BUILTIN_SCHEMAS[0]);
  /**
   * 計算に使う出力スキーマ。
   * ⚠ 列名の入力欄は1文字打つたびに schema の同一性が変わる。そのまま計算に流すと
   *    キーストロークごとに autoMap と unify が全行を走り、行数が多いと入力が詰まる。
   *    入力欄は schema（即時）、盤とプレビューは workSchema（遅延）を見る。
   */
  const workSchema = useDeferredValue(schema);
  const [mapping, setMapping] = useState<MappingTable>(
    () => initialAutoMap(SAMPLE_FILES, BUILTIN_SCHEMAS[0]).mapping,
  );
  const [ambiguous, setAmbiguous] = useState<Record<string, Record<string, string[]>>>(
    () => initialAutoMap(SAMPLE_FILES, BUILTIN_SCHEMAS[0]).ambiguousByFile,
  );
  const [options, setOptions] = useState<UnifyOptions>(DEFAULT_UNIFY_OPTIONS);
  const [issues, setIssues] = useState<ToolIssue[]>([]);
  const [remember, setRemember] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** お試し版の上限（書き出し＝.xlsx / CSV のダウンロードを数える。端末側のみ） */
  const trial = useTrialLimit("unify");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const schemaInputRef = useRef<HTMLInputElement>(null);
  /** ファイルID → 取り込み元（読み直し用） */
  const originsRef = useRef<Record<string, SourceOrigin>>(
    Object.fromEntries(SAMPLE_GRIDS.map((g, i) => [g.id, { kind: "grid", index: i } as SourceOrigin])),
  );
  /** autoMap に渡す「前回の割当」。人が引いた線を機械に消させないために持つ */
  const mappingRef = useRef<MappingTable>({});
  const seqRef = useRef(SAMPLE_FILES.length);

  useEffect(() => {
    mappingRef.current = mapping;
  }, [mapping]);

  // 保存済みの出力スキーマがあれば復元する（初回描画後・SSRでは触らない）
  useEffect(() => {
    const saved = loadSchema();
    if (saved) {
      setSchema(saved);
      setRemember(true);
    }
  }, []);

  // 「この端末に保存する」が入っている間だけ書き戻す
  useEffect(() => {
    if (!remember) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
    } catch {
      /* 保存できない設定のブラウザでは黙って諦める */
    }
  }, [schema, remember]);

  // ファイルか出力スキーマが変わったら下書きを引き直す。
  // ⚠ 人が引いた線（manual）と固定値（const）は autoMap 側で温存される。
  useEffect(() => {
    const nextMapping: MappingTable = {};
    const nextAmbiguous: Record<string, Record<string, string[]>> = {};
    for (const file of files) {
      const result = autoMap(file, workSchema, mappingRef.current[file.id]);
      nextMapping[file.id] = result.assignments;
      nextAmbiguous[file.id] = result.ambiguous;
    }
    setMapping(nextMapping);
    setAmbiguous(nextAmbiguous);
  }, [files, workSchema]);

  // 表示中のファイルが消えたら先頭へ戻す
  useEffect(() => {
    if (files.length === 0) return;
    if (!files.some((f) => f.id === activeId)) setActiveId(files[0].id);
  }, [files, activeId]);

  const result = useMemo(
    () => unify(files, workSchema, mapping, options),
    [files, workSchema, mapping, options],
  );

  const activeFile = files.find((f) => f.id === activeId) ?? files[0] ?? null;
  const previewRows = result.rows.slice(0, PREVIEW_ROWS);
  const allIssues = useMemo(
    () => [...issues, ...result.issues],
    [issues, result.issues],
  );

  /* ---------------- ファイルの取り込み ---------------- */

  const readFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return;
      setMessage(null);
      setBusy("ファイルを読み込んでいます…");
      try {
        const { parseSourceBytes } = await import("@/lib/tools/unify/parse");

        // サンプルが入っている状態で最初の1本を入れたら、サンプルは退場させる
        const base = isSample ? [] : files;
        const baseIssues = isSample ? [] : issues;
        const added: SourceFile[] = [];
        const addedIssues: ToolIssue[] = [...baseIssues];
        let rowTotal = base.reduce((sum, f) => sum + f.rows.length, 0);

        for (const file of incoming) {
          if (base.length + added.length >= MAX_FILES) {
            addedIssues.push({
              line: 0,
              level: "warn",
              message: `一度に取り込めるのは${MAX_FILES}ファイルまでです。${file.name} は取り込んでいません。`,
            });
            continue;
          }
          if (file.size > FILE_MAX_BYTES) {
            addedIssues.push({
              line: 0,
              level: "error",
              message: `${file.name} は大きすぎます（12MBまで）。`,
            });
            continue;
          }
          const bytes = new Uint8Array(await file.arrayBuffer());
          const id = `f${(seqRef.current += 1)}`;
          const parsed = parseSourceBytes(bytes, file.name, { id });
          addedIssues.push(...parsed.issues);
          if (!parsed.file) continue;

          if (rowTotal + parsed.file.rows.length > MAX_TOTAL_ROWS) {
            addedIssues.push({
              line: 0,
              level: "error",
              message: `合計 ${MAX_TOTAL_ROWS.toLocaleString("ja-JP")}行を超えるため、${file.name} は取り込んでいません。`,
            });
            continue;
          }
          rowTotal += parsed.file.rows.length;
          originsRef.current[id] = { kind: "bytes", name: file.name, bytes };
          added.push(parsed.file);
        }

        setIssues(addedIssues);
        if (added.length === 0) {
          if (base.length === 0) {
            setMessage("読み取れる表がありませんでした。Excel（.xlsx）か CSV をお試しください。");
          }
          return;
        }
        // サンプルを置き換えるときは、前の割当を引きずらないように捨てる
        if (isSample) mappingRef.current = {};
        setFiles([...base, ...added]);
        setIsSample(false);
        setActiveId(added[0].id);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "ファイルを読み取れませんでした。",
        );
      } finally {
        setBusy(null);
      }
    },
    [files, issues, isSample],
  );

  const onFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const list = Array.from(event.target.files ?? []);
      event.target.value = "";
      void readFiles(list);
    },
    [readFiles],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      void readFiles(Array.from(event.dataTransfer.files ?? []));
    },
    [readFiles],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    delete originsRef.current[id];
    const next = { ...mappingRef.current };
    delete next[id];
    mappingRef.current = next;
  }, []);

  const useSample = useCallback(() => {
    mappingRef.current = {};
    originsRef.current = Object.fromEntries(
      SAMPLE_GRIDS.map((g, i) => [g.id, { kind: "grid", index: i } as SourceOrigin]),
    );
    setFiles(SAMPLE_FILES);
    setIsSample(true);
    setIssues([]);
    setMessage(null);
    setActiveId(SAMPLE_FILES[0]?.id ?? "");
  }, []);

  /** 見出し行・シートを選び直して読み直す */
  const reparse = useCallback(async (id: string, opts: ParseOptions) => {
    const origin = originsRef.current[id];
    if (!origin) return;
    setMessage(null);
    setBusy("読み直しています…");
    try {
      const { parseSourceBytes, buildSourceFileFromGrid } = await import(
        "@/lib/tools/unify/parse"
      );
      const parsed =
        origin.kind === "bytes"
          ? parseSourceBytes(origin.bytes, origin.name, { ...opts, id })
          : buildSourceFileFromGrid(
              SAMPLE_GRIDS[origin.index].grid,
              {
                id,
                name: SAMPLE_GRIDS[origin.index].name,
                sheetName: SAMPLE_GRIDS[origin.index].sheetName,
                sheetNames: SAMPLE_GRIDS[origin.index].sheetNames,
              },
              { ...opts, id },
            );
      if (!parsed.file) {
        setMessage("その指定では表を読み取れませんでした。");
        return;
      }
      const next = parsed.file;
      setFiles((prev) => prev.map((f) => (f.id === id ? next : f)));
      setIssues((prev) => [...prev.filter((i) => i.level === "error"), ...parsed.issues]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "読み直せませんでした。");
    } finally {
      setBusy(null);
    }
  }, []);

  /* ---------------- 出力スキーマ ---------------- */

  const applyBuiltin = useCallback((name: string) => {
    const found = BUILTIN_SCHEMAS.find((s) => s.name === name);
    if (found) setSchema(found);
  }, []);

  /** ★方式A：いつも使っている管理表を読み込み、その見出しを出力の形にする */
  const readSchemaTemplate = useCallback(async (file: File) => {
    setMessage(null);
    setBusy("管理表のひな形を読み込んでいます…");
    try {
      const { parseSourceBytes } = await import("@/lib/tools/unify/parse");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseSourceBytes(bytes, file.name, { id: "schema" });
      if (!parsed.file || parsed.file.columns.length === 0) {
        setMessage("ひな形の見出し行を読み取れませんでした。1行目に列名が並んだ表をお選びください。");
        return;
      }
      const columns: TargetColumn[] = parsed.file.columns
        .slice(0, MAX_TARGET_COLUMNS)
        .map((col, i) => ({
          id: `t${i + 1}`,
          name: col.header,
          kind: col.guessedKind !== "text" ? col.guessedKind : kindFromHeader(col.header),
          required: false,
        }));
      setSchema({ name: baseName(file.name), columns });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ひな形を読み取れませんでした。");
    } finally {
      setBusy(null);
    }
  }, []);

  /** 方式D：いま見ているファイルの形を、そのまま出力の形にする */
  const useFileAsSchema = useCallback(() => {
    if (!activeFile) return;
    const columns: TargetColumn[] = activeFile.columns
      .slice(0, MAX_TARGET_COLUMNS)
      .map((col, i) => ({
        id: `t${i + 1}`,
        name: col.header,
        kind: col.guessedKind !== "text" ? col.guessedKind : kindFromHeader(col.header),
        required: false,
      }));
    setSchema({ name: baseName(activeFile.name), columns });
  }, [activeFile]);

  const patchColumn = useCallback((id: string, patch: Partial<TargetColumn>) => {
    setSchema((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const moveColumn = useCallback((id: string, step: -1 | 1) => {
    setSchema((prev) => {
      const at = prev.columns.findIndex((c) => c.id === id);
      const to = at + step;
      if (at < 0 || to < 0 || to >= prev.columns.length) return prev;
      const columns = [...prev.columns];
      const [moved] = columns.splice(at, 1);
      columns.splice(to, 0, moved);
      return { ...prev, columns };
    });
  }, []);

  const removeColumn = useCallback((id: string) => {
    setSchema((prev) =>
      prev.columns.length <= 1
        ? prev
        : { ...prev, columns: prev.columns.filter((c) => c.id !== id) },
    );
  }, []);

  const addColumn = useCallback(() => {
    setSchema((prev) => {
      if (prev.columns.length >= MAX_TARGET_COLUMNS) return prev;
      // 既存のIDと衝突しない番号を選ぶ（列名を変えても線が切れないための不変ID）
      let n = prev.columns.length + 1;
      const used = new Set(prev.columns.map((c) => c.id));
      while (used.has(`t${n}`)) n += 1;
      return {
        ...prev,
        columns: [...prev.columns, { id: `t${n}`, name: "新しい列", kind: "text", required: false }],
      };
    });
  }, []);

  /* ---------------- マッピングの操作 ---------------- */

  const assignColumn = useCallback(
    (targetId: string, sourceIndex: number) => {
      if (!activeFile) return;
      const fileId = activeFile.id;
      setMapping((prev) => {
        const forFile = { ...(prev[fileId] ?? {}) };
        // 1つの入力列を2つの出力列に割り当てない（同じ列を使っていた側を外す）
        for (const [tid, assignment] of Object.entries(forFile)) {
          if (tid !== targetId && assignment.kind === "column" && assignment.index === sourceIndex) {
            delete forFile[tid];
          }
        }
        const next: Assignment = { kind: "column", index: sourceIndex, level: "manual", score: 100 };
        forFile[targetId] = next;
        return { ...prev, [fileId]: forFile };
      });
    },
    [activeFile],
  );

  const clearAssignment = useCallback(
    (targetId: string) => {
      if (!activeFile) return;
      const fileId = activeFile.id;
      setMapping((prev) => {
        const forFile = { ...(prev[fileId] ?? {}) };
        delete forFile[targetId];
        return { ...prev, [fileId]: forFile };
      });
    },
    [activeFile],
  );

  /**
   * 固定値を入れる。
   * ⚠ 値の解釈（日付・数値として読めるか）は動的層の makeSourceCell に任せる。
   *    静的層で解釈し直すとバンドル境界を越える。
   */
  const assignConst = useCallback(
    async (targetId: string, value: string) => {
      if (!activeFile) return;
      const fileId = activeFile.id;
      const { makeSourceCell } = await import("@/lib/tools/unify/parse");
      const cell = makeSourceCell(value);
      setMapping((prev) => ({
        ...prev,
        [fileId]: {
          ...(prev[fileId] ?? {}),
          [targetId]: { kind: "const", value, date: cell.date, num: cell.num },
        },
      }));
    },
    [activeFile],
  );

  const onAssignConst = useCallback(
    (targetId: string, value: string) => {
      void assignConst(targetId, value);
    },
    [assignConst],
  );

  /* ---------------- 書き出し ---------------- */

  const exportAs = useCallback(
    async (ext: "xlsx" | "csv") => {
      if (result.rows.length === 0) {
        setMessage("書き出せる行がありません。");
        return;
      }
      // お試し版の上限。数えてから書き出す（上限なら数えずに中止）
      if (!trial.consume()) return;
      setMessage(null);
      setBusy(ext === "xlsx" ? "Excelを組んでいます…" : "CSVを書き出しています…");
      try {
        const { buildUnifiedXlsx, buildUnifiedCsv, unifiedFileName } = await import(
          "@/lib/tools/unify/exportSheet"
        );
        const name = unifiedFileName(workSchema.name, ext, new Date());
        if (ext === "xlsx") {
          triggerDownload(
            buildUnifiedXlsx(result),
            name,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          );
        } else {
          triggerDownload(buildUnifiedCsv(result), name, "text/csv;charset=utf-8");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "書き出せませんでした。");
      } finally {
        setBusy(null);
      }
    },
    [result, workSchema.name, trial],
  );

  /* ---------------- 描画 ---------------- */

  const inputRows = files.reduce((sum, f) => sum + f.rows.length, 0);

  return (
    <div className={styles.tool}>
      {/* ================= ステータス ================= */}
      <div className={styles.status}>
        <div className={styles.statusMain}>
          <ToolMark tool="unify" size={22} className={styles.statusMark} />
          <span className={styles.statusFile}>
            {files.length > 0 ? files.map((f) => f.name).join(" / ") : "ファイルがありません"}
          </span>
          {isSample ? <span className={styles.chipSample}>サンプル</span> : null}
        </div>
        <dl className={styles.statusStats}>
          <div>
            <dt>ファイル</dt>
            <dd>
              {files.length}
              <span>ファイル</span>
            </dd>
          </div>
          <div>
            <dt>読み込み</dt>
            <dd>
              {inputRows}
              <span>行</span>
            </dd>
          </div>
          <div>
            <dt>出力列</dt>
            <dd>
              {result.columns.length}
              <span>列</span>
            </dd>
          </div>
          <div>
            <dt>統合後</dt>
            <dd>
              {result.stats.outputRows}
              <span>行</span>
            </dd>
          </div>
          <div>
            <dt>要確認</dt>
            <dd>
              {result.stats.needsReview}
              <span>件</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className={styles.layout}>
        {/* ================= 左：操作 ================= */}
        <div className={styles.panel}>
          {/* ---- 1. 読み込む ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>01</span>表を読み込む
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
              <span className={styles.dropSub}>まとめて選べます（{MAX_FILES}ファイルまで）</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.csv,text/csv"
                className={styles.fileInput}
                onChange={onFileChange}
              />
            </div>

            <p className={styles.stepNote}>
              読み込んだファイルはこの端末の中だけで処理され、どこにも送信されません。
              Excelは1枚のシートを読みます（複数あるときは選べます）。
            </p>

            <div className={styles.rowButtons}>
              <a
                className={styles.ghostButton}
                href="/tools/unify/sample-a-jyuchu.csv"
                download="A社_受注データ.csv"
              >
                サンプル A .csv
              </a>
              <a
                className={styles.ghostButton}
                href="/tools/unify/sample-b-uriage.xlsx"
                download="B社_売上一覧.xlsx"
              >
                B .xlsx
              </a>
              <a
                className={styles.ghostButton}
                href="/tools/unify/sample-c-meisai.csv"
                download="C社_明細_2026年7月.csv"
              >
                C .csv
              </a>
              <button type="button" className={styles.ghostButton} onClick={useSample}>
                サンプルで試す
              </button>
            </div>

            {allIssues.length > 0 ? (
              <ul className={styles.issues}>
                {allIssues.slice(0, 8).map((issue, i) => (
                  <li
                    key={`${issue.line}-${i}`}
                    className={issue.level === "error" ? styles.issueError : styles.issueWarn}
                  >
                    <span className={styles.issueLine}>
                      {issue.line > 0 ? `${issue.line}行目` : "全体"}
                    </span>
                    <span>{issue.message}</span>
                  </li>
                ))}
                {allIssues.length > 8 ? (
                  <li className={styles.issueMore}>ほか{allIssues.length - 8}件</li>
                ) : null}
              </ul>
            ) : null}
          </section>

          {/* ---- 2. 出力の形 ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>02</span>出力の形を決める
            </h3>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => schemaInputRef.current?.click()}
            >
              管理表のひな形を読み込む
            </button>
            <input
              ref={schemaInputRef}
              type="file"
              accept=".xlsx,.csv,text/csv"
              className={styles.fileInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void readSchemaTemplate(file);
              }}
            />
            <p className={styles.stepNote}>
              いつも使っている管理表を読み込むと、その列の並びがそのまま出力の形になります。
              <a
                className={styles.inlineLink}
                href="/tools/unify/sample-schema-uriage.xlsx"
                download="管理表のひな形.xlsx"
              >
                ひな形 .xlsx
              </a>
            </p>

            <label className={styles.selectRow}>
              <span>見本から選ぶ</span>
              <select
                value={BUILTIN_SCHEMAS.some((s) => s.name === schema.name) ? schema.name : ""}
                onChange={(e) => applyBuiltin(e.target.value)}
              >
                <option value="">（読み込んだ形）</option>
                {BUILTIN_SCHEMAS.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <ul className={styles.colList}>
              {schema.columns.map((col, i) => (
                <li key={col.id} className={styles.colRow}>
                  <span className={styles.colMove}>
                    <button
                      type="button"
                      onClick={() => moveColumn(col.id, -1)}
                      disabled={i === 0}
                      aria-label={`${col.name} を上へ`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveColumn(col.id, 1)}
                      disabled={i === schema.columns.length - 1}
                      aria-label={`${col.name} を下へ`}
                    >
                      ↓
                    </button>
                  </span>
                  <input
                    type="text"
                    className={styles.colName}
                    value={col.name}
                    onChange={(e) => patchColumn(col.id, { name: e.target.value })}
                    aria-label="列の名前"
                  />
                  <select
                    className={styles.colKind}
                    value={col.kind}
                    onChange={(e) => patchColumn(col.id, { kind: e.target.value as ColumnKind })}
                    aria-label={`${col.name} の種類`}
                  >
                    <option value="text">文字</option>
                    <option value="number">数値</option>
                    <option value="date">日付</option>
                  </select>
                  <label className={styles.colRequired}>
                    <input
                      type="checkbox"
                      checked={col.required}
                      onChange={(e) => patchColumn(col.id, { required: e.target.checked })}
                    />
                    <span>必須</span>
                  </label>
                  <button
                    type="button"
                    className={styles.colDelete}
                    onClick={() => removeColumn(col.id)}
                    disabled={schema.columns.length <= 1}
                    aria-label={`${col.name} を削除`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <div className={styles.rowButtons}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={addColumn}
                disabled={schema.columns.length >= MAX_TARGET_COLUMNS}
              >
                ＋ 列を追加
              </button>
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

            {/* 共通仕様 §6＝localStorage へ入れるものは、画面に明記する */}
            <p className={styles.stepNote}>
              保存した管理表の形は、この端末の中だけに残ります。送信されません。
            </p>
          </section>

          {/* ---- 3. 書き出す ---- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>03</span>書き出す
            </h3>

            <div className={styles.checkList}>
              <label>
                <input
                  type="checkbox"
                  checked={options.addSourceColumn}
                  onChange={(e) => setOptions((o) => ({ ...o, addSourceColumn: e.target.checked }))}
                />
                <span>取り込み元のファイル名を入れる</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={options.addSourceLineColumn}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, addSourceLineColumn: e.target.checked }))
                  }
                />
                <span>元の行番号を入れる</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={options.keepUnmapped}
                  onChange={(e) => setOptions((o) => ({ ...o, keepUnmapped: e.target.checked }))}
                />
                <span>対応づけられなかった列も末尾に残す</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={options.dropSuspectSubtotal}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, dropSuspectSubtotal: e.target.checked }))
                  }
                />
                <span>
                  小計らしき行を外す
                  {result.stats.droppedSubtotal > 0 ? `（${result.stats.droppedSubtotal}行）` : ""}
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={options.dedupe}
                  onChange={(e) => setOptions((o) => ({ ...o, dedupe: e.target.checked }))}
                />
                <span>
                  同じ内容の行をまとめる
                  {result.stats.droppedDuplicate > 0
                    ? `（${result.stats.droppedDuplicate}行）`
                    : ""}
                </span>
              </label>
            </div>

            <div className={styles.exportRow}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void exportAs("xlsx")}
                disabled={busy !== null || result.rows.length === 0 || trial.limited}
              >
                Excel（.xlsx）で書き出す
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => void exportAs("csv")}
                disabled={busy !== null || result.rows.length === 0 || trial.limited}
              >
                CSV
              </button>
            </div>
            <TrialNotice trial={trial} />

            {busy ? <p className={styles.busy}>{busy}</p> : null}
            {message ? <p className={styles.message}>{message}</p> : null}

            {result.stats.droppedSources.length > 0 ? (
              <p className={styles.issueSummary}>
                出力に載せていない列：{result.stats.droppedSources.slice(0, 6).join("・")}
                {result.stats.droppedSources.length > 6
                  ? ` ほか${result.stats.droppedSources.length - 6}件`
                  : ""}
              </p>
            ) : null}
          </section>
        </div>

        {/* ================= 右：マッピング盤（主役） ================= */}
        <div className={styles.stage}>
          <div className={styles.tabs}>
            <ul className={styles.tabList}>
              {files.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className={`${styles.docItem} ${f.id === activeId ? styles.docItemActive : ""}`}
                    onClick={() => setActiveId(f.id)}
                  >
                    <span className={styles.docName}>{f.name}</span>
                    <span className={styles.docCount}>{f.rows.length}行</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.tabActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={useFileAsSchema}
                disabled={!activeFile}
              >
                このファイルの形を出力にする
              </button>
              {activeFile && !isSample ? (
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => removeFile(activeFile.id)}
                >
                  このファイルを外す
                </button>
              ) : null}
            </div>
          </div>

          {activeFile ? (
            <>
              <div className={styles.sourceMeta}>
                {activeFile.sheetNames.length > 1 ? (
                  <label className={styles.metaRow}>
                    <span>シート</span>
                    <select
                      value={activeFile.sheetName}
                      onChange={(e) =>
                        void reparse(activeFile.id, { sheetName: e.target.value })
                      }
                    >
                      {activeFile.sheetNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className={styles.metaRow}>
                  <span>見出し行</span>
                  <select
                    value={activeFile.headerIndex}
                    onChange={(e) =>
                      void reparse(activeFile.id, {
                        sheetName: activeFile.sheetName || undefined,
                        headerRow: Number(e.target.value),
                      })
                    }
                  >
                    {Array.from({ length: 10 }, (_, i) => (
                      <option key={i} value={i}>
                        {i + 1}行目
                      </option>
                    ))}
                    <option value={NO_HEADER_ROW}>見出し行なし</option>
                  </select>
                </label>
              </div>

              {/* key＝ファイルを切り替えたときに盤の内部状態（選択中の出力列・
                  固定値の入力欄）を確実に初期化する。盤はマッピングを持たない */}
              <MappingBoard
                key={activeFile.id}
                file={activeFile}
                schema={workSchema}
                assignments={mapping[activeFile.id] ?? {}}
                ambiguous={ambiguous[activeFile.id] ?? {}}
                onAssignColumn={assignColumn}
                onClear={clearAssignment}
                onAssignConst={onAssignConst}
              />
            </>
          ) : (
            <p className={styles.empty}>
              表を読み込むと、ここに列の対応づけが出ます。
            </p>
          )}

          {/* ---- 統合プレビュー ---- */}
          <div className={styles.previewHead}>
            <h4>統合プレビュー</h4>
            <span>
              先頭 {Math.min(PREVIEW_ROWS, result.rows.length)}行 / 全
              {result.stats.outputRows}行
            </span>
          </div>
          <div className={styles.previewScroll}>
            <table className={styles.preview}>
              <thead>
                <tr>
                  {result.columns.map((col, i) => (
                    <th key={`${col.name}-${i}`} data-origin={col.origin}>
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, r) => (
                  <tr key={`${row.fileId}-${row.line}-${r}`} title={`${row.fileName} ${row.line}行目`}>
                    {row.cells.map((cell, c) => (
                      <td
                        key={c}
                        className={cell.mismatch ? styles.cellMismatch : undefined}
                        data-kind={result.columns[c]?.kind}
                      >
                        {cell.iso
                          ? formatDateJa(cell.iso)
                          : cell.num !== null
                            ? previewNumber(cell.num)
                            : cell.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.spHint}>横にスクロールできます。</p>
          {result.stats.mismatchCells > 0 ? (
            <p className={styles.stageNote}>
              下線の付いたセルは、列の種類（日付・数値）として読み取れなかったものです。
              値は元のまま書き出します。列の種類を「文字」に変えると下線は消えます。
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
