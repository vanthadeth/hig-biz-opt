import { describe, expect, it } from "vitest";
import { fitWithin, MAX_EDGE } from "./photo";

describe("fitWithin", () => {
  it("caps the long edge and keeps the shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1280, height: 960 });
  });

  it("works the same way for a portrait photo", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 960, height: 1280 });
  });

  it("leaves a picture smaller than the cap alone", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("does not blow a small picture up to the cap", () => {
    const { width } = fitWithin(200, 100);

    expect(width).toBeLessThan(MAX_EDGE);
  });

  it("never rounds an edge down to nothing", () => {
    expect(fitWithin(4000, 1).height).toBe(1);
  });

  it("survives a zero-sized image rather than dividing by it", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });
});
