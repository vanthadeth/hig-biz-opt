"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  addableQty,
  cartCount,
  cartEntries,
  cartTotals,
  catalogGroups,
  countCatalog,
  matchesCatalog,
  packingLine,
  priceLine,
  stockState,
  STOCK_LABELS,
  STOCK_TONE,
  totalsLine,
  type CartLine,
  type CatalogItem,
} from "@/lib/catalog";
import {
  INVENTORY_BUCKET,
  ITEM_PICTURE_COLUMNS,
  itemTitle,
  orderPictures,
  type ItemPicture,
} from "@/lib/inventory";

/**
 * Browsing the catalogue and building a cart.
 *
 * The cart lives in the database rather than in this component, because a rep
 * standing in a shop will lock their phone, take a call, and come back — and a
 * cart that emptied itself while they did is worse than no cart. Every change
 * writes immediately and the local copy follows the write rather than leading
 * it, so what is on screen is what was actually saved.
 */
export function Catalog({
  items,
  lines: saved,
}: {
  items: CatalogItem[];
  lines: CartLine[];
}) {
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState(saved);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetched when a sheet opens rather than with the page: a catalogue of a
  // hundred items would otherwise carry every picture of every one of them to
  // show the two or three somebody actually opens.
  const [gallery, setGallery] = useState<Record<string, ItemPicture[]>>({});

  const groups = catalogGroups(items.filter((i) => matchesCatalog(i, query)));
  const shown = countCatalog(groups);
  const open = items.find((i) => i.id === openId) ?? null;
  const entries = cartEntries(lines, items);
  const totals = cartTotals(entries);

  const inCart = (itemId: string) =>
    lines.find((l) => l.item_id === itemId)?.quantity ?? 0;

  async function openItem(item: CatalogItem) {
    haptic("tap");
    setError(null);
    setQty(1);
    setOpenId(item.id);

    if (gallery[item.id]) return;
    const { data } = await createClient()
      .from("item_pictures")
      .select(ITEM_PICTURE_COLUMNS)
      .eq("item_id", item.id)
      .eq("active", true);
    setGallery((g) => ({
      ...g,
      [item.id]: orderPictures((data ?? []) as unknown as ItemPicture[]),
    }));
  }

  /** Adds to the line if there is one, creates it if there is not. */
  async function addToCart(item: CatalogItem, amount: number) {
    const existing = lines.find((l) => l.item_id === item.id);
    setBusy(true);
    setError(null);
    const supabase = createClient();

    try {
      if (existing) {
        const next = existing.quantity + amount;
        // `.select()` because an update the policy refuses matches no rows and
        // raises nothing at all.
        const { data, error } = await supabase
          .from("cart_lines")
          .update({ quantity: next })
          .eq("id", existing.id)
          .select("id, item_id, quantity");
        if (error) throw error;
        if (!data?.length) throw new Error("That could not be added to your cart.");
        setLines((all) =>
          all.map((l) => (l.id === existing.id ? (data[0] as CartLine) : l)),
        );
      } else {
        // No user_id: the column defaults to the caller, so a line cannot be
        // written into somebody else's cart even by trying.
        const { data, error } = await supabase
          .from("cart_lines")
          .insert({ item_id: item.id, quantity: amount })
          .select("id, item_id, quantity")
          .single();
        if (error || !data) throw error ?? new Error("That could not be added.");
        setLines((all) => [...all, data as CartLine]);
      }

      haptic("success");
      setOpenId(null);
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "That could not be added to your cart.");
    } finally {
      setBusy(false);
    }
  }

  /** Sets a line's quantity, or removes it when nothing is left. */
  async function setLineQty(line: CartLine, next: number) {
    setBusy(true);
    setError(null);
    const supabase = createClient();

    try {
      if (next <= 0) {
        const { data, error } = await supabase
          .from("cart_lines")
          .delete()
          .eq("id", line.id)
          .select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("That could not be removed.");
        setLines((all) => all.filter((l) => l.id !== line.id));
      } else {
        const { data, error } = await supabase
          .from("cart_lines")
          .update({ quantity: next })
          .eq("id", line.id)
          .select("id, item_id, quantity");
        if (error) throw error;
        if (!data?.length) throw new Error("That could not be changed.");
        setLines((all) => all.map((l) => (l.id === line.id ? (data[0] as CartLine) : l)));
      }
      haptic("tap");
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The cart could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  const count = cartCount(lines);
  const openStock = open ? stockState(open) : null;
  const openRoom = open ? addableQty(open, inCart(open.id)) : 0;
  const openPictures = open ? (gallery[open.id] ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="An item, a code, a brand"
            aria-label="Search the catalogue"
            className="min-h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setCartOpen(true);
          }}
          aria-haspopup="dialog"
          aria-label={`Cart, ${count} ${count === 1 ? "piece" : "pieces"}`}
          className="pressable relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-line text-muted"
        >
          <Icon name="cart" className="size-5" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-brand px-1 text-center text-[11px] font-semibold leading-5 text-brand-fg">
              {count}
            </span>
          )}
        </button>
      </div>

      <p className="text-xs text-muted" role="status">
        {shown} {shown === 1 ? "item" : "items"}
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {groups.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">
            {items.length === 0
              ? "Nothing is in the catalogue yet. Items appear here once they are active."
              : "Nothing here matches that."}
          </p>
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-3">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {group.name}
            </h2>

            {group.sections.map((section) => (
              <div key={section.key} className="space-y-2">
                {section.name && (
                  <h3 className="px-1 text-sm font-medium">{section.name}</h3>
                )}
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {section.items.map((item) => {
                    const state = stockState(item);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => openItem(item)}
                          className="pressable flex w-full flex-col gap-2 rounded-2xl border border-line bg-surface p-2 text-left"
                        >
                          <StoredPhoto
                            name={item.name_en}
                            path={item.photo_path}
                            bucket={INVENTORY_BUCKET}
                            fallback={<Icon name="box" className="size-6" />}
                            className="aspect-square w-full rounded-xl"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {item.name_en}
                            </span>
                            {item.code && (
                              <span className="block truncate text-xs tabular-nums text-muted">
                                {item.code}
                              </span>
                            )}
                            <span className="mt-1 block truncate text-xs font-medium">
                              {priceLine(item)}
                            </span>
                          </span>
                          {/* `self-start` because a Chip in a flex column
                              stretches to the card's width otherwise, and a
                              label the width of the card reads as a banner. */}
                          <Chip tone={STOCK_TONE[state]} className="self-start">
                            {STOCK_LABELS[state]}
                          </Chip>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}

      {/* The item, in the detail somebody needs before ordering it. */}
      <Sheet
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open ? itemTitle(open) : "Item"}
      >
        {open && openStock && (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-3 pb-4 pt-1">
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {(openPictures.length > 0
                ? openPictures.map((p) => ({ key: p.id, path: p.photo_path }))
                : [{ key: "lead", path: open.photo_path }]
              ).map((picture) => (
                <li key={picture.key} className="shrink-0">
                  <StoredPhoto
                    name={open.name_en}
                    path={picture.path}
                    bucket={INVENTORY_BUCKET}
                    fallback={<Icon name="box" className="size-7" />}
                    className="size-32 rounded-xl"
                  />
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={STOCK_TONE[openStock]}>{STOCK_LABELS[openStock]}</Chip>
              {open.code && <Chip>{open.code}</Chip>}
              {open.brand_name && <Chip tone="brand">{open.brand_name}</Chip>}
            </div>

            <p className="text-base font-semibold">{priceLine(open)}</p>

            {open.description && (
              <p className="whitespace-pre-wrap text-sm text-muted">{open.description}</p>
            )}

            <Row label="Packing" value={packingLine(open) ?? "Not recorded"} />
            {/* Deliberately empty. There is no promotions table yet, and a
                fabricated one would read as a feature rather than a gap. */}
            <Row label="Promotion" value="None at the moment" />

            {openRoom === 0 ? (
              <p className="text-sm text-muted">
                {open.stock_qty === 0
                  ? "There is none of this in stock."
                  : "Your cart already holds everything in stock."}
              </p>
            ) : (
              <div className="space-y-2">
                <Stepper
                  value={qty}
                  min={1}
                  max={openRoom}
                  disabled={busy}
                  onChange={setQty}
                  label="Order quantity"
                />
                <p className="text-xs text-muted">
                  {openRoom} available{inCart(open.id) > 0 && `, ${inCart(open.id)} already in your cart`}.
                </p>
                <button
                  type="button"
                  onClick={() => addToCart(open, qty)}
                  disabled={busy}
                  className="pressable flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
                >
                  <Icon name="cart" className="size-4" />
                  {busy ? "Adding…" : "Add to cart"}
                </button>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Cart">
        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-3 pb-4 pt-1">
          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Your cart is empty. Choose an item to start one.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {entries.map(({ line, item }) => (
                  <li key={line.id} className="flex items-center gap-3 py-3">
                    <StoredPhoto
                      name={item.name_en}
                      path={item.photo_path}
                      bucket={INVENTORY_BUCKET}
                      fallback={<Icon name="box" className="size-4" />}
                      className="size-12 shrink-0 rounded-lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {item.name_en}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {priceLine(item)}
                      </span>
                    </span>
                    <Stepper
                      value={line.quantity}
                      min={0}
                      max={item.stock_qty}
                      disabled={busy}
                      compact
                      onChange={(next) => setLineQty(line, next)}
                      label={`Quantity of ${item.name_en}`}
                    />
                  </li>
                ))}
              </ul>

              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                <span className="text-sm text-muted">
                  {count} {count === 1 ? "piece" : "pieces"}
                </span>
                <span className="text-base font-semibold">{totalsLine(totals)}</span>
              </div>

              {/* Said plainly rather than shown as a disabled button somebody
                  keeps pressing: there is no order module behind it yet. */}
              <p className="text-xs text-muted">
                Turning a cart into an order is not built yet. What is here is
                saved to your account and will still be here later.
              </p>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-24 shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  );
}

/**
 * A quantity, with the two buttons a thumb can hit.
 *
 * Clamped rather than validated: there is no wrong number to explain, because
 * the control will not produce one.
 */
function Stepper({
  value,
  min,
  max,
  disabled,
  compact,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  compact?: boolean;
  onChange: (next: number) => void;
  label: string;
}) {
  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  };
  const size = compact ? "size-8" : "size-11";

  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-fit shrink-0 items-center gap-1 rounded-xl border border-line p-1"
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={disabled || value <= min}
        aria-label={`Fewer — ${label}`}
        className={`pressable ${size} rounded-lg text-lg leading-none text-muted disabled:opacity-40`}
      >
        −
      </button>
      <span
        aria-live="polite"
        className={`min-w-8 text-center text-sm font-medium tabular-nums ${compact ? "" : "min-w-10"}`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={disabled || value >= max}
        aria-label={`More — ${label}`}
        className={`pressable ${size} rounded-lg text-lg leading-none text-muted disabled:opacity-40`}
      >
        +
      </button>
    </div>
  );
}
