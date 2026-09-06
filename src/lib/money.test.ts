import { describe, expect, it } from "vitest";
import {
  asCurrency,
  isFallback,
  moneyIn,
  priceIn,
  totalIn,
  CURRENCY_NAME,
  CURRENCY_SYMBOL,
} from "./money";

const both = { usd: 13, khr: 53_000 };

describe("showing one currency", () => {
  it("shows the one the organisation quotes in", () => {
    // The point of the whole setting: a rep holding the phone out to a
    // shopkeeper wants one number on it, not a pair with a dot between them.
    expect(moneyIn(both, "usd")).toBe("$13.00");
    expect(moneyIn(both, "khr")).toBe("៛53,000");
  });

  it("falls back to the other rather than showing nothing", () => {
    // A price somebody cannot see is a sale they cannot make. The symbol in
    // front of the figure is what says which currency it turned out to be.
    expect(moneyIn({ usd: null, khr: 8000 }, "usd")).toBe("៛8,000");
    expect(moneyIn({ usd: 1.25, khr: null }, "khr")).toBe("$1.25");
  });

  it("has nothing to say when neither was priced", () => {
    expect(moneyIn({ usd: null, khr: null }, "usd")).toBeNull();
  });

  it("never adds the two together, or converts between them", () => {
    // There is no rate in this app. Whatever comes back is one of the two
    // numbers that were already stored.
    expect(moneyIn(both, "usd")).not.toContain("៛");
    expect(moneyIn(both, "khr")).not.toContain("$");
  });

  it("says which figures are a fallback, for a screen that wants to mark it", () => {
    expect(isFallback({ usd: null, khr: 8000 }, "usd")).toBe(true);
    expect(isFallback(both, "usd")).toBe(false);
    expect(isFallback({ usd: null, khr: null }, "usd")).toBe(false);
  });
});

describe("the sentence around the figure", () => {
  it("says a missing price the way a price is missing", () => {
    expect(priceIn({ price_usd: null, price_khr: null }, "usd")).toBe("No price yet");
    expect(priceIn({ price_usd: 0.5, price_khr: 2000 }, "khr")).toBe("៛2,000");
  });

  it("says a missing total the way a total is missing", () => {
    // Different sentence: an empty cart has no price to be missing.
    expect(totalIn({ usd: null, khr: null }, "usd")).toBe("—");
    expect(totalIn(both, "usd")).toBe("$13.00");
  });
});

describe("reading the setting back", () => {
  it("takes riel when riel was stored", () => {
    expect(asCurrency("khr")).toBe("khr");
  });

  it("takes dollars for anything else, rather than throwing on a screen", () => {
    // A settings row that cannot be understood is a reason to show dollars,
    // not a reason to show nothing.
    expect(asCurrency("usd")).toBe("usd");
    expect(asCurrency(null)).toBe("usd");
    expect(asCurrency("euro")).toBe("usd");
  });

  it("has a name and a symbol for each", () => {
    expect(CURRENCY_NAME.khr).toBe("Riel");
    expect(CURRENCY_SYMBOL.khr).toBe("៛");
    expect(CURRENCY_SYMBOL.usd).toBe("$");
  });
});
