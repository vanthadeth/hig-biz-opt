import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
  // clearAllMocks only wipes call history; without this a spy's replacement
  // implementation leaks into the next test in the file.
  vi.restoreAllMocks();
  // The Telegram and geolocation tests both stub globals, and a leaked
  // window.Telegram would make the next file's "outside Telegram" case pass
  // for the wrong reason.
  vi.unstubAllGlobals();
});
