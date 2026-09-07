import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { I18nProvider } from "@/components/I18nProvider";
import { ThemeScript } from "@/components/ThemeScript";
import { requestLang } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "HIG Biz Operation",
    template: "%s · HIG Biz Operation",
  },
  description: "Business operations for HIG.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "HIG Biz Op",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The shell paints to the edges and pads itself with the safe-area insets,
  // which is what makes it read as an app rather than a page.
  viewportFit: "cover",
  // One tag, not two media-scoped ones: an explicit theme choice lives in an
  // attribute, which a media query cannot see. applyTheme() rewrites this.
  themeColor: "#ffffff",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lang = await requestLang();

  return (
    // The pre-paint script writes data-theme and color-scheme onto <html>,
    // which the server cannot predict, so React is told not to treat those as
    // a mismatch. The language is not one of them: it comes from the request's
    // own cookie, so it is right in the HTML before anything is painted.
    <html
      lang={lang}
      data-lang={lang}
      className={`${inter.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        {/*
          Inter has no Khmer. Most phones here ship one — Noto Sans Khmer on
          Android, Khmer Sangam MN on iOS — but a Windows desktop in the office
          often does not, and unmatched Khmer does not degrade gracefully: it
          renders as boxes or as glyphs pulled apart from their marks, which is
          not a language somebody can read around.

          Linked rather than bundled through next/font because the build here
          cannot reach Google; the browser can, and `display=swap` means the
          system face is used until it arrives rather than nothing at all.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* The rule this silences is about pages/_document.js, which this app
            does not have: in the App Router the root layout is the one place a
            font link belongs, and it applies to every page. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-full font-sans antialiased">
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
