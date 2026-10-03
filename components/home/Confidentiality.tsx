import Link from "next/link";
import type { ReactNode } from "react";
import ScrollReveal from "@/components/animation/ScrollReveal";
import DrawRule from "@/components/animation/DrawRule";
import SectionMark from "@/components/fv/top-body/SectionMark";
import tb from "@/components/fv/top-body/top-body.module.css";
import { confidentialityCopy, confidentialityItems } from "@/data/confidentiality";
import styles from "./Confidentiality.module.css";

/**
 * 04 守秘（CONFIDENTIALITY・#confidentiality）— 2026-10-04 追加。
 *
 * 位置＝03 VALUE（紙）の後・05 PERSON の前。作法は 01 何をする人か（./Who）にそろえる：
 *   章番号（SectionMark）→ h2 → 要約（tb.summary 相当）→ 3列（罫・線画・小ラベル・h3・短文）
 *   → 注記（左に縦罫）＋ /service の全文版への導線（tb.more / tb.moreLink）。
 *
 * 文言はすべて data/confidentiality.ts が正本（このファイルに直書きしない・足さない）。
 * トップは各項目の short を使う（body は /service 用）。
 *
 * 地は暖黒（tb.section × tb.washTop）。**色は使わない**（白・--neutral・--edge と罫だけ。金・朱は不可）。
 * 箱（カード・塗りの板）は作らない＝罫線だけで組む。
 * 動き：ScrollReveal と DrawRule だけ（transform / opacity）。線画のアイコンは静止。
 *   ⚠ ScrollReveal の載る要素に CSS アニメを重ねない。
 */

/** 読点で句に割る（見出しを「〜だから、／守り方を〜」の切れ目で折る・Who／Measured と同じ作法）。
 *  ⚠ 文字は1つも足さない・削らない */
