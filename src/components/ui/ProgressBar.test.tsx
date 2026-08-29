import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

const bar = () => screen.getByRole("progressbar");

describe("ProgressBar", () => {
  it("reports its value to assistive technology", () => {
    render(<ProgressBar value={45} label="Progress" />);
    expect(bar()).toHaveAttribute("aria-valuenow", "45");
  });

  it("clamps above one hundred", () => {
    render(<ProgressBar value={140} label="Progress" />);
    expect(bar()).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps below zero", () => {
    render(<ProgressBar value={-20} label="Progress" />);
    expect(bar()).toHaveAttribute("aria-valuenow", "0");
  });

  it("rounds fractional values", () => {
    render(<ProgressBar value={45.6} label="Progress" />);
    expect(bar()).toHaveAttribute("aria-valuenow", "46");
  });

  it("stays labelled even without a visible label", () => {
    render(<ProgressBar value={10} />);
    expect(bar()).toHaveAttribute("aria-label", "Progress");
  });
});
