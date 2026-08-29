import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScopeCell } from "./ScopeCell";

describe("ScopeCell", () => {
  it("shows the scope it holds", () => {
    render(<ScopeCell value="sub" onChange={vi.fn()} label="Users — Read" />);

    expect(screen.getByRole("button")).toHaveTextContent("Sub");
  });

  it("advances one step on tap", () => {
    const onChange = vi.fn();
    render(<ScopeCell value="own" onChange={onChange} label="Users — Read" />);

    fireEvent.click(screen.getByRole("button"));

    expect(onChange).toHaveBeenCalledWith("sub");
  });

  it("wraps from the widest reach back to deny", () => {
    const onChange = vi.fn();
    render(<ScopeCell value="any" onChange={onChange} label="Users — Read" />);

    fireEvent.click(screen.getByRole("button"));

    expect(onChange).toHaveBeenCalledWith("deny");
  });

  it("names the column, the current reach and the next one", () => {
    // "Own" on its own tells a screen reader neither which column it is in nor
    // what a tap would do.
    render(<ScopeCell value="own" onChange={vi.fn()} label="Users — Read" />);

    expect(screen.getByRole("button")).toHaveAccessibleName(
      "Users — Read: Own records only. Change to own and subordinates' records.",
    );
  });

  it("drops the change hint and refuses the tap when read-only", () => {
    const onChange = vi.fn();
    render(
      <ScopeCell value="own" onChange={onChange} label="Users — Read" disabled />,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName("Users — Read: Own records only.");

    fireEvent.click(button);
    expect(onChange).not.toHaveBeenCalled();
  });
});
