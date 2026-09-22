"use client";

import type { InvoiceDoc, InvoiceItem, Issuer } from "@/lib/tools/invoice/types";
import { formatDateJa, formatQty, formatYen } from "@/lib/tools/_shared/format";
import styles from "./InvoicePaper.module.css";

/**
 * A4（210×297mm）の請求書プレビュー。
 *
 * PDF側（lib/tools/invoice/pdf.ts）と同じ版面設計を、pt を単位に再現している。
 * CSS 側で 1pt = var(--pt) と定義し、すべての寸法を calc() で pt から起こす。
 * ＝ PDFの数値をそのまま持ち込めるので、画面と紙が食い違わない。
 *
 * ⚠ プレビューは常に「1ページ目」だけを描く。
 *    明細が入りきらない場合は末尾に残数を注記する（PDFには全件が入る）。
 *    紙が伸び縮みしないほうが、見え方が安定するため。
 */

/** 1ページ目に載る明細の目安行数（版面から逆算した固定値） */
const PREVIEW_ROW_CAPACITY = 11;
/** 品目が2行に折り返すとみなす、おおよその文字数（品目列 235pt ÷ 全角 9.5pt） */
const ITEM_CHARS_PER_LINE = 24;

interface InvoicePaperProps {
  doc: InvoiceDoc;
  issuer: Issuer;
  className?: string;
}

/** 全角を1、半角を0.5として概算の文字数を数える */
function visualLength(text: string): number {
  let len = 0;
  for (const ch of text) {
    len += /[ -~｡-ﾟ]/.test(ch) ? 0.5 : 1;
  }
  return len;
}

