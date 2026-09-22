import type { Metadata } from "next";
import Link from "next/link";
import ScrollReveal from "@/components/animation/ScrollReveal";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "PRIVACY POLICY — AKASHIKI",
  description:
    "AKASHIKI（灯敷）のプライバシーポリシー。個人情報の取り扱いについて。",
  robots: { index: true, follow: true },
  openGraph: {
    images: [{ url: "/api/og?title=PRIVACY+POLICY&sub=AKASHIKI", width: 1200, height: 630 }],
  },
};

const SECTIONS = [
  {
    title: "個人情報の取得について",
    body: "当サイトでは、お問い合わせフォームにおいて、お名前・メールアドレス等の個人情報をご入力いただく場合があります。取得した個人情報は、お問い合わせへの回答のためにのみ使用し、それ以外の目的では使用いたしません。",
  },
  {
    title: "個人情報の第三者提供について",
    body: "取得した個人情報は、法令に基づく場合を除き、ご本人の同意なく第三者に提供することはありません。",
  },
  {
    title: "個人情報の管理について",
    body: "取得した個人情報は、不正アクセス・紛失・漏洩等を防止するため、適切な安全対策を講じます。",
  },
  {
    title: "アクセス解析ツールについて",
    body: "当サイトでは、Googleアナリティクスを使用する場合があります。その際、データ収集のためにCookieを使用しますが、このデータは匿名で収集されており、個人を特定するものではありません。",
  },
];

export default function PrivacyPage() {
  return (
    <main>
      <section className={styles.privacy} aria-label="プライバシーポリシー">
        <div className={styles.inner}>
          <ScrollReveal>
            <h1 className={styles.title}>PRIVACY POLICY</h1>
          </ScrollReveal>

          {SECTIONS.map((section, i) => (
            <ScrollReveal key={i} delay={i * 0.08}>
              <div className={styles.section}>
                <h2 className={styles.heading}>{section.title}</h2>
                <p className={styles.text}>{section.body}</p>
              </div>
            </ScrollReveal>
          ))}

          <ScrollReveal delay={0.4}>
            <div className={styles.section}>
              <h2 className={styles.heading}>お問い合わせ</h2>
              <p className={styles.text}>
                本ポリシーに関するお問い合わせは、
                <Link href="/contact" className={styles.contactLink}>
                  お問い合わせフォーム
                </Link>
                よりご連絡ください。
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </main>
  );
}
