/**
 * 請求書PDF一括作成ツール — A4縦の組版
 *
 * ⚠ ここも完全にブラウザ内で動く（設計計画書 §9-2）。ネットワークへは出ない。
 *
 * 使えるウェイトは Noto Sans JP Regular の 1 つだけ。太字が無いので、
 * 強弱は「サイズ・字間・罫線の太さ・黒ベタ地に白抜き」だけで作っている。
 * ページ内で黒ベタを使うのは合計（税込）の 1 か所のみ。ここが視線の終着点。
 *
 * 座標は PDF 既定の左下原点。y が大きいほど上。
 */

import type { PDFImage } from "pdf-lib";

import {
  A4_H,
  A4_W,
  ASC,
  BAND,
  DESC,
  HAIR,
  HAIRLINE,
  INK,
  PAPER,
  RULE,
  SUB,
  Sheet,
  createJpPdf,
  embedDataUrl,
  packPages,
} from "../_shared/pdfKit";
import type { TextStyle } from "../_shared/pdfKit";

/** 検証フックは共通側が持つ。呼び出し側の互換のためここからも出す */
export { __setDrawAuditForTest } from "../_shared/pdfKit";
export type { DrawAudit } from "../_shared/pdfKit";

import type { InvoiceDoc, InvoiceItem, Issuer, TaxLine } from "./types";

/* ------------------------------------------------------------------ *
 * 版面（すべての座標はここから導く。ベタ書きしない）
 * ------------------------------------------------------------------ */

/** A4 縦 */
const PAGE_W = A4_W;
const PAGE_H = A4_H;

const MARGIN_X = 48;
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 52;

const CONTENT_L = MARGIN_X;
const CONTENT_R = PAGE_W - MARGIN_X; // 547.28
const CONTENT_W = CONTENT_R - CONTENT_L; // 499.28
const CONTENT_T = PAGE_H - MARGIN_TOP; // 787.89
const CONTENT_B = MARGIN_BOTTOM; // 52

/** 本文が下りてよい限界（フッターの逃げを含む） */
const BODY_BOTTOM = CONTENT_B + 26;


/* 1) タイトル帯 */
const TITLE_TEXT = "請求書";
const TITLE_CONT_TEXT = "請求書（続き）";
const TITLE_SIZE = 21;
const TITLE_TRACK = 9;
const TITLE_TOP_GAP = 20; // 版面上端からベースラインまで
const TITLE_RULE_GAP = 10; // ベースラインから細罫まで
const TITLE_RULE_PAD = 18; // 罫がテキスト幅から左右へはみ出す量

/* 2) 右上の伝票情報 */
const META_LABEL_SIZE = 8;
const META_VALUE_SIZE = 9.5;
const META_ROW_H = 13;
const META_GAP = 8; // ラベルと値のあいだ

/* 3) 宛先ブロック */
const PARTY_TOP_GAP = 30; // ヘッダー帯からの間隔
const CLIENT_SMALL = 8.5;
const CLIENT_LINE_H = 12.5;
const CLIENT_ADDR_W = 230;
const CLIENT_NAME_SIZE = 14;
const CLIENT_NAME_TRACK = 0.5;
const CLIENT_RULE_W = 255;
const CLIENT_RULE_GAP = 8;
const CLIENT_HONORIFIC_GAP = 4; // 宛名と敬称のあいだ

/* 4) 発行者ブロック */
const ISSUER_NAME_SIZE = 11;
const ISSUER_SMALL = 8.5;
const ISSUER_LINE_H = 12.5;
const ISSUER_WRAP_W = 200;
const ISSUER_WRAP_W_SEAL = 182;
/** タイトルと伝票情報のあいだに必ず空ける幅 */
const META_TITLE_GAP = 24;
const SEAL_SIZE = 48;
const SEAL_GAP = 6; // 角印と本文のあいだ
const LOGO_H = 22;
const LOGO_MAX_W = 160;
const LOGO_GAP = 6;

/* 5) ご請求金額 */
const AMOUNT_TOP_GAP = 30;
const AMOUNT_BAND_W = 300;
const AMOUNT_BAND_H = 44;
const AMOUNT_PAD = 16;
const AMOUNT_LABEL_SIZE = 9;
const AMOUNT_SIZE = 20;
const DUE_GAP = 8;
const DUE_SIZE = 9;

/* 6) 件名 */
const SUBJECT_GAP = 22; // 金額帯の下端から
const SUBJECT_SIZE = 10;
const SUBJECT_LINE_H = 14;

/* 7) 明細表 */
const TABLE_TOP_GAP = 20;
const COL_QTY_W = 48;
const COL_UNIT_W = 36;
const COL_PRICE_W = 84;
const COL_AMOUNT_W = 96;
const COL_NAME_W = CONTENT_W - (COL_QTY_W + COL_UNIT_W + COL_PRICE_W + COL_AMOUNT_W); // 235.28
const CELL_PAD = 8;
const HEAD_H = 24;
const HEAD_SIZE = 8.5;
const HEAD_TRACK = 1;
const ROW_TEXT_SIZE = 9.5;
const ROW_LINE_H = 11;
const ROW_PAD_Y = 6; // 行の上下パディング（11 + 6*2 = 23pt）
const NOTE_SIZE = 8;
const NOTE_LINE_H = 10;
const REDUCED_MARK = "※";