function phrases(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if (ch === "、") {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** 句点で文に割る（PC では要約の2文目を必ず行頭から始める＝「なりま／す。」のような割れを防ぐ。
 *  SP・タブレットは普通に流す＝CSS の .sentence）。⚠ 文字は1つも足さない・削らない */
function sentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if (ch === "。") {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

const HIRA = /[ぁ-ゟ]/;
const PUNCT = /[、。]/;
const KANJI = /[一-鿿々]/;
/** 1字で句を閉じる助詞（この後ろは折ってよい） */
const PARTICLE = /[のをにはがでともへや]/;

/** 見出し用の文節割り（BudouX の簡易版）。返す断片をつなぐと元の文字列に戻る＝文言は不変。
 *  折り目＝①読点・句点の後 ②ひらがなの後に、ひらがな以外が来るところ。
 *  ただし「守り方」「見る仕事」のように、漢字に挟まれた助詞でない1字のひらがな（送り仮名）では折らない。
 *  使い方＝word-break: keep-all ＋ 断片の間に <wbr>（WebKit/Blink/Gecko 共通・Way.tsx と同じ作法） */
function segments(text: string): string[] {
  const chars = Array.from(text);
  const out: string[] = [];
  let buf = "";
  let runLen = 0; // 直前まで続くひらがなの字数
  let beforeRun = ""; // ひらがなの連なりの直前の字
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const prev = i > 0 ? chars[i - 1] : "";
    let cut = false;
    if (prev && PUNCT.test(prev)) cut = true;
    else if (prev && HIRA.test(prev) && !HIRA.test(ch) && !PUNCT.test(ch)) {
      const okurigana =
        runLen === 1 && KANJI.test(beforeRun) && KANJI.test(ch) && !PARTICLE.test(prev);
      cut = !okurigana;
    }
    if (cut && buf) {
      out.push(buf);
      buf = "";
    }
    buf += ch;
    if (HIRA.test(ch)) {
      if (runLen === 0) beforeRun = prev;
      runLen += 1;
    } else {
      runLen = 0;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** 断片の間に <wbr> を挟んで返す（文字は足さない） */
function withBreaks(text: string): ReactNode[] {
  return segments(text).flatMap((s, i) => (i === 0 ? [s] : [<wbr key={`w${i}`} />, s]));
}

/* ---- 線画のアイコン（40px 角・線幅 1.25・塗りなし・currentColor）。静止 ---- */
const ICON_PROPS = {
  width: 40,
  height: 40,
  viewBox: "0 0 40 40",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

const ICONS: Record<string, ReactNode> = {
  /* 01 契約＝角の折れた紙＋2本の行＋右下に丸い印 */
  "01": (
    <svg {...ICON_PROPS}>
      <path d="M10 5.5H24.5L31 12V34.5H10Z" />
      <path d="M24.5 5.5V12H31" />
      <path d="M14.5 17.5H26.5" />
      <path d="M14.5 22.5H22.5" />
      <circle cx="25.5" cy="29" r="2.9" />
    </svg>
  ),
  /* 02 一人＝頭の丸＋肩の弧（肩までのピクト） */
  "02": (
    <svg {...ICON_PROPS}>
      <circle cx="20" cy="13.5" r="6" />
      <path d="M8.5 34C8.5 26.8 13.6 22.8 20 22.8C26.4 22.8 31.5 26.8 31.5 34" />
    </svg>
  ),
  /* 03 オフライン＝ディスプレイ形＋下に抜けたケーブル（プラグが離れている） */
  "03": (
    <svg {...ICON_PROPS}>
      <rect x="5.5" y="4.5" width="29" height="15" rx="1.5" />
      <path d="M20 19.5V23.5" />
      <path d="M17 23.5H23V27H17Z" />
      <path d="M18.6 31.5V33.5M21.4 31.5V33.5" />
      <path d="M16.5 33.5H23.5V36.5H16.5Z" />
      <path d="M20 36.5V39" />
    </svg>
  ),
};

export default function Confidentiality() {
  const c = confidentialityCopy;
  /* 導線の添え書きはトップの作法（「… → /cases」）どおりページの道筋だけを出す
     （#以下は出さない＝SP で 1 行に収める） */
  const morePath = c.more.href.split("#")[0];

  return (
    <section
      id="confidentiality"
      data-top-section="04"
      data-top-label={c.labelEn}
      aria-labelledby="confidentiality-title"
      className={`${tb.section} ${tb.washTop} ${styles.section}`}
    >
      <div className={`${tb.inner} ${styles.inner}`}>
        {/* ====== 頭＝章番号 → 見出し → 要約 ====== */}
        <ScrollReveal>
          <SectionMark no="04" label={c.labelEn} />
        </ScrollReveal>

        <h2 id="confidentiality-title" className={`${tb.h2} ${styles.title}`}>
          {phrases(c.title).map((t, i) => (
            <ScrollReveal as="span" key={`${t}-${i}`} className={tb.phrase} delay={0.14 * i}>
              {withBreaks(t)}
            </ScrollReveal>
          ))}
        </h2>

        <ScrollReveal delay={0.08} className={styles.leadWrap}>
          <p className={`${tb.summary} ${styles.lead}`}>
            {sentences(c.lead).map((t, i) => (
              <span key={`${t}-${i}`} className={styles.sentence}>
                {t}
              </span>
            ))}
          </p>
        </ScrollReveal>

        {/* ====== 3列＝契約で守る／一人で守る／仕組みで守る。箱は作らず罫だけ ====== */}
        <ol className={styles.items}>
          {confidentialityItems.map((it, i) => (
            <ScrollReveal
              as="li"
              key={it.no}
              className={styles.item}
              delay={0.06 + i * 0.08}
            >
              <DrawRule className={styles.itemRule} duration={0.7} delay={0.1 + i * 0.12} />
              <div className={styles.itemHead}>
                <span className={styles.icon}>{ICONS[it.no] ?? null}</span>
                <p className={styles.by}>
                  <span className={styles.byNo}>{it.no}</span>
                  <span className={styles.byText}>{it.by}</span>
                </p>
              </div>
              <h3 className={styles.itemTitle}>{withBreaks(it.title)}</h3>
              <p className={styles.itemShort}>{it.short}</p>
            </ScrollReveal>
          ))}
        </ol>

        {/* ====== 注記（左に縦罫・小さく）＋全文版への導線 ====== */}
        <div className={styles.foot}>
          <ScrollReveal as="p" className={styles.note} delay={0.08}>
            {c.note}
          </ScrollReveal>
          <ScrollReveal as="p" className={`${tb.more} ${styles.more}`} delay={0.14}>
            <Link href={c.more.href} className={tb.moreLink}>
              {c.more.label} → {morePath}
            </Link>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
