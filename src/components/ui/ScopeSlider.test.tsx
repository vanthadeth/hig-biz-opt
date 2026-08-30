import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScopeSlider } from "./ScopeSlider";

function show(value: "deny" | "own" | "sub" | "any", onChange = vi.fn(), disabled = false) {
  const { container } = render(
    <ScopeSlider
      value={value}
      onChange={onChange}
      label="Users — Read"
      disabled={disabled}
    />,
  );
  return { container, onChange };
}

const stops = () => screen.getAllByRole("radio");
const group = () => screen.getByRole("radiogroup", { name: "Users — Read" });
const thumb = (container: HTMLElement) =>
  container.querySelector('[aria-hidden="true"]') as HTMLElement;

describe("ScopeSlider", () => {
  it("shows the whole scale at once, least reach first", () => {
    show("own");

    expect(stops().map((s) => s.textContent)).toEqual(["Deny", "Own", "Sub", "Any"]);
  });

  it("marks the stop it is on", () => {
    show("sub");

    expect(stops().map((s) => s.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
  });

  it("moves the thumb to that stop", () => {
    // The thumb's position is the reach, so it has to track the value rather
    // than merely being decorative. Only the multiplier is read back: jsdom
    // folds the `/ 4` into it, so the authored quarters come out as decimals.
    // That the calc is valid CSS at all is checked in a real browser.
    const offset = (value: "deny" | "own" | "sub" | "any") =>
      /\+ ([\d.]+) \*/.exec(thumb(show(value).container).style.left)?.[1];

    expect([offset("deny"), offset("own"), offset("sub"), offset("any")]).toEqual([
      "0",
      "0.25",
      "0.5",
      "0.75",
    ]);
  });

  it("reports the stop that was tapped", () => {
    const { onChange } = show("deny");

    fireEvent.click(screen.getByRole("radio", { name: /^Any/ }));

    expect(onChange).toHaveBeenCalledWith("any");
  });

  it("says nothing when the stop tapped is the one it is on", () => {
    const { onChange } = show("own");

    fireEvent.click(screen.getByRole("radio", { name: /^Own/ }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("walks the scale with the arrow keys", () => {
    const { onChange } = show("own");

    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("sub");

    fireEvent.keyDown(group(), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("deny");
  });

  it("stops at each end rather than wrapping", () => {
    // Wrapping would let a keypress jump from no access to all records.
    const atEnd = show("any");
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(atEnd.onChange).not.toHaveBeenCalled();
  });

  it("jumps to either end with Home and End", () => {
    const { onChange } = show("own");

    fireEvent.keyDown(group(), { key: "End" });
    expect(onChange).toHaveBeenCalledWith("any");

    fireEvent.keyDown(group(), { key: "Home" });
    expect(onChange).toHaveBeenCalledWith("deny");
  });

  it("keeps the group to one stop in the tab order", () => {
    show("sub");

    expect(stops().map((s) => s.getAttribute("tabindex"))).toEqual(["-1", "-1", "0", "-1"]);
  });

  it("says what each stop actually grants", () => {
    show("deny");

    expect(screen.getByRole("radio", { name: "Sub — Own and subordinates' records" }))
      .toBeInTheDocument();
  });

  it("paints the thumb on the brand scale", () => {
    expect(thumb(show("any").container).className).toContain("bg-accent");
    expect(thumb(show("sub").container).className).toContain("bg-brand");
    expect(thumb(show("own").container).className).toContain("bg-brand/15");
    expect(thumb(show("deny").container).className).toContain("bg-surface");
  });

  it("takes neither taps nor keys when read-only", () => {
    const onChange = vi.fn();
    show("own", onChange, true);

    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
    expect(stops()[0]).toBeDisabled();
  });
});
