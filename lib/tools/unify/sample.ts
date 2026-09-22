/**
 * 列マッピング統合ツール（T-04） — サンプルデータ
 *
 * ⚠ 取引先名・担当者名・部署名はすべて **架空** です。実在の企業・個人とは関係ありません。
 *
 * ★ここは **静的層**。画面が最初から import する（0操作で絵が出ることが大事）。
 *   したがって値の import はしない（`import type` だけ）。fflate を引くと
 *   ページを開いただけで重い依存が落ちてくる（types.ts §0 のモジュール契約）。
 *
 * ★2つの形で持つ。
 *   - `SAMPLE_GRIDS` … 見出し行より前も含む**生の格子**。シートや見出し行を選び直したときの
 *     読み直し（`buildSourceFileFromGrid`）に使える。実ファイルと同じ形。
 *   - `SAMPLE_FILES` … 上を `buildSourceFileFromGrid` に通した結果。初期表示用。
 *
 * ⚠ `SAMPLE_FILES` は手で書き写さない。`._gen-sample.mts` が生成したものを貼ってある。
 *   食い違い（ドリフト）は `._check-unify.mts` の検証1が JSON 完全一致で検出する。
 *
 * このサンプルで何が確かめられるか（計画書 §11-3）
 *   ・別名（得意先名／取引先／会社名 → 取引先名 ほか）
 *   ・Excel の日付セル（B の「売上日」＝シリアル値）と和文日付（C の「2026年7月3日」）
 *   ・**読めない日付**（C の「7/21」＝年が無い）→ 原文のまま運んで mismatch
 *   ・小計行（C の最終行）／重複行（A 1行目と C 1行目）
 *   ・末尾の空セルが省かれた行（B の備考が空の3行＝6列で終わっている実物の形）
 */

import type { Cell } from "../_shared/sheetReader";
import type { SourceFile } from "./types";

/** 初期表示で選ばれている見本スキーマ（`BUILTIN_SCHEMAS` の先頭と同じ名前） */
export const SAMPLE_SCHEMA_NAME = "売上明細";

export interface SampleGrid {
  id: string;
  name: string;
  /** xlsx のとき読んだシート名。CSV は "" */
  sheetName: string;
  /** そのブックの全シート名。CSV は [] */
  sheetNames: string[];
  grid: Cell[][];
}

/** 文字セル */
const t = (text: string): Cell => ({ text, numeric: false });
/** 数値セル（元データが数値型だった＝Excel の日付セルもこれ） */
const n = (text: string): Cell => ({ text, numeric: true });

/**
 * 生の格子。`public/tools/unify/` に置いてある配布サンプルと同じ中身。
 *
 * ⚠ B の「売上日」は Excel の**日付セル**なので、格子の上ではシリアル値の数値セルになる。
 *   46208 = 2026-07-05／46222 = 2026-07-19／46227 = 2026-07-24／46233 = 2026-07-30。
 * ⚠ B の備考が空の3行は **6列で終わっている**（実物の Excel と同じく、末尾の空セルは
 *   シートXMLから省かれる）。読み手が列数ぶん埋める責任を持つ。ここを7列に揃えないこと。
 */
