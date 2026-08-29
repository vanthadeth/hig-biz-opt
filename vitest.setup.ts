import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // clearAllMocks only wipes call history; without this a spy's replacement
  // implementation leaks into the next test in the file.
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// next/navigation has no router in jsdom. Tests that care about the path set
// `mockPathname`; `redirect` and `notFound` throw the way Next's do, so a
// component that calls them stops executing.
export const mockPathname = { current: "/" };

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