/* 8) 合計ブロック */
const TAIL_TOP_GAP = 26; // 表の下端から
const TOTAL_W = 230;
const TOTAL_ROW_H = 19;
const TOTAL_SIZE = 9.5;
const TOTAL_BAND_H = 32;
const TOTAL_BAND_LABEL = 9.5;
const TOTAL_BAND_VALUE = 15;
const TOTAL_NOTE_GAP = 10;
const TOTAL_NOTE_SIZE = 8;

/* 9) 備考・お振込先 */
const SIDE_W = 250;
const SIDE_HEAD_SIZE = 8.5;
const SIDE_HEAD_GAP = 5; // 見出しの下の罫まで
const SIDE_BODY_SIZE = 9;
const SIDE_BODY_LINE_H = 13;
const SIDE_NOTE_SIZE = 8.5;
const SIDE_NOTE_LINE_H = 12;
const SIDE_NOTE_MAX_LINES = 6;
const SIDE_BLOCK_GAP = 16; // お振込先と備考のあいだ

/* 10) フッター */
const FOOTER_SIZE = 7.5;

/* 表の列 x 位置 */
const X_NAME = CONTENT_L;
const X_QTY = X_NAME + COL_NAME_W;
const X_UNIT = X_QTY + COL_QTY_W;
const X_PRICE = X_UNIT + COL_UNIT_W;
const X_AMOUNT = X_PRICE + COL_PRICE_W;


/* ------------------------------------------------------------------ *
 * 公開 API
 * ------------------------------------------------------------------ */

export interface RenderInvoiceOptions {
  doc: InvoiceDoc;
  issuer: Issuer;
  fontBytes: Uint8Array;
}

/* ------------------------------------------------------------------ *
 * 整形
 * ------------------------------------------------------------------ */

/** 制御文字を落とし、改行を \n に揃える */
function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value).normalize("NFC").replace(/\r\n?/g, "\n");
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x09) {
      out += " ";
      continue;
    }
    if (code < 0x20 && ch !== "\n") continue;
    if (code === 0x7f) continue;
    out += ch;
  }
  return out.trim();
}

/** 1行に収めたい項目用。改行も空白に潰す */
function cleanLine(value: unknown): string {
  return clean(value).replace(/\n+/g, " ").replace(/ {2,}/g, " ").trim();
}

function groupDigits(value: number): string {
  const s = String(Math.abs(value));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** ¥1,234,567 / -¥1,234 */
function formatYen(value: number): string {
  if (!Number.isFinite(value)) return "¥0";
  const rounded = Math.round(value);
  if (rounded === 0) return "¥0";
  return (rounded < 0 ? "-¥" : "¥") + groupDigits(rounded);
}

/** 小数第2位まで。末尾の 0 は落とす */
function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  let s = rounded.toFixed(2);
  if (s.indexOf(".") >= 0) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s;
}

