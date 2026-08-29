import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/** Captures the change listener so an OS theme flip can be simulated. */
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

const option = (name: string) => screen.getByRole("radio", { name });
const isActive = (name: string) => option(name).getAttribute("aria-checked") === "true";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  stubOs(false);
});

describe("ThemeSwitcher", () => {
  it("offers light, dark and auto", () => {
    render(<ThemeSwitcher />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(option("Light")).toBeInTheDocument();
    expect(option("Dark")).toBeInTheDocument();
    expect(option("Auto")).toBeInTheDocument();
  });

  it("starts on Auto when nothing has been chosen", () => {
    render(<ThemeSwitcher />);
    expect(isActive("Auto")).toBe(true);
    expect(isActive("Light")).toBe(false);
  });

  it("marks the stored preference as active", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeSwitcher />);
    expect(isActive("Dark")).toBe(true);
    expect(isActive("Auto")).toBe(false);
  });

  it("applies and remembers a choice", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await user.click(option("Dark"));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(isActive("Dark")).toBe(true);
  });

  it("lets an explicit light choice beat a dark operating system", () => {
    stubOs(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeSwitcher />);
    expect(isActive("Light")).toBe(true);
  });

  it("follows the operating system while on Auto", async () => {
    render(<ThemeSwitcher />);
    expect(isActive("Auto")).toBe(true);

    // The phone flips to dark at sunset, with nobody touching the app.
    expect(osListeners.length).toBeGreaterThan(0);
    osListeners.forEach((cb) => cb({ matches: true }));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("stops following the operating system once a choice is made", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);
    await user.click(option("Light"));

    // The listener is torn down, so a later OS flip must not override the choice.
    osListeners.forEach((cb) => cb({ matches: true }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
