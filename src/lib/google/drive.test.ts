import { describe, expect, it } from "vitest";
import { driveFileIdFrom } from "./drive";

describe("driveFileIdFrom", () => {
  it("reads the id out of a file sharing link", () => {
    expect(
      driveFileIdFrom("https://drive.google.com/file/d/1AbC-XyZ_01234567890123/view?usp=sharing"),
    ).toBe("1AbC-XyZ_01234567890123");
  });

  it("reads the id out of an open?id= link", () => {
    expect(driveFileIdFrom("https://drive.google.com/open?id=1AbC-XyZ_01234567890123")).toBe(
      "1AbC-XyZ_01234567890123",
    );
  });

  it("accepts a bare id, which is what somebody who knows it will paste", () => {
    expect(driveFileIdFrom("1AbC-XyZ_01234567890123")).toBe("1AbC-XyZ_01234567890123");
  });

  it("trims surrounding whitespace", () => {
    expect(driveFileIdFrom("  1AbC-XyZ_01234567890123  ")).toBe("1AbC-XyZ_01234567890123");
  });

  it("refuses an empty cell", () => {
    expect(driveFileIdFrom("")).toBeNull();
    expect(driveFileIdFrom("   ")).toBeNull();
  });

  it("refuses text too short to plausibly be a file id", () => {
    expect(driveFileIdFrom("snacks")).toBeNull();
  });
});
