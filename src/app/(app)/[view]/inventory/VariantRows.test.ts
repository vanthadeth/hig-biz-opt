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

  it("does not require a barcode", () => {
    // Optional: plenty of stock is sold with nothing printed on the package.
    expect(variantProblem(variant({ barcode: "" }))).toBeNull();
  });

  it("has nothing to say about a price, which belongs to the item now", () => {
    // The variant no longer carries one, so there is no price here to object to.
    expect(variantProblem(variant({ barcode: "8850123456789" }))).toBeNull();
  });
});

describe("duplicateCodes", () => {
  it("finds nothing when every barcode is distinct", () => {
    expect(
      duplicateCodes([
        variant({ barcode: "8850000000001" }),
        variant({ barcode: "8850000000002" }),
      ]).size,
    ).toBe(0);
  });

  it("ignores the rows that carry no barcode at all", () => {
    // Two blanks are not a clash; the unique index skips nulls for this reason.
    expect(duplicateCodes([variant(), variant(), variant()]).size).toBe(0);
  });

  it("catches the same barcode typed into two rows", () => {
    const clashing = duplicateCodes([
      variant({ barcode: "8850123456789" }),
      variant({ barcode: "8850123456789" }),
    ]);
    expect(clashing.has("8850123456789")).toBe(true);
  });

  it("catches it whatever the case, as the index does", () => {
    const clashing = duplicateCodes([
      variant({ barcode: "ABC-001" }),
      variant({ barcode: "abc-001" }),
    ]);
    expect(clashing.has("abc-001")).toBe(true);
  });

  it("ignores surrounding spaces, since the row is trimmed before it is saved", () => {
    const clashing = duplicateCodes([
      variant({ barcode: "8850123456789" }),
      variant({ barcode: "  8850123456789  " }),
    ]);
    expect(clashing.has("8850123456789")).toBe(true);
  });
});
