import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScopePicker } from "./ScopePicker";

function show(
  value: "deny" | "own" | "sub" | "any",
  onChange = vi.fn(),
  disabled = false,
) {
  render(
    <ScopePicker
      value={value}
      onChange={onChange}
      label="Customers — Read"
      disabled={disabled}
    />,
  );
  return { onChange, cell: screen.getByRole("button", { name: /Customers — Read/ }) };
}

const menu = () => screen.getByRole("dialog");
const options = () =>
  within(menu())
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-label") !== "Close");

describe("ScopePicker", () => {
  it("shows the scope it holds", () => {
    const { cell } = show("sub");

    expect(cell).toHaveTextContent("Sub");
  });

  it("says what the current scope means, not just its name", () => {
    // "Sub" alone tells a screen reader nothing about which records it reaches.
    const { cell } = show("sub");

    expect(cell).toHaveAccessibleName(
      "Customers — Read: Own and subordinates' records",
    );
  });

  it("keeps the menu shut until the cell is tapped", () => {
    show("own");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a menu titled for the cell it belongs to", () => {
    const { cell } = show("own");

    fireEvent.click(cell);

    expect(menu()).toHaveAttribute("aria-label", "Customers — Read");
  });

  it("offers all four scopes with what each one grants", () => {
    // The room to explain is the point of the menu over an inline control.
    fireEvent.click(show("deny").cell);

    expect(options().map((o) => o.textContent)).toEqual([
      "DenyNo access",
      "OwnOwn records only",
      "SubOwn and subordinates' records",
      "AnyAll records",
    ]);
  });

  it("marks the one it is on", () => {
    fireEvent.click(show("sub").cell);

    expect(options().map((o) => o.getAttribute("aria-current"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
  });

  it("reports the scope that was picked, and shuts", () => {
    const { onChange, cell } = show("deny");

    fireEvent.click(cell);
    fireEvent.click(screen.getByRole("button", { name: /^AnyAll records$/ }));

    expect(onChange).toHaveBeenCalledWith("any");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shuts without reporting when the scope picked is the current one", () => {
    const { onChange, cell } = show("own");

    fireEvent.click(cell);
    fireEvent.click(screen.getByRole("button", { name: /^OwnOwn records only$/ }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shuts on Escape without changing anything", () => {
    const { onChange, cell } = show("own");

    fireEvent.click(cell);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("paints the cell on the brand scale", () => {
    const tone = (value: "deny" | "own" | "sub" | "any") => {
      const view = render(
        <ScopePicker value={value} onChange={vi.fn()} label="Customers — Read" />,
      );
      const className = view.container.querySelector("button")!.className;
      view.unmount();
      return className;
    };

    expect(tone("any")).toContain("bg-accent");
    expect(tone("sub")).toContain("bg-brand");
    expect(tone("own")).toContain("bg-brand/15");
    expect(tone("deny")).toContain("bg-transparent");
  });

  it("does not open at all when read-only", () => {
    const { cell } = show("own", vi.fn(), true);

    expect(cell).toBeDisabled();
    fireEvent.click(cell);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
