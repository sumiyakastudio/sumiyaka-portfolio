import type { Metadata } from "next";
import SubPageFVAnim from "@/components/animation/SubPageFVAnim";
import ContactLantern from "@/components/fv/contact/ContactLantern";
import ContactForm from "@/components/contact/ContactForm";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "CONTACT — AKASHIKI | お問い合わせ",
  description:
    "AKASHIKI（灯敷）へのお問い合わせ。業務の自動化・AI導入から、LP・コーポレートサイトなどのWeb制作まで、お気軽にどうぞ。",
  robots: { index: true, follow: true },
  openGraph: {
    images: [{ url: "/api/og?title=CONTACT&sub=%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B", width: 1200, height: 630 }],
  },
};

/**
 * /contact — 五彩「焦（こげ）＝灯」（黒9.5:白0.5）
 * 最も暗い地に一点の灯。FV は吊られた裸電球と、その光で照らされた題字。
 * その下に、灯の光が落ちる机と一枚の紙（フォーム）。
 */
export default function ContactPage() {
  return (
    <main className={styles.main}>
      {/* ========== FV — 100vh（customEntrance：灯がともる独自入場） ========== */}
      <SubPageFVAnim className={styles.fv} customEntrance>
        <ContactLantern />
      </SubPageFVAnim>

      {/* ========== 机の上の一枚の紙（フォーム） ========== */}
      <section className={styles.formSection} aria-label="お問い合わせフォーム">
        <div className={styles.desk} data-contact-desk>
          <div className={styles.paper}>
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  );
}
