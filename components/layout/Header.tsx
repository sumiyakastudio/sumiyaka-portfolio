"use client";

import { useEffect, useState, useCallback, useRef, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useLenis } from "@/components/animation/SmoothScroll";
import { useInkTransition } from "@/components/animation/InkTransition";
import styles from "./Header.module.css";

const NAV_LINKS = [
  { href: "/", label: "HOME" },
  { href: "/about", label: "ABOUT" },
  { href: "/service", label: "SERVICE" },
  // 2026-09-16 あおきさん指示＝FDE（導入事例 /cases）をナビに追加。トップ06の並び（FDE→TOOLS→WEB）と同じ順
  { href: "/cases", label: "FDE" },
  // 出口の順（①業務の自動化・ツール開発 → ②Web制作）に合わせて TOOLS を先に置く
  { href: "/tools", label: "TOOLS" },
  // ナビは英字で統一する（2026-08-23 あおきさん指示＝1つだけ日本語が混ざると統一感が壊れる）。
  // ⚠ 設計計画書 §14 C1 の「WEB制作」はこの指示で撤回済み。戻さないこと
  // 2026-08-27 あおきさん指示で WEB（実績にはツールもあるため WORKS は意味がズレる・英字なので統一感は保てる）
  //    URL は /works のまま。Footer の FOOTER_NAV と揃えること
  { href: "/works", label: "WEB" },
  { href: "/contact", label: "CONTACT" },
] as const;

export default function Header() {
  const pathname = usePathname();
  const lenis = useLenis();
  const { navigate } = useInkTransition();

  const handleNav = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, href: string) => {
      if (href === pathname) return;
      e.preventDefault();
      navigate(href, { x: e.clientX, y: e.clientY });
    },
    [navigate, pathname],
  );
  const [isVisible, setIsVisible] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isHome = pathname === "/";

  // Smart Header: ヒステリシスバッファ付きスクロール検知（旧common.js移植）
  useEffect(() => {
    const BUFFER = 50;
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        // トップ: 100vh / サブページ: data-fv要素の高さ（縮小後は50vh）
        const threshold = isHome
          ? window.innerHeight
          : (() => {
              const fv = document.querySelector<HTMLElement>("[data-fv]");
              return fv ? fv.offsetTop + fv.offsetHeight : window.innerHeight;
            })();

        if (!isVisible && currentY > threshold + BUFFER) {
          setIsVisible(true);
        } else if (isVisible && currentY < threshold - BUFFER) {
          setIsVisible(false);
        }

        ticking = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [isHome, isVisible]);

  // メニュー開閉時の body ロック（iOS対策: スクロール位置を保存/復元）
  const lockStateRef = useRef<{ y: number; path: string } | null>(null);
  useEffect(() => {
    if (isMenuOpen) {
      lockStateRef.current = { y: window.scrollY, path: pathname };
      document.body.style.top = `-${lockStateRef.current.y}px`;
      document.body.classList.add("is-locked");
      lenis?.stop();
    } else {
      const locked = lockStateRef.current;
      lockStateRef.current = null;
      document.body.classList.remove("is-locked");
      document.body.style.top = "";
      // 同一ページでメニューを閉じた時だけ位置を復元（ページ遷移時は先頭=0）
      const restoreY = locked && locked.path === pathname ? locked.y : 0;
      // ネイティブのスクロール位置を先に戻してから Lenis を再開する
      // （順序を逆にすると Lenis が 0 を基準にして先頭へ飛ぶ）。
      // body:fixed 中に Lenis がスクロール上限を 0 でキャッシュするため
      // resize() で再計測し、force で確実に復元する。
      window.scrollTo(0, restoreY);
      lenis?.start();
      lenis?.resize();
      lenis?.scrollTo(restoreY, { immediate: true, force: true });
    }
  }, [isMenuOpen, lenis, pathname]);

  // ページ遷移時にメニューを閉じる
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  return (
    <>
      <header
        className={`${styles.header} ${isVisible ? styles.visible : styles.hidden}`}
      >
        <Link href="/" className={styles.logo} onClick={(e) => handleNav(e, "/")}>
          AKASHIKI
        </Link>

        <nav className={styles.nav} aria-label="メインナビゲーション">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`${styles.navLink} ${pathname === href ? styles.active : ""}`}
              onClick={(e) => handleNav(e, href)}
            >
              {label}
            </Link>
          ))}
        </nav>

        <button
          className={`${styles.burger} ${isMenuOpen ? styles.burgerOpen : ""}`}
          onClick={toggleMenu}
          aria-label={isMenuOpen ? "メニューを閉じる" : "メニューを開く"}
          aria-expanded={isMenuOpen}
        >
          <span className={styles.burgerLine} />
          <span className={styles.burgerLine} />
          <span className={styles.burgerLine} />
        </button>
      </header>

      {/* SP フルスクリーンメニュー */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.nav
            className={styles.spMenu}
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0 0)" }}
            exit={{ clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            aria-label="モバイルナビゲーション"
          >
            {NAV_LINKS.map(({ href, label }, i) => (
              <motion.div
                key={href}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{
                  delay: 0.15 + i * 0.06,
                  duration: 0.4,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <Link
                  href={href}
                  className={`${styles.spMenuLink} ${pathname === href ? styles.active : ""}`}
                  onClick={(e) => { setIsMenuOpen(false); handleNav(e, href); }}
                >
                  {label}
                </Link>
              </motion.div>
            ))}
            <div className={styles.spMenuLogo}>AKASHIKI</div>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}