export const SAMPLE_GRIDS: SampleGrid[] = [
  {
    id: "f1",
    name: "A社_受注データ.csv",
    sheetName: "",
    sheetNames: [],
    grid: [
      [t("受注日"), t("得意先名"), t("商品名"), t("数量"), t("単価"), t("金額"), t("担当")],
      [t("2026/07/03"), t("株式会社ミナトデザイン"), t("A4封筒 印刷"), t("500"), t("12"), t("6000"), t("山田")],
      [t("2026/07/08"), t("合同会社あおば工房"), t("名刺 印刷（両面）"), t("200"), t("18"), t("3600"), t("山田")],
      [t("2026/07/12"), t("有限会社みどり不動産"), t("チラシ B5"), t("3000"), t("7"), t("21000"), t("佐藤")],
      [t("2026/07/15"), t("株式会社ミナトデザイン"), t("封筒 長3"), t("1000"), t("9"), t("9000"), t("山田")],
      [t("2026/07/22"), t("さくら歯科クリニック"), t("診察券 印刷"), t("500"), t("22"), t("11000"), t("佐藤")],
      [t("2026/07/28"), t("立花写真事務所"), t("ポストカード"), t("300"), t("15"), t("4500"), t("山田")],
    ],
  },
  {
    id: "f2",
    name: "B社_売上一覧.xlsx",
    sheetName: "売上一覧",
    sheetNames: ["売上一覧"],
    grid: [
      [t("No"), t("取引先"), t("品名"), t("売上日"), t("個数"), t("税抜単価"), t("備考")],
      [n("1001"), t("株式会社ヒノデ物産"), t("段ボール 60サイズ"), n("46208"), n("120"), n("85"), t("定期便")],
      [n("1002"), t("株式会社ヒノデ物産"), t("緩衝材 ロール"), n("46208"), n("6"), n("1200")],
      [n("1003"), t("有限会社みどり不動産"), t("宅配袋 大"), n("46222"), n("300"), n("34")],
      [n("1004"), t("立花写真事務所"), t("台紙 A4"), n("46227"), n("50"), n("210"), t("特注色")],
      [n("1005"), t("合同会社あおば工房"), t("ラベルシール"), n("46233"), n("1000"), n("6")],
    ],
  },
  {
    id: "f3",
    name: "C社_明細_2026年7月.csv",
    sheetName: "",
    sheetNames: [],
    grid: [
      [t("日付"), t("会社名"), t("内容"), t("数量"), t("単価"), t("部署"), t("合計")],
      [t("2026年7月3日"), t("株式会社ミナトデザイン"), t("A4封筒 印刷"), t("500"), t("12"), t("営業一課"), t("6000")],
      [t("2026年7月10日"), t("株式会社ヒノデ物産"), t("クラフトテープ"), t("40"), t("130"), t("営業二課"), t("5200")],
      [t("2026年7月17日"), t("さくら歯科クリニック"), t("予約カード"), t("300"), t("19"), t("営業一課"), t("5700")],
      [t("7/21"), t("合同会社あおば工房"), t("ステッカー"), t("200"), t("45"), t("営業二課"), t("9000")],
      [t("2026年7月26日"), t("株式会社ミナトデザイン"), t("領収書 綴り"), t("30"), t("240"), t("営業一課"), t("7200")],
      [t("合計"), t(""), t(""), t(""), t(""), t(""), t("33100")],
    ],
  },
];

/**
 * 画面の初期表示用（0操作で絵が出る）。
 * ⚠ 自動生成。手で直さないこと。`._gen-sample.mts` で作り直す。
 */
