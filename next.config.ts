import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Navigation is data-driven: hrefs are assembled at runtime from the module
  // registry in the database, so compile-time route literals do not apply.
  typedRoutes: false,
};

export default nextConfig;
