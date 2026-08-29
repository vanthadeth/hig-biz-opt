import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

let osListeners: ((e: { matches: boolean }) => void)[] = [];

function stubOs(dark: boolean) {
  osListeners = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: dark,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
        osListeners.push(cb),
      removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        osListeners = osListeners.filter((l) => l !== cb);
      },
    })),
  );
}

const button = () => screen.getByRole("button");
const label = () => button().getAttribute("aria-label") ?? "";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  stubOs(false);
});

describe("ThemeToggle", () => {
  it("starts on Auto when nothing has been chosen", () => {
    render(<ThemeToggle />);
    expect(label()).toContain("Theme: Auto");
  });

  it("says what the next tap will do", () => {
    // A cycling control is only predictable if it announces where it goes.
    render(<ThemeToggle />);
    expect(label()).toContain("Switch to light");
  });

  it("cycles light, dark, auto and back", async () => {
    const user = userEvent.setup();
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);

    expect(label()).toContain("Theme: Light");
    await user.click(button());
    expect(label()).toContain("Theme: Dark");
    await user.click(button());
    expect(label()).toContain("Theme: Auto");
    await user.click(button());
    expect(label()).toContain("Theme: Light");
  });

  it("paints the choice onto the document", async () => {
    const user = userEvent.setup();
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);

    await user.click(button());
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("remembers the choice", async () => {
    const user = userEvent.setup();
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);

    await user.click(button());
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("resolves Auto against the operating system", async () => {
    const user = userEvent.setup();
    stubOs(true);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);

    // dark -> system, and the system is dark
    await user.click(button());
    expect(label()).toContain("Theme: Auto");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("follows the operating system while on Auto", () => {
    render(<ThemeToggle />);
    expect(osListeners.length).toBeGreaterThan(0);

    osListeners.forEach((cb) => cb({ matches: true }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("stops following once a theme is chosen", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(button()); // Auto -> Light

    osListeners.forEach((cb) => cb({ matches: true }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
