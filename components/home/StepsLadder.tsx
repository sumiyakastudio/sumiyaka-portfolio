"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import CountUp from "@/components/animation/CountUp";
import Disclose from "@/components/animation/Disclose";
import DrawRule from "@/components/animation/DrawRule";
import ScrollReveal from "@/components/animation/ScrollReveal";
import { prefersLightVisuals } from "@/lib/device";
import { useFullMotion } from "@/lib/useLightVisuals";
import sv from "@/components/service/service-body.module.css";
import styles from "./StepsLadder.module.css";

gsap.registerPlugin(ScrollTrigger);

/**
 * 三段の梯子（THREE STEPS の本体）— P12「1画面1メッセージ」(2026-09-06)。
 * 文言は正本 `P12_原稿_減量差分.md` トップ THREE STEPS の【可視】【詳細】どおり一字も変えない。
 *
 *  - 梯子＝左右2本の縦桟（PC ではスクロールに合わせて上から伸びる）＋各段の横桟（DrawRule）。
 *    段の板は下から積み上がる（ScrollReveal up）。
 *  - 数字（約8割・20時間 → 4時間）は1段目だけ＝実測があるのはここだけ。CountUp で書き入れる。
 *  - 各段の詳細（現行の本文そのまま）は Disclose に畳む（既定は閉・本文は DOM に残る）。
 *  - タッチ端末・狭幅・reduced-motion（prefersLightVisuals）では桟は伸びきった静的な状態。
 *
 * P17（2026-09-20）＝THREE STEPS ごと /service へ移設。共通語彙は
 * components/service/service-body.module.css（本文・詳細）。文言と動きは不変。
 */
type Step = {
  no: string;
  tag: string;
  title: string;
  line: string;
  detail: string[];
};

const STEPS: Step[] = [
  {
    no: "1",
    tag: "AIは、まだ入れません",
    title: "御社専用の道具を、渡す",
    line: "いま使っているファイルの形に、道具を合わせます。動くのは御社のパソコンの中だけ。",
    detail: [
      "汎用のソフトに業務を合わせるのではなく、いま使っているファイルの形に道具を合わせます。AIのおかげで道具を作る手間が下がり、一社のためだけに作ることが現実的になりました。",
      "インターネットに繋がっていなくても動き、データはどこにも出ません。",
      "公開中の6本のツールと同じ処理を、500件規模のデータで実測。手作業なら合わせて20時間近い仕事が、人が確認する時間を入れても4時間ほど。減るのは、20時間のうちの約8割です。",
      "初回の構築にかかる時間は含みません。判断が要るものは、人へ返します。",
    ],
  },
  {
    no: "2",
    tag: "頼めば、終わっている",
    title: "その道具を、AIに使わせる",
    line: "「今月分の請求書を」の一言で終わる。人が見るのは、出来上がったものだけ。",
    detail: [
      "作った道具を社内のデータや既存のシステムと繋ぎ、御社の仕事のやり方を覚えたAIに使わせます。開いて、探して、貼り付けて——その手順ごと、要らなくなります。",
      "台帳を開く／取引先ごとに分ける／1件ずつPDFにする／保存先へ仕分ける。1段目の道具でも消えるのは操作の手間までで、いつ・何を渡すかは人が決めていました。ここを任せます。",
    ],
  },
  {
    no: "3",
    tag: "私が、要らなくなる",
    title: "社員の方が、自分で作れる",
    line: "お渡しするのは、道具／手順書／作り方。次に必要になったとき、私を呼ばずに済みます。",
    detail: [
      "次に何か始めるとき、私を呼ばずに社員の方が形にできる状態まで。ここまで来ると、仕組みは御社の中で増えていきます。",
      "納めるのは道具だけではありません。どう考えて作ったのかを手順書に残し、社員の方が同じものを作れるところまで一緒にやります。",
    ],
  },
];

export default function StepsLadder() {
  const ref = useRef<HTMLOListElement>(null);
  const railL = useRef<HTMLSpanElement>(null);
  const railR = useRef<HTMLSpanElement>(null);
  /* フル演出を走らせてよいか。従来の state ＋ effect 内での更新と同じ挙動を、
     effect 内の同期 setState なしで得る（2026-09-06 統合QC） */
  const live = useFullMotion();

  useEffect(() => {
    const ol = ref.current;
    if (!ol) return;
    if (prefersLightVisuals()) return; /* 静的＝桟は伸びきった状態 */

    const st = ScrollTrigger.create({
      trigger: ol,
      start: "top 78%",
      end: "bottom 55%",
      onUpdate: (self) => {
        const s = `scaleY(${self.progress})`;
        if (railL.current) railL.current.style.transform = s;
        if (railR.current) railR.current.style.transform = s;
      },
    });

    return () => st.kill();
  }, []);

  return (
    <ol ref={ref} className={[styles.ladder, live ? styles.live : styles.static].join(" ")}>
      <span ref={railL} className={`${styles.rail} ${styles.railL}`} aria-hidden="true" />
      <span ref={railR} className={`${styles.rail} ${styles.railR}`} aria-hidden="true" />

      {STEPS.map((s, i) => (
        <li key={s.no} className={styles.rung}>
          {/* 横桟＝段の板が載る線 */}
          <DrawRule className={styles.rungLine} duration={0.7} delay={0.05} />

          {/* 板＝下から積み上がる */}
          <ScrollReveal className={styles.board} delay={0.1}>
            <div className={styles.numCell} aria-hidden="true">
              <span className={styles.num}>{s.no}</span>
              <span className={styles.numUnit}>段目</span>
            </div>

            <div className={styles.body}>
              <p className={styles.tag}>{s.tag}</p>
              <h3 className={styles.name}>{s.title}</h3>
              <p className={`${sv.body} ${styles.line}`}>{s.line}</p>
              <Disclose className={styles.detail}>
                {s.detail.map((t) => (
                  <p key={t} className={sv.detail}>
                    {t}
                  </p>
                ))}
              </Disclose>
            </div>

            {/* 数字＝実測がある1段目だけ */}
            {i === 0 && (
              <div className={styles.figure}>
                <p className={styles.figureTag}>実測</p>
                <p className={styles.figureNum}>
                  <CountUp value={8} prefix="約" suffix="割" duration={1.2} delay={0.3} />
                </p>
                <p className={styles.figureLabel}>手作業からの削減</p>
                <p className={styles.figureRatio}>20時間 → 4時間</p>
              </div>
            )}
          </ScrollReveal>
        </li>
      ))}
    </ol>
  );
}
