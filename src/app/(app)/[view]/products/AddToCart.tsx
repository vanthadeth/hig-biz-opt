"use client";

import { useState } from "react";
import { Counter } from "@/components/ui/Counter";
import { NumberField } from "@/components/ui/NumberField";
import { Icon } from "@/components/Icon";
import { haptic } from "@/lib/haptics";
import {
  cleanAmount,
  cleanDiscount,
  cleanQuantity,
  discountShare,
  lineBefore,
  lineTotals,
  packChoices,
  totalsLine,
  type CatalogItem,
  type Discount,
  type DiscountMode,
} from "@/lib/catalog";

/**
 * The part of an item sheet somebody actually operates.
 *
 * Everything above it — pictures, description, packing, promotion — is read
 * once. This is worked, repeatedly, while a shopkeeper says numbers out loud,
 * so it is pinned to the bottom of the sheet and never scrolls away. The panel
 * is the whole conversation in one glance: how many, how many free, how much
 * off, what that comes to.
 *
 * The order of the rows is the order the conversation happens in. Quantity
 * first, because it is always asked; the pack buttons under it, because "a box"
 * is the usual answer and typing 12 is worse than tapping Box; free and
 * discount together, because they are the two ways a rep sweetens the same
 * deal; then the money, large, because it is the number read back.
 */
export function AddToCart({
  item,
  room,
  alreadyInCart,
  busy,
  onAdd,
}: {
  item: CatalogItem;
  /** How many more of this may be taken, free ones included. */
  room: number;
  alreadyInCart: number;
  busy: boolean;
  onAdd: (quantity: number, free: number, discount: Discount) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [free, setFree] = useState(0);
  const [mode, setMode] = useState<DiscountMode>("percent");
  const [percent, setPercent] = useState(0);
  const [amount, setAmount] = useState(0);

  const packs = packChoices(item);
  // An amount off needs a dollar price to be an amount off *of*.
  const canUseAmount = (item.price_usd ?? 0) > 0;
  const discount: Discount = { mode, percent, amount };
  const share = discountShare(discount, item.price_usd, quantity);

  const before = lineBefore(item, quantity);
  const after = lineTotals(item, quantity, discount);
  const takes = quantity + free;

  /** Keeps the two of them inside what is on the shelf. */
  function setPaid(next: number) {
    const clamped = cleanQuantity(next, Math.max(1, room - free));
    setQuantity(Math.max(1, clamped));
  }

  function setGiven(next: number) {
    setFree(cleanQuantity(next, Math.max(0, room - quantity)));
  }

  return (
    <div className="space-y-3 border-t border-line bg-surface px-3 pb-3 pt-3">
      {/* How many ------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Quantity</span>
        <Counter
          value={quantity}
          min={1}
          max={Math.max(1, room - free)}
          disabled={busy}
          onChange={setPaid}
          label="Order quantity"
        />
      </div>

      {/* The way it is actually sold. One tap beats typing 12. */}
      {packs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {packs.map((pack) => (
            <button
              key={pack.key}
              type="button"
              disabled={busy || pack.quantity > room - free}
              onClick={() => {
                haptic("select");
                setPaid(pack.quantity);
              }}
              className={`pressable min-h-9 rounded-xl border px-3 text-xs font-medium disabled:opacity-40 ${
                quantity === pack.quantity
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-line"
              }`}
            >
              {pack.label} · {pack.quantity}
              {pack.lead && packs.length > 1 && (
                /* Marked, not sorted first: the row stays smallest-to-largest
                   so the numbers read in order. */
                <span className="ml-1 text-[10px] font-normal text-muted">usual</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Free, and money off ---------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="block text-xs text-muted">Free</span>
          <Counter
            value={free}
            min={0}
            max={Math.max(0, room - quantity)}
            disabled={busy}
            onChange={setGiven}
            label="Free quantity"
            compact
          />
        </div>

        <div className="space-y-1">
          <span className="block text-xs text-muted">Discount</span>
          <div className="flex items-center gap-1">
            {/* Two buttons rather than a dropdown: there are two answers, and
                switching clears the other so only one can ever be applied. */}
            <span className="flex shrink-0 rounded-lg border border-line p-0.5">
              {(["percent", "amount"] as DiscountMode[]).map((option) => {
                const enabled = option === "percent" || canUseAmount;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={busy || !enabled}
                    aria-pressed={mode === option}
                    onClick={() => {
                      haptic("select");
                      setMode(option);
                      if (option === "percent") setAmount(0);
                      else setPercent(0);
                    }}
                    className={`min-h-8 w-8 rounded-md text-xs font-medium disabled:opacity-40 ${
                      mode === option ? "bg-brand text-brand-fg" : "text-muted"
                    }`}
                  >
                    {option === "percent" ? "%" : "$"}
                  </button>
                );
              })}
            </span>
            <NumberField
              value={mode === "percent" ? percent : amount}
              disabled={busy}
              label={mode === "percent" ? "Percent off" : "Dollars off this line"}
              onChange={(next) =>
                mode === "percent"
                  ? setPercent(cleanDiscount(next))
                  : setAmount(cleanAmount(next))
              }
            />
          </div>
        </div>
      </div>

      {/* What it comes to -------------------------------------------------- */}
      <div className="flex items-end justify-between gap-3 border-t border-line pt-2">
        {/* Three facts, each on its own line, because they answer three
            different questions: what is charged, what leaves the warehouse,
            and what this cart has already claimed. */}
        <span className="min-w-0 space-y-0.5 text-xs text-muted">
          {free > 0 && <span className="block">{quantity} paid · {free} free</span>}
          <span className="block">{takes} off the shelf</span>
          {alreadyInCart > 0 && (
            <span className="block">{alreadyInCart} already in the cart</span>
          )}
        </span>
        <span className="shrink-0 text-right">
          {share > 0 && (
            <span className="block text-xs text-muted line-through">
              {totalsLine(before)}
            </span>
          )}
          <span className="block text-xl font-semibold tabular-nums">
            {totalsLine(after)}
          </span>
        </span>
      </div>

      <button
        type="button"
        onClick={() => onAdd(quantity, free, discount)}
        disabled={busy || room === 0}
        className="pressable flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
      >
        <Icon name="cart" className="size-4" />
        {busy ? "Adding…" : "Add to cart"}
      </button>
    </div>
  );
}
