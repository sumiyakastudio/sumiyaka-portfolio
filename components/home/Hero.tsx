"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import TenkiStage from "@/components/fv/top/TenkiStage";
import { TENKI_T, TENKI_STILL } from "@/components/fv/top/tenkiTiming";
import { useLenis } from "@/components/animation/SmoothScroll";
import { useLightVisuals } from "@/lib/useLightVisuals";
import { prefersLightVisuals } from "@/lib/device";
import styles from "./Hero.module.css";

gsap.registerPlugin(ScrollTrigger);

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 文字列を個別spanに分割するヘルパー
 *  各文字は opacity:0 で置かれ、転記ステージの onLetter(i)（＝筆がその文字を書き上げた
 *  瞬間）でクロスフェードして現れる。data-hero-mag は付けない（マグネティックで
 *  文字がずれると、版下（canvas に焼いた同じ字）と絵がずれるため）。 */
function LetterSpan({ text, className }: { text: string; className?: string }) {
  return (
    <span data-hero-line className={className}>
      {text.split("").map((ch, i) =>
        ch === " " ? (
          <span key={i} className={styles.fvSpace} />
        ) : (
          <span key={i} data-hero-letter className={styles.fvLetter} style={{ opacity: 0 }}>
            {ch}
          </span>
        )
      )}
    </span>
  );
}

/** マグネティック反発用に文字列を個別inline-block spanに分割 */
function magChars(text: string) {
  return text.split("").map((ch, i) => (
    <span
      key={i}
      data-hero-mag=""
      style={{ display: "inline-block", willChange: "transform" }}
    >
      {ch === " " ? " " : ch}
    </span>
  ));
}

interface HeroProps {
  openingDone: boolean;
}

