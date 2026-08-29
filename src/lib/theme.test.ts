import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  isTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  THEME_STORAGE_KEY,
} from "./theme";

/** Pins what matchMedia("(prefers-color-scheme: dark)") reports. */
function stubOs(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: dark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("resolveTheme", () => {
  it("follows the operating system on system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("lets an explicit choice beat the operating system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("isTheme", () => {
  it("accepts the three real values", () => {
    expect(["light", "dark", "system"].every(isTheme)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isTheme("blue")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe("readStoredTheme", () => {
  it("defaults to system when nothing is stored", () => {
    expect(readStoredTheme()).toBe("system");
  });

  it("returns what was stored", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("falls back to system on a junk value", () => {
    // An old build, a manual edit, or another app on the same origin.
    localStorage.setItem(THEME_STORAGE_KEY, "solarized");
    expect(readStoredTheme()).toBe("system");
  });

  it("survives storage throwing", () => {
    // Private browsing rejects writes and can reject reads.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readStoredTheme()).toBe("system");
  });
});

describe("storeTheme", () => {
  it("round-trips through readStoredTheme", () => {
    storeTheme("light");
    expect(readStoredTheme()).toBe("light");
  });

  it("does not throw when storage refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => storeTheme("dark")).not.toThrow();
  });
});

describe("applyTheme", () => {
  it("stamps the resolved theme onto the document", () => {
    stubOs(false);
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("resolves system against the operating system", () => {
    stubOs(true);
    expect(applyTheme("system")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("writes a concrete value for system rather than clearing the attribute", () => {
    // The CSS only reasons about light and dark; leaving it unset would make
    // the token rules ambiguous.
    stubOs(false);
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("updates the browser chrome colour", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", "#ffffff");
    document.head.appendChild(meta);

    stubOs(false);
    applyTheme("dark");
    expect(meta.getAttribute("content")).toBe("#121a23");

    applyTheme("light");
    expect(meta.getAttribute("content")).toBe("#ffffff");
  });

  it("does not require the meta tag to exist", () => {
    stubOs(false);
    expect(() => applyTheme("dark")).not.toThrow();
  });
});
