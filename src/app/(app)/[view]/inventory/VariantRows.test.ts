import { describe, expect, it } from "vitest";
import {
  duplicateCodes,
  emptyVariant,
  variantProblem,
  type VariantDraft,
} from "./VariantRows";

const variant = (over: Partial<VariantDraft> = {}): VariantDraft => ({
  ...emptyVariant(),
  ...over,
});

describe("variantProblem", () => {
  it("says nothing about the bare row a new item starts with", () => {
    expect(variantProblem(emptyVariant())).toBeNull();
  });

  it("objects to half a property", () => {
    expect(variantProblem(variant({ property_name: "Size" }))).toContain("no value");
    expect(variantProblem(variant({ property_value: "500 ml" }))).toContain("no property name");
  });

  it("is silent on a complete property", () => {
    expect(
      variantProblem(variant({ property_name: "Size", property_value: "500 ml" })),
    ).toBeNull();
  });

  it("still catches a price that is not a number", () => {
    expect(variantProblem(variant({ price_usd: "abc" }))).toContain("dollar price");
    expect(variantProblem(variant({ price_khr: "abc" }))).toContain("riel price");
  });

  it("does not require a code or a barcode", () => {
    // Both are optional: plenty of stock is sold without either.
    expect(variantProblem(variant({ code: "", barcode: "" }))).toBeNull();
  });
});

describe("duplicateCodes", () => {
  it("finds nothing when every code is distinct", () => {
    expect(
      duplicateCodes([
        variant({ code: "HIG-001", barcode: "8850000000001" }),
        variant({ code: "HIG-002", barcode: "8850000000002" }),
      ]).size,
    ).toBe(0);
  });

  it("ignores the rows that carry no code at all", () => {
    // Two blanks are not a clash; the unique indexes skip nulls for this reason.
    expect(duplicateCodes([variant(), variant(), variant()]).size).toBe(0);
  });

  it("catches the same code typed into two rows", () => {
    const clashing = duplicateCodes([
      variant({ code: "HIG-001" }),
      variant({ code: "HIG-001" }),
    ]);
    expect(clashing.has("hig-001")).toBe(true);
  });

  it("catches it whatever the case, as the index does", () => {
    const clashing = duplicateCodes([
      variant({ code: "HIG-001" }),
      variant({ code: "hig-001" }),
    ]);
    expect(clashing.has("hig-001")).toBe(true);
  });

  it("catches a repeated barcode too", () => {
    const clashing = duplicateCodes([
      variant({ barcode: "8850123456789" }),
      variant({ barcode: "8850123456789" }),
    ]);
    expect(clashing.has("8850123456789")).toBe(true);
  });

  it("catches a code that collides with a barcode", () => {
    // They share one namespace on the shelf even though the database keeps two
    // indexes: scanning a barcode that is also somebody's item code is exactly
    // the ambiguity worth refusing.
    const clashing = duplicateCodes([
      variant({ code: "12345" }),
      variant({ barcode: "12345" }),
    ]);
    expect(clashing.has("12345")).toBe(true);
  });

  it("ignores surrounding spaces, since the row is trimmed before it is saved", () => {
    const clashing = duplicateCodes([
      variant({ code: "HIG-001" }),
      variant({ code: "  HIG-001  " }),
    ]);
    expect(clashing.has("hig-001")).toBe(true);
  });
});
