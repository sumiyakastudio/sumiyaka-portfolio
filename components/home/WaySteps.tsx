"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Disclose from "@/components/animation/Disclose";
import ScrollReveal from "@/components/animation/ScrollReveal";
import { prefersLightVisuals } from "@/lib/device";
import { useFullMotion } from "@/lib/useLightVisuals";
import sv from "@/components/service/service-body.module.css";
import styles from "./WaySteps.module.css";

gsap.registerPlugin(ScrollTrigger);

/**
 * THE WAY の3工程＝縦のレール（P12・2026-09-06）。
 * 文言は `P12_原稿_減量差分.md` トップ THE WAY の【可視】【詳細】どおり一字も変えない。
 *
 *  - レールの上を灯が下りていき、「今の工程」だけが灯る（PC・マウスのみ・スクロール連動）。
 *    動かすのは transform（scaleY / translateY）と色・text-shadow だけ。
 *  - タッチ端末・狭幅・reduced-motion（lib/device の prefersLightVisuals）は静的＝
 *    3工程すべてが灯った状態で置く。
 *  - 各工程の詳細は Disclose（既定は閉・本文は DOM に残る）。
 *
 * P17（2026-09-20）＝THE WAY ごと /service へ移設。共通語彙は
 * components/service/service-body.module.css（本文・詳細）。文言と動きは不変。
 */
const STEPS = [
  {
    no: "01",
    title: "現場に入る",
    line: "ヒアリング室ではなく、作業している机の横で。",
    detail: [
      "誰が、どのファイルを、どの順で触っているか。本人も言葉にできない手順は、見に行けば分かります。",
    ],
  },
  {
    no: "02",
    title: "御社の仕事を、AIに教える",
    line: "実際のファイルと判断の基準を、一つずつ。",
    detail: [
      "汎用のAIをそのまま渡しても、御社の業務は動きません。一つの作業だけでなく、情報を集めてから出すまでの一連の流れを、まるごと任せられる形にします。",
    ],
  },
  {
    no: "03",
    title: "手を離す",
    line: "手順書を残し、社員の方が回せる状態で。ゴールは、私が要らなくなることです。",
    detail: ["一緒に実装し、使いこなせるようになるまで伴走します。"],
  },
];

export default function WaySteps() {
  const listRef = useRef<HTMLOListElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const lampRef = useRef<HTMLSpanElement>(null);
  /* フル演出を走らせてよいか。従来の state ＋ effect 内での更新と同じ挙動を、
     effect 内の同期 setState なしで得る（2026-09-06 統合QC） */
  const live = useFullMotion();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const ol = listRef.current;
    if (!ol) return;
    if (prefersLightVisuals()) return; /* 静的＝全部灯る */

    const triggers: ScrollTrigger[] = [];

    /* 灯の移動と、通った分だけ明るくなるレール */
    triggers.push(
      ScrollTrigger.create({
        trigger: ol,
        start: "top 62%",
        end: "bottom 62%",
        onUpdate: (self) => {
          const p = self.progress;
          if (fillRef.current) fillRef.current.style.transform = `scaleY(${p})`;
          if (lampRef.current) {
            lampRef.current.style.transform = `translate(-50%, ${(p * ol.offsetHeight).toFixed(1)}px)`;
          }
        },
      }),
    );

    /* 今の工程 */
    ol.querySelectorAll<HTMLElement>("[data-way-step]").forEach((el, i) => {
      triggers.push(
        ScrollTrigger.create({
          trigger: el,
          start: "top 62%",
          end: "bottom 62%",
          onToggle: (self) => {
            if (self.isActive) setCurrent(i);
          },
        }),
      );
    });

    return () => triggers.forEach((t) => t.kill());
  }, []);

  return (
    <ol
      ref={listRef}
      className={[styles.list, live ? styles.live : styles.static].join(" ")}
    >
      <span className={styles.rail} aria-hidden="true" />
      <span ref={fillRef} className={styles.railFill} aria-hidden="true" />
      <span ref={lampRef} className={styles.lamp} aria-hidden="true" />
      {STEPS.map((s, i) => (
        <ScrollReveal
          as="li"
          key={s.no}
          className={[styles.step, i === current ? styles.lit : ""].filter(Boolean).join(" ")}
          delay={i * 0.08}
        >
          <div data-way-step className={styles.stepInner}>
            <span className={styles.no}>
              <span className={styles.dot} aria-hidden="true" />
              {s.no}
            </span>
            <div className={styles.body}>
              <h4 className={styles.title}>{s.title}</h4>
              <p className={`${sv.body} ${styles.line}`}>{s.line}</p>
              <Disclose className={styles.detail}>
                {s.detail.map((t) => (
                  <p key={t} className={sv.detail}>
                    {t}
                  </p>
                ))}
              </Disclose>
            </div>
          </div>
        </ScrollReveal>
      ))}
    </ol>
  );
}
