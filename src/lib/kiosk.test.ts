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
  const alive = (agoMs: number) => kioskCookieValue("sales", now - agoMs, "sess1");
  const view = (value: string | undefined) => readKioskCookie(value, now)?.view ?? null;

  it("holds while something is keeping it alive", () => {
    expect(view(alive(0))).toBe("sales");
    expect(view(alive(60_000))).toBe("sales");
  });

  it("holds through a phone left asleep in somebody's hand", () => {
    // The bug this replaces: the grace was five minutes, a sleeping phone
    // stops the page saying it is there, and pulling the catalogue down to
    // refresh it handed the customer the whole app.
    expect(view(alive(30 * 60 * 1000))).toBe("sales");
    expect(view(alive(4 * 60 * 60 * 1000))).toBe("sales");
  });

  it("carries the browsing session it belongs to", () => {
    expect(readKioskCookie(alive(0), now)?.nonce).toBe("sess1");
  });

  it("is dead once the backstop is past", () => {
    // The browsing session is what normally ends a lock; this is the fallback
    // for a browser that restores the cookie and the session storage together.
    expect(view(alive(KIOSK_GRACE_MS + 1))).toBeNull();
  });

  it("survives a phone closed and opened again straight away", () => {
    // Not an escape hatch: a customer holding the phone can close the app with
    // one gesture, and that must not be the way out.
    expect(view(alive(30_000))).toBe("sales");
  });

  it("is dead the next morning", () => {
    expect(view(alive(20 * 60 * 60 * 1000))).toBeNull();
  });

  it("keeps the view it was locked to", () => {
    expect(view(kioskCookieValue("admin", now, "s"))).toBe("admin");
  });

  it("locks nothing without a cookie", () => {
    expect(readKioskCookie(undefined, now)).toBeNull();
    expect(readKioskCookie("", now)).toBeNull();
  });

  it("locks nothing on a value that is not one of ours", () => {
    // Including both shapes this cookie used to have, so a device carrying an
    // old one starts the ordinary app rather than a catalogue.
    expect(readKioskCookie("sales", now)).toBeNull();
    expect(readKioskCookie(`sales.${now}`, now)).toBeNull();
    expect(readKioskCookie("sales.tomorrow.sess1", now)).toBeNull();
    expect(readKioskCookie(`.${now}.sess1`, now)).toBeNull();
    expect(readKioskCookie(`sales.${now}.`, now)).toBeNull();
  });

  it("tolerates a clock that has drifted a little", () => {
    expect(view(alive(-30_000))).toBe("sales");
  });

  it("refuses a stamp far in the future", () => {
    // A lock that arithmetic could make eternal is worse than one that ends
    // early: the failure that leaves the app usable is the one to prefer.
    expect(view(alive(-(KIOSK_GRACE_MS + 1)))).toBeNull();
  });
});
