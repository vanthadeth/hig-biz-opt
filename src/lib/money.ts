/**
 * Which of the two prices a screen shows.
 *
 * HIG prices in dollars and in riel, held separately because there is no rate
 * here and this app will not invent one. That is right for storage and wrong
 * for a screen: a rep holding a phone out to a shopkeeper wants one number on
 * it, in the currency that shop pays in — not a pair with a dot between them
 * for the customer to pick from.
 *
 * Nothing here converts anything. It chooses between two numbers that already
 * exist, and falls back to the other one when the chosen one was never set,
 * because a price somebody cannot see is a sale they cannot make. The symbol in
 * front of the figure is what says which currency it turned out to be.
 */

import { formatKhr, formatUsd } from "@/lib/inventory";

export type Currency = "usd" | "khr";

export const CURRENCIES: Currency[] = ["usd", "khr"];

export const CURRENCY_NAME: Record<Currency, string> = {
  usd: "US dollar",
  khr: "Riel",
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  usd: "$",
  khr: "៛",
};

/** The one this app quotes in when nobody has said otherwise. */
export const DEFAULT_CURRENCY: Currency = "usd";

/** Reads whatever the database returned back into the type, safely. */
export function asCurrency(value: unknown): Currency {
  return value === "khr" ? "khr" : "usd";
}

export type Amounts = { usd: number | null; khr: number | null };

/**
 * One figure, in the chosen currency where there is one.
 *
 * Null when neither currency has a figure — the caller decides whether that
 * reads as "no price yet" or as a dash, because those are different sentences.
 */
export function moneyIn(amounts: Amounts, currency: Currency): string | null {
  const chosen = currency === "usd" ? formatUsd(amounts.usd) : formatKhr(amounts.khr);
  if (chosen !== null) return chosen;

  // Priced in the other one only. Shown rather than hidden: hiding it would
  // take an item nobody can sell and make it look like an item with no price.
  return currency === "usd" ? formatKhr(amounts.khr) : formatUsd(amounts.usd);
}

/** An item's price, said the way a price is said when there is not one. */
export function priceIn(
  item: { price_usd: number | null; price_khr: number | null },
  currency: Currency,
): string {
  return moneyIn({ usd: item.price_usd, khr: item.price_khr }, currency) ?? "No price yet";
}

/** A total, said the way a total is said when there is nothing to total. */
export function totalIn(amounts: Amounts, currency: Currency): string {
  return moneyIn(amounts, currency) ?? "—";
}

/**
 * Is this figure in the currency that was asked for?
 *
 * False when it fell back. Nothing depends on it today; it is here so a screen
 * that wants to mark a fallback can, rather than each one working it out again.
 */
export function isFallback(amounts: Amounts, currency: Currency): boolean {
  const wanted = currency === "usd" ? amounts.usd : amounts.khr;
  const other = currency === "usd" ? amounts.khr : amounts.usd;
  return wanted === null && other !== null;
}