export default function InvoicePaper({
  doc,
  issuer,
  className = "",
}: InvoicePaperProps) {
  // 折り返す品目は2行分として数え、1ページに載る件数を決める
  const visible: InvoiceItem[] = [];
  let used = 0;
  for (const item of doc.items) {
    const lines =
      visualLength(item.name) > ITEM_CHARS_PER_LINE || item.note ? 2 : 1;
    if (used + lines > PREVIEW_ROW_CAPACITY) break;
    used += lines;
    visible.push(item);
  }
  const hiddenCount = doc.items.length - visible.length;
  const hasReduced = doc.taxLines.some((line) => line.reduced);

  return (
    <div className={`${styles.paper} ${className}`} data-invoice-paper>
      <div className={styles.sheet}>
        {/* ---- タイトル ---- */}
        <div className={styles.titleWrap}>
          <h3 className={styles.title}>請求書</h3>
          <span className={styles.titleRule} aria-hidden="true" />
        </div>

        {/* ---- 伝票情報（右上） ---- */}
        <dl className={styles.meta}>
          <div className={styles.metaRow}>
            <dt>請求書番号</dt>
            <dd>{doc.invoiceNo}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>発行日</dt>
            <dd>{formatDateJa(doc.issueDate)}</dd>
          </div>
          {doc.dueDate ? (
            <div className={styles.metaRow}>
              <dt>お支払期日</dt>
              <dd>{formatDateJa(doc.dueDate)}</dd>
            </div>
          ) : null}
        </dl>

        {/* ---- 宛先／発行者 ---- */}
        <div className={styles.parties}>
          <div className={styles.client}>
            {doc.client.zip ? (
              <p className={styles.clientSub}>〒{doc.client.zip}</p>
            ) : null}
            {doc.client.address ? (
              <p className={styles.clientSub}>{doc.client.address}</p>
            ) : null}
            <p className={styles.clientName}>
              {doc.client.name}
              <span className={styles.clientHonorific}>
                {doc.client.honorific}
              </span>
            </p>
            <span className={styles.clientRule} aria-hidden="true" />
          </div>

          <div className={styles.issuer}>
            {issuer.logoDataUrl ? (
              // data URL のためレイアウトのみ CSS で固定する
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={issuer.logoDataUrl}
                alt=""
                aria-hidden="true"
                className={styles.issuerLogo}
              />
            ) : null}
            <p className={styles.issuerName}>{issuer.companyName}</p>
            {issuer.registrationNo ? (
              <p className={styles.issuerSub}>登録番号 {issuer.registrationNo}</p>
            ) : null}
            {issuer.zip ? <p className={styles.issuerSub}>〒{issuer.zip}</p> : null}
            {issuer.address ? (
              <p className={styles.issuerSub}>{issuer.address}</p>
            ) : null}
            {issuer.tel ? <p className={styles.issuerSub}>TEL {issuer.tel}</p> : null}
            {issuer.email ? (
              <p className={styles.issuerSub}>{issuer.email}</p>
            ) : null}
            {issuer.personName ? (
              <p className={styles.issuerSub}>担当 {issuer.personName}</p>
            ) : null}
            {issuer.sealDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={issuer.sealDataUrl}
                alt=""
                aria-hidden="true"
                className={styles.issuerSeal}
              />
            ) : null}
          </div>
        </div>

        {/* ---- ご請求金額 ---- */}
        <div className={styles.amountBand}>
          <span className={styles.amountLabel}>ご請求金額（税込）</span>
          <span className={styles.amountValue}>{formatYen(doc.total)}</span>
        </div>
        {doc.dueDate ? (
          <p className={styles.amountDue}>
            お支払期日：{formatDateJa(doc.dueDate)}
          </p>
        ) : null}

        {/* ---- 件名 ---- */}
        {doc.subject ? (
          <p className={styles.subject}>件名：{doc.subject}</p>
        ) : null}

        {/* ---- 明細 ---- */}
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colItem}>品目</th>
              <th className={styles.colQty}>数量</th>
              <th className={styles.colUnit}>単位</th>
              <th className={styles.colPrice}>単価</th>
              <th className={styles.colAmount}>金額</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item, i) => (
              <tr key={`${item.name}-${i}`}>
                <td className={styles.colItem}>
                  <span className={styles.itemName}>
                    {item.reduced ? "※" : ""}
                    {item.name}
                  </span>
                  {item.note ? (
                    <span className={styles.itemNote}>{item.note}</span>
                  ) : null}
                </td>
                <td className={styles.colQty}>{formatQty(item.quantity)}</td>
                <td className={styles.colUnit}>{item.unit}</td>
                <td className={styles.colPrice}>{formatYen(item.unitPrice)}</td>
                <td className={styles.colAmount}>{formatYen(item.amount)}</td>
              </tr>
            ))}
            {hiddenCount > 0 ? (
              <tr className={styles.moreRow}>
                <td colSpan={5}>
                  ほか{hiddenCount}行（PDFには全件が入ります）
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {/* ---- 下段：振込先・備考 ／ 合計 ---- */}
        <div className={styles.footRow}>
          <div className={styles.footLeft}>
            {issuer.bank.name || issuer.bank.number ? (
              <section className={styles.footBlock}>
                <h4 className={styles.footHead}>お振込先</h4>
                <p className={styles.footText}>
                  {issuer.bank.name} {issuer.bank.branch}
                </p>
                <p className={styles.footText}>
                  {issuer.bank.type} {issuer.bank.number}
                </p>
                <p className={styles.footText}>{issuer.bank.holder}</p>
              </section>
            ) : null}
            {/* 明細ごとの備考は表の中に出しているので、ここには重ねない。
                この欄は発行者側の但し書き（振込手数料の扱いなど）だけを載せる */}
            {issuer.closingNote ? (
              <section className={styles.footBlock}>
                <h4 className={styles.footHead}>備考</h4>
                <p className={styles.footText}>{issuer.closingNote}</p>
              </section>
            ) : null}
          </div>

          <div className={styles.totals}>
            <div className={styles.totalRow}>
              <span>小計（税抜）</span>
              <span>{formatYen(doc.subtotal)}</span>
            </div>
            {/* 税率ごとに「対象額 → 消費税」を対にして積む（PDF側と同じ並び）。
                適格請求書の記載要件 ④⑤ をこの2行で満たす */}
            {doc.taxLines.map((line) => (
              <div key={line.rate}>
                <div className={styles.totalRow}>
                  <span>
                    {line.rate === 0 ? "対象外" : `${line.rate}%対象`}
                    {line.reduced ? " ※" : ""}
                  </span>
                  <span>{formatYen(line.taxable)}</span>
                </div>
                {line.rate !== 0 ? (
                  <div className={styles.totalRow}>
                    <span>消費税</span>
                    <span>{formatYen(line.tax)}</span>
                  </div>
                ) : null}
              </div>
            ))}
            {doc.taxLines.filter((line) => line.rate !== 0).length > 1 ? (
              <div className={styles.totalRow}>
                <span>消費税　合計</span>
                <span>{formatYen(doc.taxTotal)}</span>
              </div>
            ) : null}
            <div className={styles.grandRow}>
              <span>合計（税込）</span>
              <span className={styles.grandValue}>{formatYen(doc.total)}</span>
            </div>
            {hasReduced ? (
              <p className={styles.reducedNote}>※印は軽減税率（8%）対象</p>
            ) : null}
          </div>
        </div>

        <p className={styles.sheetFooter}>{issuer.companyName}</p>
      </div>
    </div>
  );
}
