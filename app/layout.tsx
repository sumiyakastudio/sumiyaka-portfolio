import type { Metadata, Viewport } from "next";
import {
  Barlow,
  Noto_Sans_JP,
  IBM_Plex_Mono,
  Anton,
  Shippori_Mincho,
  Zen_Kaku_Gothic_New,
} from "next/font/google";
import SmoothScroll from "@/components/animation/SmoothScroll";
import InkTransitionProvider from "@/components/animation/InkTransition";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { SITE_ORIGIN } from "@/lib/site";
import "./globals.css";
import "./theme-top.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "600", "800"],
  display: "swap",
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["100", "300", "400", "500", "700"],
  display: "swap",
  preload: false,
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["300", "400"],
  display: "swap",
});

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

// トップページ用フォント（見出し=Shippori Mincho／本文=Zen Kaku）。既存4フォントはサブページが使用中のため残す。
// 日本語フォント（Noto Sans JP・Shippori Mincho・Zen Kaku）は preload: false（2026-10-05）。
// 日本語は約120分割の全ファイルが先読みされ、初回表示で約14.8MB・613本を取得していた（受け入れ検査 A-1）。
// 先読みをやめると、ブラウザはページで使う文字の分割ファイルだけを取得する。
const shipporiMincho = Shippori_Mincho({
  variable: "--font-shippori-mincho",
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
  display: "swap",
  preload: false,
});

const zenKakuGothicNew = Zen_Kaku_Gothic_New({
  variable: "--font-zen-kaku",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "墨家 / SUMIYAKA — バラバラな事務作業を、ひとりでに回る仕組みに変えます。",
    template: "%s",
  },
  description:
    "AIスペシャリスト 墨家 / SUMIYAKA。御社の仕事のやり方をAIに教え込み、社員の方が自分で回せる状態まで伴走します。業務の自動化・ツール開発、Web制作も、設計から公開まで一人で。灯敷（AKASHIKI）。",
  // og:image 等の相対URLの解決基準。実際に到達できるオリジンでないとOGカードが取得されない。
  // canonical / sitemap は akashiki.com のまま（ブランドの本命ドメイン）。
  metadataBase: new URL(SITE_ORIGIN),
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "墨家 / SUMIYAKA — 灯敷（AKASHIKI）",
    title: "墨家 / SUMIYAKA — バラバラな事務作業を、ひとりでに回る仕組みに変えます。",
    description:
      "AIスペシャリスト 墨家 / SUMIYAKA。御社の仕事のやり方をAIに教え込み、社員の方が自分で回せる状態まで伴走します。業務の自動化・ツール開発、Web制作も、設計から公開まで一人で。",
    // canonical と同様、"./" でページ自身のURLに解決させる。
    url: "./",
    images: [
      {
        // /api/og は日本語フォント搭載済み（Geist + Noto Sans JP）。題字は英字ブランド表記・sub は P9 の宣言（旧 Web Design & Development Portfolio は撤去）
        url: `/api/og?title=AKASHIKI&sub=${encodeURIComponent("新人を育てるように、御社のAIを育てます。")}`,
        width: 1200,
        height: 630,
        alt: "墨家 / SUMIYAKA — 灯敷（AKASHIKI）",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@sumiyakastudio",
    creator: "@sumiyakastudio",
    description:
      "AIスペシャリスト 墨家 / SUMIYAKA。御社の仕事のやり方をAIに教え込み、社員の方が自分で回せる状態まで伴走します。業務の自動化・ツール開発、Web制作も、設計から公開まで一人で。",
  },
  alternates: {
    // "./" は metadataBase を基準に「そのページ自身のURL」へ解決される。
    // 固定URLを書くと全ページがトップの重複として扱われ、下層がインデックスされない。
    canonical: "./",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1f1c1c",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${barlow.variable} ${notoSansJP.variable} ${ibmPlexMono.variable} ${anton.variable} ${shipporiMincho.variable} ${zenKakuGothicNew.variable}`}
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            // P9（2026-08-27）＝Organization の description 置換＋Person を同じ <script> 配列に追加
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "灯敷（AKASHIKI）",
                alternateName: "墨家 / SUMIYAKA",
                url: "https://akashiki.com",
                description:
                  "AIスペシャリスト。中小企業の仕事のやり方をAIに教え込み、社員が自分で回せる状態まで伴走する。AI導入の設計・教育、業務の自動化・ツール開発、Web制作を、企画から実装・公開まで一人で一貫して提供。",
                sameAs: ["https://github.com/sumiyakastudio"],
                contactPoint: {
                  "@type": "ContactPoint",
                  contactType: "customer service",
                  url: "https://akashiki.com/contact",
                  availableLanguage: ["Japanese"],
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "Person",
                name: "墨家 / SUMIYAKA",
                alternateName: "SUMIYAKA",
                url: "https://akashiki.com/about",
                jobTitle: "AIスペシャリスト",
                description:
                  "中小企業の仕事のやり方をAIに教え込み、社員が自分で回せる状態まで伴走する。大手美容外科クリニックで社内・院内SEを7年。設計から実装・公開まで一人で。",
                knowsAbout: [
                  "AI導入の設計・教育",
                  "業務の自動化・ツール開発",
                  "Excel・CSV・PDFの統合と帳票生成",
                  "Web制作",
                  "システム運用・セキュリティ",
                ],
                worksFor: {
                  "@type": "Organization",
                  name: "灯敷（AKASHIKI）",
                  url: "https://akashiki.com",
                },
                sameAs: ["https://github.com/sumiyakastudio"],
              },
            ]),
          }}
        />
        <InkTransitionProvider>
          <SmoothScroll>
            <Header />
            {children}
            {modal}
            <Footer />
          </SmoothScroll>
        </InkTransitionProvider>
      </body>
    </html>
  );
}
