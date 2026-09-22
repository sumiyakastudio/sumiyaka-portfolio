import Image from "next/image";
import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import DrawRule from "@/components/animation/DrawRule";
import CountUp from "@/components/animation/CountUp";
import SectionMark from "@/components/fv/top-body/SectionMark";
import tb from "@/components/fv/top-body/top-body.module.css";
import { whoCopy, whoPhoto } from "@/data/pillars";
import { getFdeIntro } from "@/lib/caseCatalog";
import { getPillars } from "@/lib/pillarCatalog";
import HandoffDiagram from "./HandoffDiagram";
import styles from "./Who.module.css";

/**
 * 01 何をする人か（WHAT I DO・#who）— **P17「トップのハブ化」(2026-09-20)**。
 *
 * FV の「その意味を、見る」の飛び先（Hero の #who）。トップで最初に読ませる章で、
 * FDE を知らない人・先入観のある人に「何をする人か」を1章で通す。
 *
 * 文言はすべて契約ファイル由来（このファイルに直書きしない）：
 *   ・FDE の説明・3段・結びの一文 … lib/caseCatalog.ts の getFdeIntro()
 *   ・ラベル／しないこと／3本柱の前置き／写真 … data/pillars.ts の whoCopy・whoPhoto
 *   ・3本柱（数字・代表画像） … lib/pillarCatalog.ts の getPillars()
 *
 * 型（2026-09-20 改版）：
 *   [帖1の頭] 2カラム＝左（章番号 → h2 → 説明）／右（導入指導の写真・右端へ張り出す）
 *   [帖1の続き] 仕事の3段 → しないこと1行 → **結論の大キャッチ**
 *   [帖2] 前置き → 3本柱の**目次**（箱を持たない・罫線だけの3行）
 * 地：暖黒 × 灯（左上の暈）。**色は使わない**（朱は 02 実測の1点だけ）。
 * 動き：既存の部品だけ（ScrollReveal／DrawRule／CountUp）。新しい機構は増やさない。
 *   ⚠ ホバーは ScrollReveal の載る <li> ではなく内側の <a> に当てる
 *     （同じ要素に重ねると GSAP の transform と食い合う）。
 *   ⚠ 目次のホバー画像は opacity だけで出す（filter はアニメさせない＝iOS/WebKit 安全）。
 *     常時は opacity:0 + visibility:hidden の絶対配置＝場所を取らない。
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

/** 導入指導の写真＝PC では本文カラムの外（画面右端の近く）まで張り出す。
 *  上限は 900px（元画像 1264px）。比率 4:3 のまま＝トリミングしない */
const PHOTO_SIZES = "(max-width: 1099px) calc(100vw - 3rem), (max-width: 1500px) 52vw, 900px";

/** 目次のホバー画像（PC のみ・240px 固定） */
const MEDIA_SIZES = "240px";

export default function Who() {
  const pillars = getPillars();

  return (
    <section
      id="who"
      data-top-section="01"
      data-top-label={whoCopy.labelEn}
      className={`${tb.section} ${tb.washTop} ${styles.section}`}
    >
      {/* ====== 帖1の頭＝左に章の言葉／右に導入指導の写真（PC は2カラム） ====== */}
      <div className={styles.headBand}>
        <div className={styles.headGrid}>
          <div className={styles.headText}>
            <ScrollReveal>
              <SectionMark no="01" label={whoCopy.labelEn} />
            </ScrollReveal>

            <h2 className={`${tb.h2} ${styles.title}`}>
              <ScrollReveal as="span" className={tb.phrase}>
                {whoCopy.label}
              </ScrollReveal>
            </h2>

            {/* FDE を知らない人向けの説明（1段落） */}
            <ScrollReveal delay={0.08}>
              <p className={`${tb.summary} ${styles.explain}`}>{fdeIntro.explain}</p>
            </ScrollReveal>
          </div>

          {/* 写真は少し遅らせて入れる（文字が先・絵が後） */}
          <ScrollReveal className={styles.photo} delay={0.18}>
            <figure className={styles.photoFigure}>
              <span className={styles.photoFrame}>
                <Image
                  src={whoPhoto.src}
                  alt={whoPhoto.alt}
                  width={whoPhoto.width}
                  height={whoPhoto.height}
                  sizes={PHOTO_SIZES}
                  className={styles.photoImg}
                />
              </span>
              <figcaption className={styles.photoCaption}>{whoPhoto.caption}</figcaption>
            </figure>
          </ScrollReveal>
        </div>
      </div>

      {/* ====== 帖1の続き＝3段 → しないこと → 結論 ====== */}
      <div className={`${tb.inner} ${styles.introBand}`}>
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

        {/* 3段を1枚の絵にした図＝「手を離すまで」。3列の続きに見えるよう横軸を 1/3 ずつに割る。
            ⚠ ScrollReveal で包まない（transform の二重掛け）＝入場は図が自分で持つ */}
        <HandoffDiagram />

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

      {/* ====== 帖2＝3本柱の目次（FDE／TOOLS／WEB）。箱を作らず罫線だけで並べる ====== */}
      <div className={`${tb.inner} ${styles.pillarsBand}`}>
        <ScrollReveal className={styles.lead}>
          <DrawRule className={styles.leadRule} duration={0.6} delay={0.1} />
          <p className={styles.leadText}>{whoCopy.pillarsLead}</p>
        </ScrollReveal>

        <ul className={styles.index}>
          {pillars.map((p, i) => {
            const n = Number(p.statValue);
            // 「87.7」のような小数はデータ側の桁をそのまま数える（ハードコードしない）
            const decimals = (p.statValue.split(".")[1] ?? "").length;
            return (
              <ScrollReveal as="li" key={p.key} className={styles.row} delay={0.05 * i}>
                <DrawRule className={styles.rowRule} duration={0.7} delay={0.08 + i * 0.07} />

                <Link href={p.href} className={styles.rowLink}>
                  {/* ホバーで1枚だけ浮かぶ代表画像（PC・絶対配置＝場所を取らない） */}
                  <span className={styles.media} aria-hidden="true">
                    <Image
                      src={p.image.src}
                      alt=""
                      fill
                      sizes={MEDIA_SIZES}
                      loading="lazy"
                      className={styles.mediaImg}
                    />
                    <span className={styles.mediaVeil} />
                  </span>

                  <span className={styles.no} aria-hidden="true">
                    {p.no}
                  </span>

                  <span className={styles.main}>
                    <span className={styles.nameRow}>
                      <span className={styles.name}>{p.nameJa}</span>
                      <span className={styles.en} aria-hidden="true">
                        {p.nameEn}
                      </span>
                    </span>
                    <span className={styles.line}>{p.line}</span>
                  </span>

                  <span className={styles.stat}>
                    <span className={styles.statNum}>
                      <span className={styles.statValue}>
                        {Number.isFinite(n) ? (
                          <CountUp
                            value={n}
                            decimals={decimals}
                            duration={1.1}
                            delay={0.2 + 0.08 * i}
                          />
                        ) : (
                          p.statValue
                        )}
                      </span>
                      <span className={styles.statUnit}>{p.statUnit}</span>
                    </span>
                    <span className={styles.statLabel}>{p.statLabel}</span>
                  </span>

                  <span className={styles.go}>
                    <span className={styles.cta}>{p.cta}</span>
                    <span className={styles.arrow} aria-hidden="true">
                      →
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
