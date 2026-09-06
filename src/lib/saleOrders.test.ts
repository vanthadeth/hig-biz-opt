import { describe, expect, it } from "vitest";
import { orderDate } from "./saleOrders";

describe("the date an order was placed", () => {
  it("is a day, not a moment", () => {
    // Nobody scanning a list of orders is choosing between two placed eleven
    // minutes apart, and a timestamp that precise reads as machinery.
    //
    // Matched rather than compared: en-GB abbreviates September as "Sep" or
    // "Sept" depending on the locale data the runtime shipped with, and a test
    // that breaks when Node updates ICU is testing Node.
    expect(orderDate("2026-09-06T14:31:07.000Z")).toMatch(/^6 Sept? 2026$/);
  });

  it("says nothing rather than Invalid Date", () => {
    expect(orderDate("not a date")).toBe("—");
    expect(orderDate("")).toBe("—");
  });
});
