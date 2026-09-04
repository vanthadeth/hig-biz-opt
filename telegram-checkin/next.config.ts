import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project sits beside the web app inside one repository, so Turbopack
  // finds two lockfiles and picks the outer one — which makes it treat the web
  // app's src/ as ours and try to compile its proxy.ts against our aliases.
  // Naming the root ends that.
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },

  // Telegram Web loads a Mini App in an iframe, so nothing here may send
  // X-Frame-Options: DENY. Next sends no framing header by default; if a
  // Content-Security-Policy is ever added, frame-ancestors has to name
  // https://web.telegram.org, or the app goes blank on the web and desktop
  // clients while still working on phones.
  typedRoutes: false,
};

export default nextConfig;
