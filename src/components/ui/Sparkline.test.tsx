import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

const pathOf = (container: HTMLElement) =>
  container.querySelector("path")?.getAttribute("d") ?? "";

describe("Sparkline", () => {
  it("renders nothing below two points", () => {
    // One point has no shape, and drawing a dot would imply data it does not have.
    const { container } = render(<Sparkline points={[5]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("draws a segment per interval", () => {
    const { container } = render(<Sparkline points={[1, 5, 2, 8]} />);
    expect(pathOf(container).match(/L/g)).toHaveLength(3);
  });

  it("spans the full width", () => {
    const { container } = render(<Sparkline points={[1, 2, 3]} />);
    const d = pathOf(container);
    expect(d.startsWith("M0.0")).toBe(true);
    expect(d).toContain("64.0");
  });

  it("survives a flat series without dividing by zero", () => {
    // Equal values give a zero range; the guard keeps the path finite.
    const { container } = render(<Sparkline points={[4, 4, 4]} />);
    expect(pathOf(container)).not.toContain("NaN");
  });

  it("adds a closed fill only when asked", () => {
    const plain = render(<Sparkline points={[1, 2]} />).container;
    expect(plain.querySelectorAll("path")).toHaveLength(1);

    const filled = render(<Sparkline points={[1, 2]} area />).container;
    expect(filled.querySelectorAll("path")).toHaveLength(2);
    expect(filled.querySelector("path")?.getAttribute("d")).toContain("Z");
  });
});
