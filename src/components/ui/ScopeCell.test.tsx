import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScopeCell } from "./ScopeCell";

const cell = () => screen.getByRole("combobox");

describe("ScopeCell", () => {
  it("shows the scope it holds", () => {
    render(<ScopeCell value="sub" onChange={vi.fn()} label="Users — Read" />);

    expect(cell()).toHaveValue("sub");
    expect(screen.getByRole("option", { name: "Sub" })).toBeInTheDocument();
  });

  it("offers all four scopes at once", () => {
    // The point of the dropdown over the old tap-to-cycle: one decision rather
    // than a count of taps.
    render(<ScopeCell value="deny" onChange={vi.fn()} label="Users — Read" />);

    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Deny",
      "Own",
      "Sub",
      "Any",
    ]);
  });

  it("reports the scope that was picked", () => {
    const onChange = vi.fn();
    render(<ScopeCell value="own" onChange={onChange} label="Users — Read" />);

    fireEvent.change(cell(), { target: { value: "any" } });

    expect(onChange).toHaveBeenCalledWith("any");
  });

  it("can be set back to deny", () => {
    const onChange = vi.fn();
    render(<ScopeCell value="any" onChange={onChange} label="Users — Read" />);

    fireEvent.change(cell(), { target: { value: "deny" } });

    expect(onChange).toHaveBeenCalledWith("deny");
  });

  it("names the column and what the current reach means", () => {
    // "Own" alone tells a screen reader neither which column it is in nor what
    // the value actually grants.
    render(<ScopeCell value="own" onChange={vi.fn()} label="Users — Read" />);

    expect(cell()).toHaveAccessibleName("Users — Read: Own records only");
  });

  it("colours by reach, all from the brand: green for any, blue for own and sub, no fill for deny", () => {
    const tone = (value: "deny" | "own" | "sub" | "any") => {
      const { container, unmount } = render(
        <ScopeCell value={value} onChange={vi.fn()} label="Users — Read" />,
      );
      const className = container.firstElementChild!.className;
      unmount();
      return className;
    };

    expect(tone("any")).toContain("bg-accent");
    expect(tone("sub")).toContain("bg-brand");
    expect(tone("own")).toContain("bg-brand/15");
    expect(tone("deny")).toContain("bg-transparent");
  });

  it("is disabled when read-only", () => {
    // Only the attribute is asserted: jsdom will dispatch a change on a
    // disabled control that no browser would let a person touch, so firing one
    // here would test the fake rather than the component. What actually stops
    // the write either way is the row level security policy behind it.
    render(<ScopeCell value="own" onChange={vi.fn()} label="Users — Read" disabled />);

    expect(cell()).toBeDisabled();
  });
});
