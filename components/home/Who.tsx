import Image from "next/image";
import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import DrawRule from "@/components/animation/DrawRule";
import CountUp from "@/components/animation/CountUp";
import SectionMark from "@/components/fv/top-body/SectionMark";
import tb from "@/components/fv/top-body/top-body.module.css";
import { whoCopy } from "@/data/pillars";
import { getFdeIntro } from "@/lib/caseCatalog";
import { getPillars } from "@/lib/pillarCatalog";
import styles from "./Who.module.css";

/**
 * 01 何をする人か（WHAT I DO・#who）— **P17「トップのハブ化」(2026-09-20)**。
 *
 * FV の「その意味を、見る」の飛び先（Hero の #who）。トップで最初に読ませる章で、
 * FDE を知らない人・先入観のある人に「何をする人か」を1章で通す。
 *
 * 文言はすべて契約ファイル由来（このファイルに直書きしない）：
 *   ・FDE の説明・3段・結びの一文 … lib/caseCatalog.ts の getFdeIntro()
 *   ・ラベル／しないこと／3本柱の前置き … data/pillars.ts の whoCopy
 *   ・3本柱（数字・代表画像） … lib/pillarCatalog.ts の getPillars()
 *
 * 型（P12 の語彙をそのまま使う）：
 *   [帖1] 章番号 → h2 → 説明（大きく）→ 仕事の3段 → しないこと1行 → **結論の大キャッチ**
 *   [帖2] 前置き → 3本柱のタイル（同じ型・画像＋数字＋1行＋導線）
 * 地：暖黒 × 灯（左上の暈）。**色は使わない**（朱は 02 実測の1点だけ）。
 * 動き：既存の部品だけ（ScrollReveal／DrawRule／CountUp）。新しい機構は増やさない。
 *   ⚠ ホバーは ScrollReveal の載る <li> ではなく内側の <a> に当てる
 *     （同じ要素に重ねると GSAP の transform と食い合う）。
 *   ⚠ 画像の墨明けは「静的 grayscale の下地＋カラーの opacity クロスフェード」。
 *     filter はアニメさせない（iOS/WebKit で滲みが残る事故を踏まない＝PickUpWorks と同じ作法）。
 */

/** 読点で句に割る（行末に「。」だけが残るのを防ぐ・Atari／Way と同じ作法）。
 *  ⚠ 文字は1つも足さない・削らない＝契約ファイルの文言のまま折り返し位置だけを作る */
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

const fdeIntro = getFdeIntro();

/** サムネは 16:10 の枠に cover。PC は3列（inner 1120 − 余白）＝おおよそ 300px */
const TILE_SIZES = "(max-width: 767px) 92vw, (max-width: 1119px) 30vw, 320px";

export default function Who() {
  const pillars = getPillars();

  return (
    <section
      id="who"
      data-top-section="01"
      data-top-label={whoCopy.labelEn}
      className={`${tb.section} ${tb.washTop} ${styles.section}`}
    >
      {/* ============ 帖1＝FDEとは（説明 → 3段 → しないこと → 結論） ============ */}
      <div className={`${tb.inner} ${styles.introBand}`}>
        <ScrollReveal>
          <SectionMark no="01" label={whoCopy.labelEn} />
        </ScrollReveal>

        <h2 className={`${tb.h2} ${styles.title}`}>
          <ScrollReveal as="span" className={tb.phrase}>
            {whoCopy.label}
          </ScrollReveal>
        </h2>

        {/* FDE を知らない人向けの説明（1段落・大きく） */}
        <ScrollReveal delay={0.08}>
          <p className={`${tb.summary} ${styles.explain}`}>{fdeIntro.explain}</p>
        </ScrollReveal>

        {/* 仕事の3段（現場に入る → 教え込む → 回せる状態にする） */}
        <ol className={styles.steps}>
          {fdeIntro.steps.map((s, i) => (
            <ScrollReveal
              as="li"
              key={s.no}
              className={styles.step}
              delay={0.06 + i * 0.08}
            >
              <DrawRule className={styles.stepRule} duration={0.6} delay={0.1 + i * 0.08} />
              <p className={styles.stepNo}>{s.no}</p>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepBody}>{s.body}</p>
            </ScrollReveal>
          ))}
        </ol>

        {/* しないこと（1行）。他者は名指ししない＝立場を言い切るだけ */}
        <ScrollReveal delay={0.1}>
          <p className={styles.notDoing}>
            {phrases(whoCopy.notDoing).map((t, i) => (
              <span key={`${t}-${i}`} className={tb.phrase}>
                {t}
              </span>
            ))}
          </p>
        </ScrollReveal>

        {/* ★ 結論の大キャッチ＝このページで最も大きい文字。色は使わない（白と罫と余白だけ） */}
        <div className={styles.closing}>
          <DrawRule className={styles.closingRule} duration={0.9} delay={0.05} />
          <ScrollReveal as="p" className={styles.closingText} delay={0.12}>
            {phrases(fdeIntro.closing).map((t, i) => (
              <span key={`${t}-${i}`} className={tb.phrase}>
                {t}
              </span>
            ))}
          </ScrollReveal>
        </div>
      </div>

      {/* ============ 帖2＝3本柱（FDE／TOOLS／WEB） ============ */}
      <div className={`${tb.inner} ${styles.pillarsBand}`}>
        <ScrollReveal className={styles.lead}>
          <DrawRule className={styles.leadRule} duration={0.6} delay={0.1} />
          <p className={styles.leadText}>{whoCopy.pillarsLead}</p>
        </ScrollReveal>

        <ul className={styles.pillars}>
          {pillars.map((p, i) => {
            const n = Number(p.statValue);
            return (
              <ScrollReveal
                as="li"
                key={p.key}
                className={styles.pillar}
                delay={0.06 * i}
              >
                <Link href={p.href} className={styles.tile}>
                  <span className={styles.thumb}>
                    {/* 墨（静的 grayscale）→ カラーが opacity で重なる。動かすのは opacity だけ */}
                    <Image
                      src={p.image.src}
                      alt=""
                      aria-hidden="true"
                      fill
                      sizes={TILE_SIZES}
                      className={`${styles.thumbImg} ${styles.thumbMono}`}
                    />
                    <Image
                      src={p.image.src}
                      alt={p.image.alt}
                      fill
                      sizes={TILE_SIZES}
                      className={`${styles.thumbImg} ${styles.thumbColor}`}
                    />
                    <span className={styles.thumbVeil} aria-hidden="true" />
                  </span>

                  <span className={styles.body}>
                    <span className={styles.head}>
                      <span className={styles.no} aria-hidden="true">
                        {p.no}
                      </span>
                      <span className={styles.en} aria-hidden="true">
                        {p.nameEn}
                      </span>
                    </span>
                    <span className={styles.name}>{p.nameJa}</span>

                    <span className={styles.stat}>
                      <span className={styles.statValue}>
                        {Number.isFinite(n) ? (
                          <CountUp value={n} duration={1.1} delay={0.2 + 0.08 * i} />
                        ) : (
                          p.statValue
                        )}
                      </span>
                      <span className={styles.statUnit}>{p.statUnit}</span>
                    </span>
                    <span className={styles.statLabel}>{p.statLabel}</span>

                    <span className={styles.line}>{p.line}</span>
                    <span className={styles.cta}>
                      {p.cta}
                      <span aria-hidden="true">→</span>
                    </span>
                  </span>
                </Link>
              </ScrollReveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