export default function Hero({ openingDone }: HeroProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  /** 転記ステージが「題字を書き終え、墨の一滴が落ちた」と告げた（＝他要素の入場の起点） */
  const [settled, setSettled] = useState(false);
  /** FV がスクロールで出ていく進捗 0→1（ScrollTrigger の scrub が書き、ステージが読む） */
  const exitRef = useRef(0);

  const lettersRef = useRef<HTMLElement[] | null>(null);
  const shownRef = useRef<Set<number>>(new Set());
  const scrollBoundRef = useRef(false);

  const light = useLightVisuals();
  const lenis = useLenis();

  /* ---- 題字の文字を1文字ずつ現す（筆が通った版下とのクロスフェード） ---- */
  const revealLetter = useCallback((i: number) => {
    const hero = heroRef.current;
    if (!hero) return;
    if (!lettersRef.current) {
      lettersRef.current = Array.from(
        hero.querySelectorAll<HTMLElement>("[data-hero-letter]")
      );
    }
    const el = lettersRef.current[i];
    if (!el || shownRef.current.has(i)) return;
    shownRef.current.add(i);
    gsap.to(el, {
      opacity: 1,
      duration: reducedMotion() ? 0.01 : TENKI_T.letterFade,
      ease: "power1.out",
      overwrite: "auto",
    });
  }, []);

  const revealAllLetters = useCallback(() => {
    const hero = heroRef.current;
    if (!hero) return;
    if (!lettersRef.current) {
      lettersRef.current = Array.from(
        hero.querySelectorAll<HTMLElement>("[data-hero-letter]")
      );
    }
    for (let i = 0; i < lettersRef.current.length; i++) revealLetter(i);
  }, [revealLetter]);

  /** 転記ステージ → Hero：筆が i 番目の文字を書き上げた */
  const handleLetter = useCallback(
    (i: number) => {
      revealLetter(i);
    },
    [revealLetter]
  );

  /** 転記ステージ → Hero：定着完了（墨の一滴が落ち、灯がともり、他要素が入場する） */
  const handleSettled = useCallback(() => {
    setSettled(true);
  }, []);

  // FV右の宣言ボタン →「働き方」#way へページ内スムーススクロール（P9・2026-08-27＝旧 #value）
  // （既存実装の踏襲＝Header と同じ Lenis scrollTo。Lenis 不在時はネイティブへ委譲）
  const handleValueClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      const target = document.getElementById("way");
      if (!target) return; // 飛び先が無い場合はネイティブ挙動に任せる
      e.preventDefault();
      if (lenis) {
        lenis.scrollTo(target);
      } else {
        target.scrollIntoView({ behavior: "smooth" });
      }
    },
    [lenis]
  );

  /* ---- 軽量経路（タッチ・狭幅・reduced-motion・?tenki=still）の入場 ----
     静止1コマの転記は onLetter / onSettled を発火しないので、こちら側で
     tenkiTiming.ts の TENKI_STILL と同じ刻みで題字を現し、定着を告げる。 */
  useEffect(() => {
    if (!openingDone) return;
    const forcedStill =
      typeof window !== "undefined" &&
      (() => {
        const q = new URLSearchParams(window.location.search);
        return (q.get("tenki") || q.get("bokujin")) === "still";
      })();
    if (!light && !forcedStill) return;

    const rm = reducedMotion();
    const hero = heroRef.current;
    if (!hero) return;
    const letters = Array.from(hero.querySelectorAll<HTMLElement>("[data-hero-letter]"));
    lettersRef.current = letters;

    const timers: number[] = [];
    letters.forEach((_, i) => {
      const at = rm
        ? 0
        : (TENKI_STILL.letterDelay + i * TENKI_STILL.letterStagger) * 1000;
      timers.push(window.setTimeout(() => revealLetter(i), at));
    });
    timers.push(
      window.setTimeout(() => setSettled(true), rm ? 0 : TENKI_STILL.settle * 1000)
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [openingDone, light, revealLetter]);

  /* ---- 保険：何があっても hardDeadline（2.6s）で題字を出し切る ----
     フォント読込の遅延・WebGL の失敗・rAF の停止などで onLetter が来なくても、
     題字は必ず読める状態になる（a11y の最終防御）。
     ただしステージ時計が回っている間は、その立ち上がり遅れ（書体待ち・画面外での
     停止）ぶんだけ期限を後ろへずらす。さもないと書き順の演出を保険が食ってしまう。 */
  useEffect(() => {
    if (!openingDone) return;
    const t0 = performance.now();
    let id = 0;
    const check = () => {
      const elapsed = (performance.now() - t0) / 1000;
      const dbg = typeof window !== "undefined" ? window.__tenki : undefined;
      // ステージ時計の遅れ＝壁時計 − ステージ時計（書体待ち・可視性ゲートで止まった分）
      const lag = dbg && dbg.mode !== "still" ? Math.max(0, elapsed - dbg.t) : 0;
      if (elapsed >= TENKI_T.hardDeadline + lag) {
        revealAllLetters();
        setSettled(true);
        return;
      }
      id = window.setTimeout(check, 200);
    };
    id = window.setTimeout(check, TENKI_T.hardDeadline * 1000);
    return () => window.clearTimeout(id);
  }, [openingDone, revealAllLetters]);

  // 入場アニメーション（題字以外）→ 肩書き/サブ/HR/宣言/エッジ/コーナー
  // 起点＝転記ステージの onSettled（墨の一滴が落ちて灯がともる瞬間）
  useEffect(() => {
    if (!openingDone || !settled) return;

    const scrollArea = scrollAreaRef.current;
    const sticky = stickyRef.current;
    if (!scrollArea || !sticky) return;

    const rm = reducedMotion();

    // FloatingLogo 表示
    if (logoRef.current) {
      gsap.fromTo(
        logoRef.current,
        { opacity: 0, scale: 0.1, transformOrigin: "left top" },
        { opacity: 1, scale: 1, duration: rm ? 0.01 : 0.6, ease: EASE }
      );
    }

    const ctx = gsap.context(() => {
      // 初期表示: visibility visible + opacity 0
      const singleSelectors = [
        "[data-hero-sub]", "[data-hero-sub2]",
        "[data-hero-hr]", "[data-hero-decl]",
        "[data-hero-corners-svg]",
      ];
      singleSelectors.forEach((sel) => {
        const el = heroRef.current?.querySelector(sel);
        if (el) gsap.set(el, { visibility: "visible", opacity: 0 });
      });
      // エッジテキスト（複数要素）
      heroRef.current?.querySelectorAll("[data-hero-corner]").forEach((el) => {
        gsap.set(el, { visibility: "visible", opacity: 0 });
      });

      // ===== 入場タイムライン =====
      const tl = gsap.timeline({ delay: rm ? 0 : 0.1 });
      if (rm) tl.timeScale(100); // reduced-motion は終端値へ即座に

      // 肩書き行
      tl.fromTo("[data-hero-sub]",
        { y: 15, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.2, ease: EASE },
      0);

      // サブコピー
      tl.fromTo("[data-hero-sub2]",
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.0, ease: EASE },
      0);

      // HR
      tl.fromTo("[data-hero-hr]",
        { opacity: 0, scaleX: 0, transformOrigin: "left" },
        { opacity: 1, scaleX: 1, duration: 0.8, ease: EASE },
      0.2);

      // 宣言ブロック（FV右カラム）— サブ群と同じ質感でわずかに遅れて立ち上がる
      tl.fromTo("[data-hero-decl]",
        { y: 18, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.1, ease: EASE },
      0.25);

      // 「コンサルティング」を消す墨の一線 — 宣言が立ってから左→右へ引かれる
      gsap.set("[data-hero-strike]", { scaleX: 0, transformOrigin: "left center" });
      tl.to("[data-hero-strike]", { scaleX: 1, duration: 0.7, ease: EASE }, 0.95);

      // エッジテキスト
      tl.fromTo("[data-hero-corner]",
        { opacity: 0 },
        { opacity: 1, duration: 1.0, ease: "power2.out" },
      0.15);

      // コーナーSVGコンテナ
      tl.to("[data-hero-corners-svg]", { opacity: 1, duration: 0.01 }, 0.2);

      // コーナーライン
      tl.from("[data-hero-corner-line]", {
        strokeDashoffset: 80, opacity: 0, duration: 1.0, ease: EASE, stagger: 0.1,
      }, 0.2);
    }, heroRef);

    return () => ctx.revert();
  }, [openingDone, settled]);

  // スクロール連動 — 定着後にバインド
  useEffect(() => {
    if (!settled || scrollBoundRef.current) return;
    if (reducedMotion()) return; // スクロール連動の視差は reduced-motion では張らない
    scrollBoundRef.current = true;

    const scrollArea = scrollAreaRef.current;
    const sticky = stickyRef.current;
    if (!scrollArea || !sticky) return;

    // ステージへ渡す退場進捗は PC のフル経路のみ（静止1コマ側は書かない）
    const writeExit = !prefersLightVisuals();
    const exit = exitRef;

    const stConfig = {
      trigger: scrollArea,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.5,
    };

    const ctx = gsap.context(() => {
      // ===== スクロール退場「墨に沈む」 =====
      // 3Dチルト（rotateX/rotateY/transformPerspective）は廃止。
      // FVコンテンツがスクロール量に応じてわずかに沈み（translateY）、
      // H1 が行単位の時差で墨がにじむように静かに消える。
      // 使用プロパティは transform / opacity のみ（filter・blend・3D 不使用）。
      const exitTl = gsap.timeline({ scrollTrigger: stConfig });

      // 粒への退場進捗（scrub 済みの 0→1）。粒は上へ流れ去り、灯は遠のく。
      if (writeExit) {
        const proxy = { v: 0 };
        exitTl.fromTo(
          proxy,
          { v: 0 },
          {
            v: 1,
            ease: "none",
            duration: 1,
            onUpdate() {
              exit.current = proxy.v;
            },
          },
          0
        );
      }

      // 沈み — 下の要素ほど深く沈む（3Dなしの奥行き感）
      exitTl.fromTo("[data-hero-main]", { y: 0 }, { y: 36, ease: "power1.in", duration: 1 }, 0);
      exitTl.fromTo("[data-hero-sub]", { y: 0 }, { y: 52, ease: "power1.in", duration: 1 }, 0);
      exitTl.fromTo("[data-hero-sub2]", { y: 0 }, { y: 68, ease: "power1.in", duration: 1 }, 0);
      exitTl.fromTo("[data-hero-hr]", { y: 0 }, { y: 80, ease: "power1.in", duration: 1 }, 0);
      exitTl.fromTo("[data-hero-decl]", { y: 0 }, { y: 56, ease: "power1.in", duration: 1 }, 0);

      // H1 — 行単位の時差フェード（上の行から順ににじみ消え、軸コピーの行が最後まで残る）
      exitTl.fromTo(
        "[data-hero-line]",
        { opacity: 1, y: 0 },
        { opacity: 0, y: 14, ease: "sine.in", duration: 0.5, stagger: 0.18 },
        0.15
      );

      // 周辺要素のフェード（肩書き・サブ・HR・エッジ・コーナー）
      exitTl.fromTo(
        [
          "[data-hero-sub]", "[data-hero-sub2]", "[data-hero-hr]",
          "[data-hero-decl]",
          "[data-hero-corner]", "[data-hero-corners-svg]",
        ],
        { opacity: 1 },
        { opacity: 0, ease: "power1.in", duration: 0.6 },
        0.35
      );
    }, heroRef);

    return () => {
      exit.current = 0;
      ctx.revert();
    };
  }, [settled]);

  // マグネティック反発エフェクト（PC only・題字以外の文字＝肩書き/サブ/隅の英字）
  // 題字は粒との位置合わせを守るため対象外（data-hero-mag を付けていない）
  useEffect(() => {
    if (!settled) return;
    if (typeof window !== "undefined" && window.innerWidth <= 768) return;
    if (reducedMotion()) return;

    const hero = heroRef.current;
    if (!hero) return;

    const chars = Array.from(
      hero.querySelectorAll<HTMLSpanElement>("[data-hero-mag]")
    );
    if (!chars.length) return;

    const MAG_RADIUS = 160;
    const MAG_STRENGTH = 70;
    let pending = false;
    let mx = 0;
    let my = 0;

    const tick = () => {
      pending = false;
      chars.forEach((char) => {
        const rect = char.getBoundingClientRect();
        const tx = (gsap.getProperty(char, "x") as number) || 0;
        const ty = (gsap.getProperty(char, "y") as number) || 0;
        const ox = rect.left + rect.width / 2 - tx;
        const oy = rect.top + rect.height / 2 - ty;

        const dx = ox - mx;
        const dy = oy - my;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MAG_RADIUS) {
          const force = ((1 - dist / MAG_RADIUS) ** 2) * MAG_STRENGTH;
          const angle = Math.atan2(dy, dx);
          gsap.to(char, {
            x: Math.cos(angle) * force,
            y: Math.sin(angle) * force,
            duration: 0.3,
            ease: "power2.out",
            overwrite: "auto",
          });
        } else {
          gsap.to(char, {
            x: 0,
            y: 0,
            duration: 0.5,
            ease: "elastic.out(1, 0.4)",
            overwrite: "auto",
          });
        }
      });
    };

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!pending) {
        pending = true;
        requestAnimationFrame(tick);
      }
    };

    const onLeave = () => {
      chars.forEach((char) => {
        gsap.to(char, {
          x: 0,
          y: 0,
          duration: 1.2,
          ease: "elastic.out(1, 0.3)",
          overwrite: true,
        });
      });
    };

    hero.addEventListener("mousemove", onMove);
    hero.addEventListener("mouseleave", onLeave);
    return () => {
      hero.removeEventListener("mousemove", onMove);
      hero.removeEventListener("mouseleave", onLeave);
    };
  }, [settled]);

  return (
    <div ref={scrollAreaRef} className={styles.scrollArea}>
      {/* JS 無効時の終端値＝題字はそのまま読める（転記の演出だけが無くなる） */}
      <noscript>
        <style>{`[data-hero-letter]{opacity:1!important}[data-hero-sub],[data-hero-sub2],[data-hero-hr],[data-hero-decl],[data-hero-corner]{visibility:visible!important}`}</style>
      </noscript>
      <section ref={heroRef} className={styles.hero}>
        <div ref={stickyRef} data-hero-sticky className={styles.stickyInner}>
          {/* Floating Logo */}
          <div ref={logoRef} className={styles.floatingLogo} style={{ opacity: 0 }}>
            <span className={styles.floatingLogoEn}>AKASHIKI</span>
            <span className={styles.floatingLogoSep}>—</span>
            <span className={styles.floatingLogoJp}>灯敷</span>
          </div>

          {/* Background — 転記（てんき）
              事務のデータの断片（CSV の行・Excel の升目・PDF の紙片）がばらばらに
              漂い（バラバラな事務作業）、誰も触らないのに整列して繋がり（ひとりでに）、
              一本の線になって題字を書き上げる（仕組みに変えます）。書き終えた瞬間に
              墨の一滴が落ちて背景に滲み、灯が一点ともる。
              可読性スクリムと灯（lantern.ts）はこのステージの内側にある。 */}
          <TenkiStage
            active={openingDone}
            light={light}
            exitRef={exitRef}
            onLetter={handleLetter}
            onSettled={handleSettled}
          />

          {/* Content Container — 2カラム（PC≥1280：左＝H1演出／右＝宣言）・以下は縦積み
              data-hero-content ＝ステージが読む保護帯（墨と灯をこの外側にだけ置く） */}
          <div
            data-hero-content
            className={styles.container}
            style={{ visibility: openingDone ? "visible" : "hidden" }}
          >
            <div className={styles.colMain}>
              <h1 data-hero-main className={styles.mainText}>
                <LetterSpan text="バラバラな事務作業を、" className={styles.fvLine} />
                <LetterSpan text="ひとりでに回る" className={styles.fvLine} />
                <LetterSpan text="仕組みに変えます。" className={styles.fvLine} />
              </h1>

              <p data-hero-sub className={styles.sub} style={{ visibility: "hidden" }}>
                {magChars("AI導入の設計と教育 — 墨家 / SUMIYAKA")}
              </p>

              <p data-hero-sub2 className={styles.sub2} style={{ visibility: "hidden" }}>
                {magChars("設計から実装・公開まで、すべて")}
                {/* 「。」の行末孤立防止＝末尾グループを折返し禁止（QC実測でSP390の孤立を検出） */}
                <span style={{ whiteSpace: "nowrap" }}>{magChars("一人で。")}</span>
              </p>

              <div data-hero-hr className={styles.hr} style={{ visibility: "hidden" }} />
            </div>

            {/* 宣言ブロック（コピーデッキ verbatim・改行位置のみ調整） */}
            <div data-hero-decl className={styles.decl} style={{ visibility: "hidden" }}>
              <p className={styles.declLead}>
                <span className={styles.declStrike}>
                  コンサルティング
                  <span data-hero-strike className={styles.declStrikeLine} aria-hidden="true" />
                </span>
                では、
                <br />
                <span className={styles.declNo}>ありません。</span>
              </p>
              <p className={styles.declMain}>AIスペシャリストです。</p>
              <a href="#way" className={styles.declBtn} onClick={handleValueClick}>
                <span className={styles.declBtnLabel}>その意味を、見る</span>
                <svg className={styles.declBtnArrow} viewBox="0 0 12 15" aria-hidden="true">
                  <path
                    d="M6 1 V12 M1.5 8.5 L6 13.5 L10.5 8.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>
          </div>

          {/* Edge Text — ビューポート四隅基準（2カラム化に伴い container の外へ） */}
          <div data-hero-corner className={styles.edgeBl} style={{ visibility: "hidden" }}>
            <span className={styles.edgeText}>{magChars("PORTFOLIO 2026")}</span>
          </div>
          <div data-hero-corner className={styles.edgeBr} style={{ visibility: "hidden" }}>
            <span className={styles.edgeText}>{magChars("TOKYO, JAPAN")}</span>
          </div>

          {/* Corner Frames SVG */}
          <svg
            data-hero-corners-svg
            className={styles.corners}
            style={{ visibility: "hidden" }}
            aria-hidden="true"
            viewBox="0 0 1920 1080"
            preserveAspectRatio="none"
          >
            <polyline data-hero-corner-line className={styles.corner} points="40,80 40,40 80,40" />
            <polyline data-hero-corner-line className={styles.corner} points="1840,40 1880,40 1880,80" />
            <polyline data-hero-corner-line className={styles.corner} points="40,1000 40,1040 80,1040" />
            <polyline data-hero-corner-line className={styles.corner} points="1840,1040 1880,1040 1880,1000" />
          </svg>

          {/* Scanline Overlay */}
          <div className={styles.scanline} aria-hidden="true" />
        </div>
      </section>
    </div>
  );
}
