import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "HIG Check-in",
  description: "Check in and out, with your location and a photo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          beforeInteractive, because the page reads window.Telegram on mount to
          decide what to show. Loaded any later and the first render would
          always be the outside-Telegram one, and would then flip.
        */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
