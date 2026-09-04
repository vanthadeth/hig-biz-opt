import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the `@/*` alias straight from tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    // Everything under test is a pure function, but two of them read `window`
    // to decide whether they are inside Telegram, so they need a document to
    // not be inside.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