/** YYYY-MM-DD → YYYY年M月D日。読めなければ元の文字列をそのまま返す */
function formatDate(value: string): string {
  const src = cleanLine(value);
  if (!src) return "";
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(src);
  if (!m) return src;
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

/** 10 → 「10%対象」 / 8（軽減） → 「8%対象 ※」 */
function taxLineLabel(line: TaxLine): string {
  if (line.rate === 0) return "非課税・不課税";
  return `${line.rate}%対象${line.reduced ? ` ${REDUCED_MARK}` : ""}`;
}

/** 収録チェックの対象になる、利用者由来の文字列をすべて集める */
function collectUserText(doc: InvoiceDoc, issuer: Issuer): string[] {
  const texts: string[] = [
    doc.invoiceNo,
    doc.issueDate,
    doc.dueDate,
    doc.client.name,
    doc.client.honorific,
    doc.client.zip,
    doc.client.address,
    doc.subject,
    issuer.companyName,
    issuer.registrationNo,
    issuer.zip,
    issuer.address,
    issuer.tel,
    issuer.email,
    issuer.personName,
    issuer.closingNote,
    issuer.bank?.name,
    issuer.bank?.branch,
    issuer.bank?.type,
    issuer.bank?.number,
    issuer.bank?.holder,
  ].map((value) => clean(value));
  for (const item of doc.items) {
    texts.push(clean(item.name), clean(item.unit), clean(item.note));
  }
  for (const note of doc.notes ?? []) texts.push(clean(note));
  return texts;
}

/* ------------------------------------------------------------------ *
 * 事前に組み上げるデータ
 * ------------------------------------------------------------------ */

interface MetaRow {
  label: string;
  value: string;
}

interface RowPlan {
  nameLines: string[];
  reduced: boolean;
  note: string;
  qty: string;
  unit: string;
  price: string;
  amount: string;
  height: number;
}

interface Prepared {
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  clientZip: string;
  clientAddressLines: string[];
  /** 敬称を含まない宛名。敬称は少し離して別に描く */
  clientName: string;
  clientHonorific: string;
  /** 続きページのヘッダー用（敬称込み・1行） */
  clientFullName: string;
  subject: string;
  meta: MetaRow[];
  issuerName: string;
  issuerRegistration: string;
  issuerZip: string;
  issuerAddress: string;
  issuerTel: string;
  issuerEmail: string;
  issuerPerson: string;
  bankLines: string[];
  noteText: string;
  rows: RowPlan[];
  hasReduced: boolean;
}

function planRow(sheet: Sheet, item: InvoiceItem): RowPlan {
  const reduced = item.reduced || item.taxRate === 8;
  const style: TextStyle = { size: ROW_TEXT_SIZE };
  const markW = reduced ? sheet.measure(REDUCED_MARK, style) : 0;
  const nameMax = COL_NAME_W - CELL_PAD * 2 - markW;
  const name = cleanLine(item.name) || "—";
  const nameLines = sheet.wrapClamped(name, style, nameMax, 2);
  const note = sheet.fit(cleanLine(item.note), { size: NOTE_SIZE }, COL_NAME_W - CELL_PAD * 2 - markW);
  const height = nameLines.length * ROW_LINE_H + (note ? NOTE_LINE_H : 0) + ROW_PAD_Y * 2;
  return {
    nameLines: nameLines.length > 0 ? nameLines : ["—"],
    reduced,
    note,
    qty: formatQty(item.quantity),
    unit: sheet.fit(cleanLine(item.unit), style, COL_UNIT_W - 6),
    price: formatYen(item.unitPrice),
    amount: formatYen(item.amount),
    height,
  };
}

function prepare(sheet: Sheet, doc: InvoiceDoc, issuer: Issuer): Prepared {
  const meta: MetaRow[] = [];
  const invoiceNo = cleanLine(doc.invoiceNo);
  const issueDate = formatDate(doc.issueDate);
  const dueDate = formatDate(doc.dueDate);
  if (invoiceNo) meta.push({ label: "請求書番号", value: invoiceNo });
  if (issueDate) meta.push({ label: "発行日", value: issueDate });
  if (dueDate) meta.push({ label: "お支払期日", value: dueDate });

  // 敬称の前は少し空ける（「〇〇株式会社御中」と密着させない）。
  // 空白文字ではなく実寸の空きで開けるので、折り返しで敬称だけが次行へ落ちることもない。
  const clientName = cleanLine(doc.client.name);
  const clientHonorific = cleanLine(doc.client.honorific);
  const clientFullName = [clientName, clientHonorific].filter(Boolean).join(" ");

  const bank = issuer.bank ?? { name: "", branch: "", type: "", number: "", holder: "" };
  const bankLines: string[] = [];
  const bankHead = [cleanLine(bank.name), cleanLine(bank.branch)].filter(Boolean).join("　");
  if (bankHead) bankLines.push(bankHead);
  if (cleanLine(bank.type)) bankLines.push(`種別　${cleanLine(bank.type)}`);
  if (cleanLine(bank.number)) bankLines.push(`口座番号　${cleanLine(bank.number)}`);
  if (cleanLine(bank.holder)) bankLines.push(`名義　${cleanLine(bank.holder)}`);

  // 明細ごとの備考は明細行の中に出しているので、下部の備考欄には重ねない。
  // ここは発行者側の但し書き（振込手数料の扱いなど）だけを載せる。
  const notes: string[] = [];
  const closing = clean(issuer.closingNote);
  if (closing) notes.push(closing);

  const rows = doc.items.map((item) => planRow(sheet, item));

  return {
    invoiceNo,
    issueDate,
    dueDate,
    clientZip: cleanLine(doc.client.zip),
    clientAddressLines: sheet.wrapClamped(clean(doc.client.address), { size: CLIENT_SMALL, color: SUB }, CLIENT_ADDR_W, 3),
    clientName,
    clientHonorific,
    clientFullName,
    subject: cleanLine(doc.subject),
    meta,
    issuerName: cleanLine(issuer.companyName),
    issuerRegistration: cleanLine(issuer.registrationNo),
    issuerZip: cleanLine(issuer.zip),
    issuerAddress: clean(issuer.address),
    issuerTel: cleanLine(issuer.tel),
    issuerEmail: cleanLine(issuer.email),
    issuerPerson: cleanLine(issuer.personName),
    bankLines,
    noteText: notes.join("\n"),
    rows,
    hasReduced: doc.taxLines.some((line) => line.reduced && line.rate === 8),
  };
}

/* ------------------------------------------------------------------ *
 * 各ブロックの描画（戻り値は「描き終えた下端 y」）
 * ------------------------------------------------------------------ */

/** 1) タイトル ＋ 2) 右上の伝票情報 */
function drawHeader(sheet: Sheet, data: Prepared): number {
  const titleStyle: TextStyle = { size: TITLE_SIZE, tracking: TITLE_TRACK };
  const titleBaseline = CONTENT_T - TITLE_TOP_GAP;
  const titleWidth = sheet.measure(TITLE_TEXT, titleStyle);
  const center = CONTENT_L + CONTENT_W / 2;
  sheet.text(TITLE_TEXT, center - titleWidth / 2, titleBaseline, titleStyle);

  const ruleY = titleBaseline - TITLE_RULE_GAP;
  sheet.rule(center - titleWidth / 2 - TITLE_RULE_PAD, center + titleWidth / 2 + TITLE_RULE_PAD, ruleY, RULE, INK);

  const labelStyle: TextStyle = { size: META_LABEL_SIZE, color: SUB };
  const valueStyle: TextStyle = { size: META_VALUE_SIZE };

  let valueMax = 0;
  let labelMax = 0;
  for (const row of data.meta) {
    valueMax = Math.max(valueMax, sheet.measure(row.value, valueStyle));
    labelMax = Math.max(labelMax, sheet.measure(row.label, labelStyle));
  }
  // 番号が長くてもタイトルへ食い込ませない。あふれる分は値の級数を落として吸収する
  const available = CONTENT_R - (center + titleWidth / 2) - META_TITLE_GAP;
  if (labelMax + META_GAP + valueMax > available) {
    valueMax = Math.max(60, available - META_GAP - labelMax);
  }
  const valueRight = CONTENT_R;
  const labelRight = valueRight - valueMax - META_GAP;

  let baseline = CONTENT_T - 8;
  let metaBottom = ruleY;
  for (const row of data.meta) {
    sheet.textRight(sheet.fit(row.label, labelStyle, labelMax), labelRight, baseline, labelStyle);
    sheet.numberRight(row.value, valueRight, baseline, valueStyle, valueMax + 0.01);
    metaBottom = Math.min(metaBottom, baseline - META_VALUE_SIZE * DESC);
    baseline -= META_ROW_H;
  }

  return Math.min(ruleY - RULE, metaBottom);
}

/** 2ページ目以降の簡易ヘッダー */
function drawContinuationHeader(sheet: Sheet, data: Prepared): number {
  const titleStyle: TextStyle = { size: 12, tracking: 2 };
  const titleBaseline = sheet.baselineFromTop(CONTENT_T, 12);
  sheet.text(TITLE_CONT_TEXT, CONTENT_L, titleBaseline, titleStyle);

  const small: TextStyle = { size: 8.5, color: SUB };
  let baseline = sheet.baselineFromTop(CONTENT_T, 8.5);
  const lines = [
    data.invoiceNo ? `請求書番号　${data.invoiceNo}` : "",
    data.clientFullName,
  ].filter(Boolean);
  for (const line of lines) {
    sheet.textRight(sheet.fit(line, small, CONTENT_W * 0.55), CONTENT_R, baseline, small);
    baseline -= 12;
  }

  const bottom = Math.min(titleBaseline - 12 * DESC, baseline + 12 - 8.5 * DESC) - 10;
  sheet.rule(CONTENT_L, CONTENT_R, bottom, HAIR, HAIRLINE);
  return bottom - RULE;
}

/** 3) 宛先ブロック ＋ 4) 発行者ブロック */
function drawParties(
  sheet: Sheet,
  data: Prepared,
  top: number,
  seal: PDFImage | null,
  logo: PDFImage | null,
): number {
  /* --- 左：宛先 --- */
  const small: TextStyle = { size: CLIENT_SMALL, color: SUB };
  let y = top;

  if (data.clientZip) {
    sheet.text(sheet.fit(`〒${data.clientZip.replace(/^〒/, "")}`, small, CLIENT_ADDR_W), CONTENT_L, sheet.baselineFromTop(y, CLIENT_SMALL), small);
    y -= CLIENT_LINE_H;
  }
  for (const line of data.clientAddressLines) {
    sheet.text(line, CONTENT_L, sheet.baselineFromTop(y, CLIENT_SMALL), small);
    y -= CLIENT_LINE_H;
  }

  y -= CLIENT_LINE_H * 0.6; // 1行ぶんの間を空ける（詰めすぎない）

  const nameStyle: TextStyle = { size: CLIENT_NAME_SIZE, tracking: CLIENT_NAME_TRACK };
  const nameMax = CLIENT_RULE_W - 2;
  const honorific = data.clientHonorific;
  const honorificW = honorific ? CLIENT_HONORIFIC_GAP + sheet.measure(honorific, nameStyle) : 0;
  const clientNameText = data.clientName || "—";
  let nameLines = sheet.wrapClamped(clientNameText, nameStyle, nameMax, 2);
  // 敬称は必ず宛名の最終行へ添える。載らないときだけ宛名側の折り返し幅を詰める
  if (honorificW > 0 && nameMax - honorificW > 40) {
    const last = nameLines[nameLines.length - 1] ?? "";
    if (sheet.measure(last, nameStyle) + honorificW > nameMax) {
      nameLines = sheet.wrapClamped(clientNameText, nameStyle, nameMax - honorificW, 2);
    }
  }
  for (let i = 0; i < nameLines.length; i += 1) {
    const baseline = sheet.baselineFromTop(y, CLIENT_NAME_SIZE);
    const drawn = sheet.text(nameLines[i], CONTENT_L, baseline, nameStyle);
    if (honorific && i === nameLines.length - 1) {
      sheet.text(honorific, CONTENT_L + drawn + CLIENT_HONORIFIC_GAP, baseline, nameStyle);
    }
    y -= CLIENT_NAME_SIZE * (ASC + DESC) + 3;
  }
  const clientRuleY = y - CLIENT_RULE_GAP + 3;
  sheet.rule(CONTENT_L, CONTENT_L + CLIENT_RULE_W, clientRuleY, RULE, INK);
  const clientBottom = clientRuleY - RULE;

  /* --- 右：発行者 --- */
  const textRight = seal ? CONTENT_R - SEAL_SIZE - SEAL_GAP : CONTENT_R;
  const wrapW = seal ? ISSUER_WRAP_W_SEAL : ISSUER_WRAP_W;
  const issuerSmall: TextStyle = { size: ISSUER_SMALL, color: SUB };
  let iy = top;

  if (logo) {
    const scale = LOGO_H / logo.height;
    const w = Math.min(LOGO_MAX_W, logo.width * scale);
    const h = logo.height * (w / logo.width);
    sheet.image(logo, textRight - w, iy - h, w, h);
    iy -= h + LOGO_GAP;
  }

  const issuerNameStyle: TextStyle = { size: ISSUER_NAME_SIZE };
  const issuerNameLines = sheet.wrapClamped(data.issuerName || "—", issuerNameStyle, wrapW, 2);
  const nameTop = iy;
  for (const line of issuerNameLines) {
    sheet.textRight(line, textRight, sheet.baselineFromTop(iy, ISSUER_NAME_SIZE), issuerNameStyle);
    iy -= ISSUER_NAME_SIZE * (ASC + DESC) + 2;
  }
  iy -= 3;

  const issuerLines: string[] = [];
  if (data.issuerRegistration) {
    const reg = data.issuerRegistration.replace(/^登録番号[\s　]*/, "");
    issuerLines.push(`登録番号　${reg}`);
  }
  const addrHead = data.issuerZip ? `〒${data.issuerZip.replace(/^〒/, "")}　` : "";
  if (addrHead || data.issuerAddress) issuerLines.push(`${addrHead}${data.issuerAddress}`);
  const contact = [data.issuerTel ? `TEL ${data.issuerTel}` : "", data.issuerEmail].filter(Boolean);
  for (const line of contact) issuerLines.push(line);
  if (data.issuerPerson) issuerLines.push(`担当　${data.issuerPerson}`);

  for (const raw of issuerLines) {
    for (const line of sheet.wrapClamped(raw, issuerSmall, wrapW, 3)) {
      sheet.textRight(line, textRight, sheet.baselineFromTop(iy, ISSUER_SMALL), issuerSmall);
      iy -= ISSUER_LINE_H;
    }
  }

  if (seal) {
    // 会社名の右どなり。版面の右端にぴたりと合わせ、1pt もはみ出させない
    const sealTop = Math.min(nameTop + 4, CONTENT_T);
    sheet.image(seal, CONTENT_R - SEAL_SIZE, sealTop - SEAL_SIZE, SEAL_SIZE, SEAL_SIZE);
    iy = Math.min(iy, sealTop - SEAL_SIZE);
  }

  return Math.min(clientBottom, iy);
}

/** 5) ご請求金額 ＋ 6) 件名 */
function drawAmount(sheet: Sheet, doc: InvoiceDoc, data: Prepared, top: number): number {
  const bandTop = top;
  const bandBottom = bandTop - AMOUNT_BAND_H;
  sheet.rect(CONTENT_L, bandBottom, AMOUNT_BAND_W, AMOUNT_BAND_H, BAND);
  sheet.rule(CONTENT_L, CONTENT_L + AMOUNT_BAND_W, bandTop, RULE, INK);
  sheet.rule(CONTENT_L, CONTENT_L + AMOUNT_BAND_W, bandBottom, RULE, INK);

  const center = bandBottom + AMOUNT_BAND_H / 2;
  const labelStyle: TextStyle = { size: AMOUNT_LABEL_SIZE, color: SUB };
  const label = "ご請求金額（税込）";
  const labelW = sheet.measure(label, labelStyle);
  sheet.text(label, CONTENT_L + AMOUNT_PAD, sheet.baselineFromCenter(center, AMOUNT_LABEL_SIZE), labelStyle);

  const amountMax = AMOUNT_BAND_W - AMOUNT_PAD * 2 - labelW - 12;
  sheet.numberRight(
    formatYen(doc.total),
    CONTENT_L + AMOUNT_BAND_W - AMOUNT_PAD,
    sheet.baselineFromCenter(center, AMOUNT_SIZE),
    { size: AMOUNT_SIZE },
    amountMax,
  );

  let y = bandBottom;

  if (data.dueDate) {
    const dueStyle: TextStyle = { size: DUE_SIZE, color: SUB };
    const baseline = sheet.baselineFromTop(y - DUE_GAP, DUE_SIZE);
    sheet.text(sheet.fit(`お支払期日：${data.dueDate}`, dueStyle, CONTENT_W), CONTENT_L, baseline, dueStyle);
    y = baseline - DUE_SIZE * DESC;
  }

  if (data.subject) {
    const subjectStyle: TextStyle = { size: SUBJECT_SIZE };
    const head = "件名：";
    const headW = sheet.measure(head, subjectStyle);
    const top2 = Math.min(bandBottom - SUBJECT_GAP, y - 12);
    const lines = sheet.wrapClamped(data.subject, subjectStyle, CONTENT_W - headW, 2);
    let sy = top2;
    for (let i = 0; i < lines.length; i += 1) {
      const baseline = sheet.baselineFromTop(sy, SUBJECT_SIZE);
      if (i === 0) sheet.text(head, CONTENT_L, baseline, subjectStyle);
      sheet.text(lines[i], CONTENT_L + headW, baseline, subjectStyle);
      sy -= SUBJECT_LINE_H;
    }
    y = sy + SUBJECT_LINE_H - SUBJECT_SIZE * DESC;
  }

  return y;
}

/** 7) 明細表の見出し行。戻り値は見出し行の下端 */
function drawTableHead(sheet: Sheet, top: number): number {
  const bottom = top - HEAD_H;
  sheet.rect(CONTENT_L, bottom, CONTENT_W, HEAD_H, BAND);
  sheet.rule(CONTENT_L, CONTENT_R, top, RULE, INK);
  sheet.rule(CONTENT_L, CONTENT_R, bottom, RULE, INK);

  const style: TextStyle = { size: HEAD_SIZE, color: SUB, tracking: HEAD_TRACK };
  const baseline = sheet.baselineFromCenter(bottom + HEAD_H / 2, HEAD_SIZE);
  sheet.text("品目", X_NAME + CELL_PAD, baseline, style);
  sheet.textRight("数量", X_QTY + COL_QTY_W - CELL_PAD, baseline, style);
  sheet.textCenter("単位", X_UNIT + COL_UNIT_W / 2, baseline, style);
  sheet.textRight("単価", X_PRICE + COL_PRICE_W - CELL_PAD, baseline, style);
  sheet.textRight("金額", X_AMOUNT + COL_AMOUNT_W - CELL_PAD, baseline, style);
  return bottom;
}

/** 明細 1 行。戻り値は行の下端 */
function drawRow(sheet: Sheet, row: RowPlan, top: number, lastOnPage: boolean): number {
  const bottom = top - row.height;
  const style: TextStyle = { size: ROW_TEXT_SIZE };
  const markW = row.reduced ? sheet.measure(REDUCED_MARK, style) : 0;
  const nameX = X_NAME + CELL_PAD + markW;

  let lineTop = top - ROW_PAD_Y;
  let firstBaseline = 0;
  for (let i = 0; i < row.nameLines.length; i += 1) {
    const baseline = sheet.baselineFromCenter(lineTop - ROW_LINE_H / 2, ROW_TEXT_SIZE);
    if (i === 0) {
      firstBaseline = baseline;
      if (row.reduced) sheet.text(REDUCED_MARK, X_NAME + CELL_PAD, baseline, style);
    }
    sheet.text(row.nameLines[i], nameX, baseline, style);
    lineTop -= ROW_LINE_H;
  }

  if (row.note) {
    const noteStyle: TextStyle = { size: NOTE_SIZE, color: SUB };
    sheet.text(row.note, nameX, sheet.baselineFromCenter(lineTop - NOTE_LINE_H / 2, NOTE_SIZE), noteStyle);
  }

  sheet.numberRight(row.qty, X_QTY + COL_QTY_W - CELL_PAD, firstBaseline, style, COL_QTY_W - CELL_PAD - 4);
  if (row.unit) {
    const unitW = sheet.measure(row.unit, style);
    sheet.text(row.unit, X_UNIT + (COL_UNIT_W - unitW) / 2, firstBaseline, style);
  }
  sheet.numberRight(row.price, X_PRICE + COL_PRICE_W - CELL_PAD, firstBaseline, style, COL_PRICE_W - CELL_PAD * 2);
  sheet.numberRight(row.amount, X_AMOUNT + COL_AMOUNT_W - CELL_PAD, firstBaseline, style, COL_AMOUNT_W - CELL_PAD * 2);

  if (!lastOnPage) sheet.rule(CONTENT_L, CONTENT_R, bottom, HAIR, HAIRLINE);
  return bottom;
}

/** 8) 合計ブロック。戻り値は下端 */
function drawTotals(sheet: Sheet, doc: InvoiceDoc, data: Prepared, top: number): number {
  const left = CONTENT_R - TOTAL_W;
  const labelStyle: TextStyle = { size: TOTAL_SIZE, color: SUB };
  const valueStyle: TextStyle = { size: TOTAL_SIZE };
  const valueRight = CONTENT_R - CELL_PAD;
  const labelX = left + CELL_PAD;

  const rows: MetaRow[] = [{ label: "小計（税抜）", value: formatYen(doc.subtotal) }];
  for (const line of doc.taxLines) {
    rows.push({ label: taxLineLabel(line), value: formatYen(line.taxable) });
    rows.push({ label: "消費税", value: formatYen(line.tax) });
  }
  // 課税対象の税率が1つだけなら「消費税」と「消費税　合計」が同額で2行並ぶだけなので出さない
  if (doc.taxLines.filter((line) => line.rate !== 0).length > 1) {
    rows.push({ label: "消費税　合計", value: formatYen(doc.taxTotal) });
  }

  // 値の実測幅から欄を割る。金額が短ければラベルに余裕が回る
  const inner = TOTAL_W - CELL_PAD * 2;
  let widest = 0;
  for (const row of rows) widest = Math.max(widest, sheet.measure(row.value, valueStyle));
  const valueMax = Math.min(Math.max(widest, 44), inner - 52);
  const labelMax = inner - valueMax - 10;

  let y = top;
  for (const row of rows) {
    const center = y - TOTAL_ROW_H / 2;
    const baseline = sheet.baselineFromCenter(center, TOTAL_SIZE);
    sheet.text(sheet.fit(row.label, labelStyle, labelMax), labelX, baseline, labelStyle);
    sheet.numberRight(row.value, valueRight, baseline, valueStyle, valueMax);
    y -= TOTAL_ROW_H;
    sheet.rule(left, CONTENT_R, y, HAIR, HAIRLINE);
  }

  // ページ内で唯一の黒ベタ。ここが視線の終着点
  const bandBottom = y - TOTAL_BAND_H;
  sheet.rect(left, bandBottom, TOTAL_W, TOTAL_BAND_H, INK);
  const bandCenter = bandBottom + TOTAL_BAND_H / 2;
  const bandLabelStyle: TextStyle = { size: TOTAL_BAND_LABEL, color: PAPER, tracking: 0.5 };
  const bandLabel = "合計（税込）";
  const bandLabelW = sheet.measure(bandLabel, bandLabelStyle);
  sheet.text(bandLabel, labelX, sheet.baselineFromCenter(bandCenter, TOTAL_BAND_LABEL), bandLabelStyle);
  sheet.numberRight(
    formatYen(doc.total),
    valueRight,
    sheet.baselineFromCenter(bandCenter, TOTAL_BAND_VALUE),
    { size: TOTAL_BAND_VALUE, color: PAPER },
    TOTAL_W - CELL_PAD * 2 - bandLabelW - 10,
  );

  let bottom = bandBottom;
  if (data.hasReduced) {
    const noteStyle: TextStyle = { size: TOTAL_NOTE_SIZE, color: SUB };
    const baseline = sheet.baselineFromTop(bandBottom - TOTAL_NOTE_GAP, TOTAL_NOTE_SIZE);
    sheet.textRight(`${REDUCED_MARK}印は軽減税率（8%）対象`, CONTENT_R, baseline, noteStyle);
    bottom = baseline - TOTAL_NOTE_SIZE * DESC;
  }
  return bottom;
}

/** 9) お振込先・備考。戻り値は下端 */
function drawSideNotes(sheet: Sheet, data: Prepared, top: number): number {
  let y = top;
  const headStyle: TextStyle = { size: SIDE_HEAD_SIZE, color: SUB, tracking: 0.8 };
  const bodyStyle: TextStyle = { size: SIDE_BODY_SIZE };
  const noteStyle: TextStyle = { size: SIDE_NOTE_SIZE, color: SUB };

  const section = (title: string): void => {
    sheet.text(title, CONTENT_L, sheet.baselineFromTop(y, SIDE_HEAD_SIZE), headStyle);
    const ruleY = y - SIDE_HEAD_SIZE * (ASC + DESC) - SIDE_HEAD_GAP;
    sheet.rule(CONTENT_L, CONTENT_L + SIDE_W, ruleY, HAIR, HAIRLINE);
    y = ruleY - 9;
  };

  if (data.bankLines.length > 0) {
    section("お振込先");
    for (const line of data.bankLines) {
      sheet.text(sheet.fit(line, bodyStyle, SIDE_W), CONTENT_L, sheet.baselineFromTop(y, SIDE_BODY_SIZE), bodyStyle);
      y -= SIDE_BODY_LINE_H;
    }
    y += SIDE_BODY_LINE_H - SIDE_BODY_SIZE * (ASC + DESC);
  }

  if (data.noteText) {
    if (data.bankLines.length > 0) y -= SIDE_BLOCK_GAP;
    section("備考");
    const lines = sheet.wrapClamped(data.noteText, noteStyle, SIDE_W, SIDE_NOTE_MAX_LINES);
    for (const line of lines) {
      sheet.text(line, CONTENT_L, sheet.baselineFromTop(y, SIDE_NOTE_SIZE), noteStyle);
      y -= SIDE_NOTE_LINE_H;
    }
    y += SIDE_NOTE_LINE_H - SIDE_NOTE_SIZE * (ASC + DESC);
  }

  return y;
}

/** 10) フッター */
function drawFooter(sheet: Sheet, data: Prepared, pageNo: number, pageCount: number): void {
  const style: TextStyle = { size: FOOTER_SIZE, color: SUB };
  const baseline = CONTENT_B + FOOTER_SIZE * DESC;
  if (data.issuerName) {
    sheet.text(sheet.fit(data.issuerName, style, CONTENT_W - 60), CONTENT_L, baseline, style);
  }
  if (pageCount > 1) {
    sheet.textRight(`${pageNo} / ${pageCount}`, CONTENT_R, baseline, style);
  }
}

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */

export async function renderInvoicePdf(options: RenderInvoiceOptions): Promise<Uint8Array> {
  const { doc, issuer, fontBytes } = options;

  // 豆腐チェック → 当て木 → subset 判定 → embedFont の順序は _shared/pdfKit が持つ
  const { pdf, sheet } = await createJpPdf({
    fontBytes,
    texts: collectUserText(doc, issuer),
    title: `請求書 ${cleanLine(doc.invoiceNo)}`.trim(),
    producer: "AKASHIKI Tools (akashiki.com) — © 灯敷 / SUMIYAKA. Proprietary. https://akashiki.com/tools/terms",
    creator: "AKASHIKI Tools — 請求書PDF 一括作成",
  });

  const seal = await embedDataUrl(pdf, issuer.sealDataUrl);
  const logo = await embedDataUrl(pdf, issuer.logoDataUrl);

  const data = prepare(sheet, doc, issuer);

  /* --- 下書き測定（target = null なので何も描かれない） --- */
  sheet.target = null;

  const headerBottom = drawHeader(sheet, data);
  const partiesBottom = drawParties(sheet, data, headerBottom - PARTY_TOP_GAP, seal, logo);
  const amountBottom = drawAmount(sheet, doc, data, partiesBottom - AMOUNT_TOP_GAP);
  const firstTableTop = amountBottom - TABLE_TOP_GAP;
  const contTableTop = drawContinuationHeader(sheet, data) - TABLE_TOP_GAP;

  const probeTop = 700;
  const totalsBottom = drawTotals(sheet, doc, data, probeTop);
  const sideBottom = drawSideNotes(sheet, data, probeTop);
  const tailHeight = probeTop - Math.min(totalsBottom, sideBottom);

  /* --- ページ割り。合計ブロックは必ず最終ページへ --- */
  const packOpts = {
    rows: data.rows,
    firstTop: firstTableTop,
    contTop: contTableTop,
    bodyBottom: BODY_BOTTOM,
    headHeight: HEAD_H,
    tailGap: TAIL_TOP_GAP,
    tailHeight,
  };
  let plan = packPages({ ...packOpts, reserveTailOn: -1 });
  for (let guard = 0; guard <= data.rows.length + 2; guard += 1) {
    const lastIdx = plan.length - 1;
    const next = packPages({ ...packOpts, reserveTailOn: lastIdx });
    if (next.length === plan.length) {
      plan = next;
      break;
    }
    plan = next;
  }
  const pageCount = plan.length;

  /* --- 本番描画 --- */
  for (let p = 0; p < pageCount; p += 1) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    sheet.target = page;
    sheet.pageNo = p + 1;

    let tableTop: number;
    if (p === 0) {
      const hb = drawHeader(sheet, data);
      const pb = drawParties(sheet, data, hb - PARTY_TOP_GAP, seal, logo);
      const ab = drawAmount(sheet, doc, data, pb - AMOUNT_TOP_GAP);
      tableTop = ab - TABLE_TOP_GAP;
    } else {
      tableTop = drawContinuationHeader(sheet, data) - TABLE_TOP_GAP;
    }

    let y = drawTableHead(sheet, tableTop);
    const rowIndexes = plan[p].rowIndexes;
    for (let i = 0; i < rowIndexes.length; i += 1) {
      y = drawRow(sheet, data.rows[rowIndexes[i]], y, i === rowIndexes.length - 1);
    }
    sheet.rule(CONTENT_L, CONTENT_R, y, RULE, INK);

    if (p === pageCount - 1) {
      const tailTop = y - TAIL_TOP_GAP;
      drawTotals(sheet, doc, data, tailTop);
      drawSideNotes(sheet, data, tailTop);
    }

    drawFooter(sheet, data, p + 1, pageCount);
  }

  sheet.target = null;
  return pdf.save();
}
