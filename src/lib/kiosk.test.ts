import { describe, expect, it } from "vitest";
import {
  isPinShaped,
  KIOSK_GRACE_MS,
  kioskAllows,
  kioskCookieValue,
  kioskLandingPath,
  pinAttemptsMessage,
  readKioskCookie,
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

describe("how long a lock lives", () => {
  const now = 1_800_000_000_000;
  const alive = (agoMs: number) => kioskCookieValue("sales", now - agoMs);

  it("holds while something is keeping it alive", () => {
    expect(readKioskCookie(alive(0), now)).toBe("sales");
    expect(readKioskCookie(alive(60_000), now)).toBe("sales");
  });

  it("is dead once nothing has kept it alive", () => {
    // The whole promise. Nothing said this lock was still in somebody's hands,
    // so it is not one — whatever the browser restored.
    expect(readKioskCookie(alive(KIOSK_GRACE_MS + 1), now)).toBeNull();
  });

  it("survives a phone closed and opened again straight away", () => {
    // Not an escape hatch: a customer holding the phone can close the app with
    // one gesture, and that must not be the way out.
    expect(readKioskCookie(alive(30_000), now)).toBe("sales");
  });

  it("is dead the next morning", () => {
    expect(readKioskCookie(alive(14 * 60 * 60 * 1000), now)).toBeNull();
  });

  it("keeps the view it was locked to", () => {
    expect(readKioskCookie(kioskCookieValue("admin", now), now)).toBe("admin");
  });

  it("locks nothing without a cookie", () => {
    expect(readKioskCookie(undefined, now)).toBeNull();
    expect(readKioskCookie("", now)).toBeNull();
  });

  it("locks nothing on a value that is not one of ours", () => {
    // Including the shape this cookie used to have, so a device carrying an
    // old one starts the ordinary app rather than a catalogue.
    expect(readKioskCookie("sales", now)).toBeNull();
    expect(readKioskCookie("sales.tomorrow", now)).toBeNull();
    expect(readKioskCookie(".123", now)).toBeNull();
  });

  it("tolerates a clock that has drifted a little", () => {
    expect(readKioskCookie(alive(-30_000), now)).toBe("sales");
  });

  it("refuses a stamp far in the future", () => {
    // A lock that arithmetic could make eternal is worse than one that ends
    // early: the failure that leaves the app usable is the one to prefer.
    expect(readKioskCookie(alive(-(KIOSK_GRACE_MS + 1)), now)).toBeNull();
  });
});
