import { describe, expect, it } from "vitest";
import {
  orderCustomerWhere,
  orderDate,
  orderedLines,
  orderLineDiscount,
  type SaleOrderLineRow,
} from "./saleOrders";

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

describe("how a line's discount is written back", () => {
  const line = (
    discount_mode: "percent" | "amount",
    discount_percent: number,
    discount_amount: number,
  ) => ({ discount_mode, discount_percent, discount_amount });

  it("says a percent as a percent", () => {
    expect(orderLineDiscount(line("percent", 10, 0))).toBe("10% off");
  });

  it("says money as money, with what it came to beside it", () => {
    // Rewriting "two dollars off" as "2%" is telling somebody they said
    // something they did not.
    expect(orderLineDiscount(line("amount", 2, 2))).toBe("$2.00 off · 2%");
  });

  it("says nothing where there was no discount", () => {
    expect(orderLineDiscount(line("percent", 0, 0))).toBeNull();
    expect(orderLineDiscount(line("amount", 0, 0))).toBeNull();
  });

  it("drops the trailing zeros a machine would leave", () => {
    expect(orderLineDiscount(line("percent", 12.5, 0))).toBe("12.5% off");
  });
});

describe("an order's lines", () => {
  const line = (id: string, sort_order: number) =>
    ({ id, sort_order }) as SaleOrderLineRow;

  it("read in the order they were written", () => {
    // The order is the record; a list that reshuffles itself between two
    // people reading it is not one.
    expect(orderedLines([line("c", 3), line("a", 1), line("b", 2)]).map((l) => l.id)).toEqual(
      ["a", "b", "c"],
    );
  });

  it("does not mind an empty order", () => {
    expect(orderedLines([])).toEqual([]);
  });
});

describe("where the customer was", () => {
  it("joins what was filled in and skips what was not", () => {
    expect(
      orderCustomerWhere({
        street_address: "12 Street 271",
        district_text: null,
        province_text: "Phnom Penh",
      }),
    ).toBe("12 Street 271, Phnom Penh");
  });

  it("says nothing for an address nobody recorded", () => {
    expect(
      orderCustomerWhere({
        street_address: null,
        district_text: null,
        province_text: null,
      }),
    ).toBeNull();
  });

  it("says nothing for a customer who is gone", () => {
    expect(orderCustomerWhere(null)).toBeNull();
  });
});
