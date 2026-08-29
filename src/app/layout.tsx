import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeScript } from "@/components/ThemeScript";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The pre-paint script writes data-theme and color-scheme onto <html>, which
    // the server cannot predict, so React is told not to treat it as a mismatch.
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
