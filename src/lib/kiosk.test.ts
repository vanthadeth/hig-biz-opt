import { describe, expect, it } from "vitest";
import {
  isPinShaped,
  kioskAllows,
  kioskLandingPath,
  pinAttemptsMessage,
} from "./kiosk";

describe("what a locked device may reach", () => {
  it("allows the catalogue it was locked on", () => {
    expect(kioskAllows("/sales/products", "sales")).toBe(true);
  });

  it("and anything beneath it", () => {
    expect(kioskAllows("/sales/products/abc-123", "sales")).toBe(true);
  });

  it("allows the endpoints that end the lock", () => {
    // Without these there is no way out, which would make the lock a trap
    // rather than a lock.
    expect(kioskAllows("/api/kiosk/exit", "sales")).toBe(true);
  });

  it("refuses everything else in the same view", () => {
    expect(kioskAllows("/sales/customers", "sales")).toBe(false);
    expect(kioskAllows("/sales/home", "sales")).toBe(false);
    expect(kioskAllows("/sales/profile", "sales")).toBe(false);
  });

  it("refuses another view's catalogue", () => {
    // Otherwise the lock is escaped by editing one word of the address.
    expect(kioskAllows("/admin/products", "sales")).toBe(false);
  });

  it("refuses a path that merely starts the same way", () => {
    expect(kioskAllows("/sales/products-report", "sales")).toBe(false);
  });

  it("is an allow-list, so tomorrow's route is shut by default", () => {
    expect(kioskAllows("/sales/anything-new", "sales")).toBe(false);
    expect(kioskAllows("/api/sync/tick", "sales")).toBe(false);
  });

  it("knows where to send somebody back to", () => {
    expect(kioskLandingPath("sales")).toBe("/sales/products");
  });
});

describe("the PIN", () => {
  it("is four digits", () => {
    expect(isPinShaped("4821")).toBe(true);
  });

  it("and nothing else", () => {
    expect(isPinShaped("482")).toBe(false);
    expect(isPinShaped("48210")).toBe(false);
    expect(isPinShaped("48a1")).toBe(false);
    expect(isPinShaped("")).toBe(false);
    expect(isPinShaped(" 4821")).toBe(false);
  });

  it("says how many tries are left before it locks", () => {
    // Somebody two wrong tries in should know they are close, rather than
    // finding out at the moment it happens.
    expect(pinAttemptsMessage(2)).toBe("That PIN is wrong. 2 tries left.");
    expect(pinAttemptsMessage(1)).toBe(
      "That PIN is wrong. One more try before it locks.",
    );
    expect(pinAttemptsMessage(0)).toBe("That PIN is wrong.");
  });
});