export const SAMPLE_FILES: SourceFile[] = [
  {
    id: "f1",
    name: "A社_受注データ.csv",
    sheetName: "",
    sheetNames: [],
    headerIndex: 0,
    headerLine: 1,
    columns: [
      { index: 0, header: "受注日", key: "受注日", duplicate: false, samples: ["2026/07/03", "2026/07/08", "2026/07/12"], guessedKind: "date" },
      { index: 1, header: "得意先名", key: "得意先名", duplicate: false, samples: ["株式会社ミナトデザイン", "合同会社あおば工房", "有限会社みどり不動産"], guessedKind: "text" },
      { index: 2, header: "商品名", key: "商品名", duplicate: false, samples: ["A4封筒 印刷", "名刺 印刷（両面）", "チラシ B5"], guessedKind: "text" },
      { index: 3, header: "数量", key: "数量", duplicate: false, samples: ["500", "200", "3000"], guessedKind: "number" },
      { index: 4, header: "単価", key: "単価", duplicate: false, samples: ["12", "18", "7"], guessedKind: "number" },
      { index: 5, header: "金額", key: "金額", duplicate: false, samples: ["6000", "3600", "21000"], guessedKind: "number" },
      { index: 6, header: "担当", key: "担当", duplicate: false, samples: ["山田", "山田", "佐藤"], guessedKind: "text" },
    ],
    rows: [
      {
        line: 2,
        cells: [
          { text: "2026/07/03", numeric: false, date: "2026-07-03", num: null },
          { text: "株式会社ミナトデザイン", numeric: false, date: null, num: null },
          { text: "A4封筒 印刷", numeric: false, date: null, num: null },
          { text: "500", numeric: false, date: null, num: 500 },
          { text: "12", numeric: false, date: null, num: 12 },
          { text: "6000", numeric: false, date: null, num: 6000 },
          { text: "山田", numeric: false, date: null, num: null },
        ],
        suspectSubtotal: false,
      },
      {
        line: 3,
        cells: [
          { text: "2026/07/08", numeric: false, date: "2026-07-08", num: null },
          { text: "合同会社あおば工房", numeric: false, date: null, num: null },
          { text: "名刺 印刷（両面）", numeric: false, date: null, num: null },
          { text: "200", numeric: false, date: null, num: 200 },
          { text: "18", numeric: false, date: null, num: 18 },
          { text: "3600", numeric: false, date: null, num: 3600 },
          { text: "山田", numeric: false, date: null, num: null },
        ],
        suspectSubtotal: false,
      },
      {
        line: 4,
        cells: [
          { text: "2026/07/12", numeric: false, date: "2026-07-12", num: null },
          { text: "有限会社みどり不動産", numeric: false, date: null, num: null },
          { text: "チラシ B5", numeric: false, date: null, num: null },
          { text: "3000", numeric: false, date: null, num: 3000 },
          { text: "7", numeric: false, date: null, num: 7 },
          { text: "21000", numeric: false, date: "1957-06-29", num: 21000 },
          { text: "佐藤", numeric: false, date: null, num: null },
        ],
        suspectSubtotal: false,
      },
      {
        line: 5,
        cells: [
          { text: "2026/07/15", numeric: false, date: "2026-07-15", num: null },
          { text: "株式会社ミナトデザイン", numeric: false, date: null, num: null },
          { text: "封筒 長3", numeric: false, date: null, num: null },
          { text: "1000", numeric: false, date: null, num: 1000 },
          { text: "9", numeric: false, date: null, num: 9 },
          { text: "9000", numeric: false, date: null, num: 9000 },
          { text: "山田", numeric: false, date: null, num: null },
        ],
        suspectSubtotal: false,
      },
      {
        line: 6,
        cells: [
          { text: "2026/07/22", numeric: false, date: "2026-07-22", num: null },
          { text: "さくら歯科クリニック", numeric: false, date: null, num: null },
          { text: "診察券 印刷", numeric: false, date: null, num: null },
          { text: "500", numeric: false, date: null, num: 500 },
          { text: "22", numeric: false, date: null, num: 22 },
          { text: "11000", numeric: false, date: null, num: 11000 },
          { text: "佐藤", numeric: false, date: null, num: null },
        ],
        suspectSubtotal: false,
      },
      {
        line: 7,
        cells: [
          { text: "2026/07/28", numeric: false, date: "2026-07-28", num: null },
          { text: "立花写真事務所", numeric: false, date: null, num: null },
          { text: "ポストカード", numeric: false, date: null, num: null },
          { text: "300", numeric: false, date: null, num: 300 },
          { text: "15", numeric: false, date: null, num: 15 },
          { text: "4500", numeric: false, date: null, num: 4500 },
          { text: "山田", numeric: false, date: null, num: null },
        ],
        suspectSubtotal: false,
      },
    ],
  },
  {
    id: "f2",
    name: "B社_売上一覧.xlsx",
    sheetName: "売上一覧",
    sheetNames: ["売上一覧"],
    headerIndex: 0,
    headerLine: 1,
    columns: [
      { index: 0, header: "No", key: "no", duplicate: false, samples: ["1001", "1002", "1003"], guessedKind: "number" },
      { index: 1, header: "取引先", key: "取引先", duplicate: false, samples: ["株式会社ヒノデ物産", "株式会社ヒノデ物産", "有限会社みどり不動産"], guessedKind: "text" },
      { index: 2, header: "品名", key: "品名", duplicate: false, samples: ["段ボール 60サイズ", "緩衝材 ロール", "宅配袋 大"], guessedKind: "text" },
      { index: 3, header: "売上日", key: "売上日", duplicate: false, samples: ["2026-07-05", "2026-07-05", "2026-07-19"], guessedKind: "date" },
      { index: 4, header: "個数", key: "個数", duplicate: false, samples: ["120", "6", "300"], guessedKind: "number" },
      { index: 5, header: "税抜単価", key: "税抜単価", duplicate: false, samples: ["85", "1200", "34"], guessedKind: "number" },
      { index: 6, header: "備考", key: "備考", duplicate: false, samples: ["定期便", "特注色"], guessedKind: "text" },
    ],
    rows: [
      {
        line: 2,
        cells: [
          { text: "1001", numeric: true, date: "1902-09-27", num: 1001 },
          { text: "株式会社ヒノデ物産", numeric: false, date: null, num: null },
          { text: "段ボール 60サイズ", numeric: false, date: null, num: null },
          { text: "46208", numeric: true, date: "2026-07-05", num: 46208 },
          { text: "120", numeric: true, date: "1900-04-29", num: 120 },
          { text: "85", numeric: true, date: "1900-03-25", num: 85 },
          { text: "定期便", numeric: false, date: null, num: null },
        ],
        suspectSubtotal: false,
      },
      {
        line: 3,
        cells: [
          { text: "1002", numeric: true, date: "1902-09-28", num: 1002 },
          { text: "株式会社ヒノデ物産", numeric: false, date: null, num: null },
          { text: "緩衝材 ロール", numeric: false, date: null, num: null },
          { text: "46208", numeric: true, date: "2026-07-05", num: 46208 },
          { text: "6", numeric: true, date: "1900-01-06", num: 6 },
          { text: "1200", numeric: true, date: "1903-04-14", num: 1200 },
          { text: "", numeric: false, date: null, num: null },
        ],
        suspectSubtotal: false,
      },
      {
        line: 4,
        cells: [
          { text: "1003", numeric: true, date: "1902-09-29", num: 1003 },
          { text: "有限会社みどり不動産", numeric: false, date: null, num: null },
          { text: "宅配袋 大", numeric: false, date: null, num: null },
          { text: "46222", numeric: true, date: "2026-07-19", num: 46222 },
          { text: "300", numeric: true, date: "1900-10-26", num: 300 },
          { text: "34", numeric: true, date: "1900-02-03", num: 34 },
          { text: "", numeric: false, date: null, num: null },
        ],
        suspectSubtotal: false,
      },
      {
        line: 5,
        cells: [
          { text: "1004", numeric: true, date: "1902-09-30", num: 1004 },
          { text: "立花写真事務所", numeric: false, date: null, num: null },
          { text: "台紙 A4", numeric: false, date: null, num: null },
          { text: "46227", numeric: true, date: "2026-07-24", num: 46227 },
          { text: "50", numeric: true, date: "1900-02-19", num: 50 },
          { text: "210", numeric: true, date: "1900-07-28", num: 210 },
          { text: "特注色", numeric: false, date: null, num: null },
        ],
        suspectSubtotal: false,
      },
      {
        line: 6,
        cells: [
          { text: "1005", numeric: true, date: "1902-10-01", num: 1005 },
          { text: "合同会社あおば工房", numeric: false, date: null, num: null },
          { text: "ラベルシール", numeric: false, date: null, num: null },
          { text: "46233", numeric: true, date: "2026-07-30", num: 46233 },
          { text: "1000", numeric: true, date: "1902-09-26", num: 1000 },
          { text: "6", numeric: true, date: "1900-01-06", num: 6 },
          { text: "", numeric: false, date: null, num: null },
        ],
        suspectSubtotal: false,
      },
    ],
  },
  {
    id: "f3",
    name: "C社_明細_2026年7月.csv",
    sheetName: "",
    sheetNames: [],
    headerIndex: 0,
    headerLine: 1,
    columns: [
      { index: 0, header: "日付", key: "日付", duplicate: false, samples: ["2026年7月3日", "2026年7月10日", "2026年7月17日"], guessedKind: "date" },
      { index: 1, header: "会社名", key: "会社名", duplicate: false, samples: ["株式会社ミナトデザイン", "株式会社ヒノデ物産", "さくら歯科クリニック"], guessedKind: "text" },
      { index: 2, header: "内容", key: "内容", duplicate: false, samples: ["A4封筒 印刷", "クラフトテープ", "予約カード"], guessedKind: "text" },
      { index: 3, header: "数量", key: "数量", duplicate: false, samples: ["500", "40", "300"], guessedKind: "number" },
      { index: 4, header: "単価", key: "単価", duplicate: false, samples: ["12", "130", "19"], guessedKind: "number" },
      { index: 5, header: "部署", key: "部署", duplicate: false, samples: ["営業一課", "営業二課", "営業一課"], guessedKind: "text" },
      { index: 6, header: "合計", key: "合計", duplicate: false, samples: ["6000", "5200", "5700"], guessedKind: "number" },
    ],
    rows: [
      {
        line: 2,
        cells: [
          { text: "2026年7月3日", numeric: false, date: "2026-07-03", num: null },
          { text: "株式会社ミナトデザイン", numeric: false, date: null, num: null },
          { text: "A4封筒 印刷", numeric: false, date: null, num: null },
          { text: "500", numeric: false, date: null, num: 500 },
          { text: "12", numeric: false, date: null, num: 12 },
          { text: "営業一課", numeric: false, date: null, num: null },
          { text: "6000", numeric: false, date: null, num: 6000 },
        ],
        suspectSubtotal: false,
      },
      {
        line: 3,
        cells: [
          { text: "2026年7月10日", numeric: false, date: "2026-07-10", num: null },
          { text: "株式会社ヒノデ物産", numeric: false, date: null, num: null },
          { text: "クラフトテープ", numeric: false, date: null, num: null },
          { text: "40", numeric: false, date: null, num: 40 },
          { text: "130", numeric: false, date: null, num: 130 },
          { text: "営業二課", numeric: false, date: null, num: null },
          { text: "5200", numeric: false, date: null, num: 5200 },
        ],
        suspectSubtotal: false,
      },
      {
        line: 4,
        cells: [
          { text: "2026年7月17日", numeric: false, date: "2026-07-17", num: null },
          { text: "さくら歯科クリニック", numeric: false, date: null, num: null },
          { text: "予約カード", numeric: false, date: null, num: null },
          { text: "300", numeric: false, date: null, num: 300 },
          { text: "19", numeric: false, date: null, num: 19 },
          { text: "営業一課", numeric: false, date: null, num: null },
          { text: "5700", numeric: false, date: null, num: 5700 },
        ],
        suspectSubtotal: false,
      },
      {
        line: 5,
        cells: [
          { text: "7/21", numeric: false, date: null, num: null },
          { text: "合同会社あおば工房", numeric: false, date: null, num: null },
          { text: "ステッカー", numeric: false, date: null, num: null },
          { text: "200", numeric: false, date: null, num: 200 },
          { text: "45", numeric: false, date: null, num: 45 },
          { text: "営業二課", numeric: false, date: null, num: null },
          { text: "9000", numeric: false, date: null, num: 9000 },
        ],
        suspectSubtotal: false,
      },
      {
        line: 6,
        cells: [
          { text: "2026年7月26日", numeric: false, date: "2026-07-26", num: null },
          { text: "株式会社ミナトデザイン", numeric: false, date: null, num: null },
          { text: "領収書 綴り", numeric: false, date: null, num: null },
          { text: "30", numeric: false, date: null, num: 30 },
          { text: "240", numeric: false, date: null, num: 240 },
          { text: "営業一課", numeric: false, date: null, num: null },
          { text: "7200", numeric: false, date: null, num: 7200 },
        ],
        suspectSubtotal: false,
      },
      {
        line: 7,
        cells: [
          { text: "合計", numeric: false, date: null, num: null },
          { text: "", numeric: false, date: null, num: null },
          { text: "", numeric: false, date: null, num: null },
          { text: "", numeric: false, date: null, num: null },
          { text: "", numeric: false, date: null, num: null },
          { text: "", numeric: false, date: null, num: null },
          { text: "33100", numeric: false, date: "1990-08-15", num: 33100 },
        ],
        suspectSubtotal: true,
      },
    ],
  },
];
