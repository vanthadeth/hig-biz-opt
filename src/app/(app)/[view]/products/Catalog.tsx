"use client";

import Link from "next/link";
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
  CART_COLUMNS,
  CART_HEADER_COLUMNS,
  cartCountLine,
  cartEntries,
  cartItemCount,
  cartLineDetail,
  cartSavings,
  cartTotals,
  catalogGroups,
  cleanAmount,
  cleanDiscount,
  countCatalog,
  lineDiscount,
  lineOffShelf,
  lineTotals,
  matchesCatalog,
  packingLine,
  stockState,
  STOCK_LABELS,
  STOCK_TONE,
  type Cart,
  type CartCustomer,
  type CartLine,
  type CatalogItem,
  type Discount,
} from "@/lib/catalog";
import { PageTitle } from "@/components/PageTitle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useScrollHidden } from "@/hooks/useScrollDirection";
import { priceIn, totalIn, type Currency } from "@/lib/money";
import { AddToCart } from "./AddToCart";
import { CartRow } from "./CartRow";
import { KioskBar } from "./KioskBar";
import { CustomerPicker } from "./CustomerPicker";
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
  cart: savedCart,
  customers,
  currency,
  locked,
  viewKey,
}: {
  items: CatalogItem[];
  lines: CartLine[];
  cart: Cart | null;
  customers: CartCustomer[];
  /** Which of the two prices to show. Chosen once, in Settings. */
  currency: Currency;
  /** Kiosk: the phone is in a customer's hands. */
  locked: boolean;
  viewKey: string;
}) {
  const [query, setQuery] = useState("");
  // The title bar slides away on a phone when the page scrolls down. The header
  // below has to follow it, or it pins under a bar that is not there any more
  // and leaves a strip of catalogue showing through above itself.
  const barHidden = useScrollHidden();
  const [lines, setLines] = useState(saved);
  const [cart, setCart] = useState(savedCart);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The order just placed, kept so "See the order" can open that one rather
  // than a list somebody then has to find it in.
  const [placed, setPlaced] = useState<{ id: string; order_no: string } | null>(null);
  // The cart line being changed. Editing replaces what the line says rather
  // than adding to it, so it reuses the add panel with the line already in it.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Removing is asked about rather than done: a swipe is easy to make by
  // accident, and a line put back is a line retyped.
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Fetched when a sheet opens rather than with the page: a catalogue of a
  // hundred items would otherwise carry every picture of every one of them to
  // show the two or three somebody actually opens.
  const [gallery, setGallery] = useState<Record<string, ItemPicture[]>>({});

  const groups = catalogGroups(items.filter((i) => matchesCatalog(i, query)));
  const shown = countCatalog(groups);
  const open = items.find((i) => i.id === openId) ?? null;
  const entries = cartEntries(lines, items);
  const totals = cartTotals(entries);

  /** How many pieces of an item the cart already claims, free ones included. */
  const inCart = (itemId: string) => {
    const line = lines.find((l) => l.item_id === itemId);
    return line ? lineOffShelf(line) : 0;
  };

  /**
   * The cart's id, making one if this is the first thing going into it.
   *
   * Not made when the catalogue opens: browsing is not starting an order, and
   * a row for everybody who ever looked at a screen is rubbish nobody asked
   * for.
   */
  async function cartId(): Promise<string> {
    if (cart) return cart.id;
    const { data, error } = await createClient().rpc("ensure_my_cart");
    if (error || !data) throw error ?? new Error("Your cart could not be opened.");
    setCart({ id: data as string, customer_id: null });
    return data as string;
  }

  async function openItem(item: CatalogItem) {
    haptic("tap");
    setError(null);
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

  /**
   * Adds to the line if there is one, creates it if there is not.
   *
   * The discount comes with the item rather than being applied to the cart
   * afterwards, because it is agreed while the two of them are looking at that
   * item. Adding more of something already in the cart takes the newer
   * discount: the last thing agreed is the thing that was agreed.
   */
  async function addToCart(
    item: CatalogItem,
    amount: number,
    free: number,
    discount: Discount,
  ) {
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
          .update({
            quantity: next,
            free_quantity: existing.free_quantity + free,
            ...discountColumns(discount),
          })
          .eq("id", existing.id)
          .select(CART_COLUMNS);
        if (error) throw error;
        if (!data?.length) throw new Error("That could not be added to your cart.");
        setLines((all) =>
          all.map((l) => (l.id === existing.id ? (data[0] as CartLine) : l)),
        );
      } else {
        const id = await cartId();
        const { data, error } = await supabase
          .from("cart_lines")
          .insert({
            cart_id: id,
            item_id: item.id,
            quantity: amount,
            free_quantity: free,
            ...discountColumns(discount),
          })
          .select(CART_COLUMNS)
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

  /** Who this cart is for. */
  async function setCustomer(customerId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const id = await cartId();
      const { data, error } = await createClient()
        .from("carts")
        .update({ customer_id: customerId })
        .eq("id", id)
        .select(CART_HEADER_COLUMNS);
      if (error) throw error;
      if (!data?.length) throw new Error("That customer could not be set.");
      setCart(data[0] as Cart);
      haptic("tap");
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "That customer could not be set.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * The cart becomes an order.
   *
   * Everything that matters happens in the database: the prices are copied
   * there, the number is issued there, and the cart is emptied there, all in
   * one transaction. A client that did this in four writes would eventually
   * leave an order with no lines on a phone that lost signal halfway.
   */
  async function convertToOrder() {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await createClient().rpc("confirm_cart");
      if (error) throw new Error(error.message);
      const order = data as { id: string; order_no: string } | null;
      if (!order?.id) throw new Error("The order could not be created.");

      haptic("success");
      setLines([]);
      setPlaced({ id: order.id, order_no: order.order_no });
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The order could not be created.");
    } finally {
      setBusy(false);
    }
  }

  /** Replaces everything a line says, from the panel that edits it. */
  async function saveLine(
    line: CartLine,
    quantity: number,
    free: number,
    discount: Discount,
  ) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await createClient()
        .from("cart_lines")
        .update({
          quantity,
          free_quantity: free,
          ...discountColumns(discount),
        })
        .eq("id", line.id)
        .select(CART_COLUMNS);
      if (error) throw error;
      if (!data?.length) throw new Error("That line could not be changed.");

      setLines((all) => all.map((l) => (l.id === line.id ? (data[0] as CartLine) : l)));
      haptic("success");
      setEditingId(null);
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "That line could not be changed.");
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
          .select(CART_COLUMNS);
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

  const count = cartItemCount(lines);
  const chosen = customers.find((c) => c.id === cart?.customer_id) ?? null;
  const editing = entries.find(({ line }) => line.id === editingId) ?? null;
  const removing = entries.find(({ line }) => line.id === removingId) ?? null;

  // Said only when there were any: "0.00 off" is a line of noise on a cart
  // nobody discounted.
  const savings = cartSavings(entries);
  const freeTotal = lines.reduce((n, line) => n + line.free_quantity, 0);
  const discountTotal =
    savings.usd === null && savings.khr === null ? null : totalIn(savings, currency);
  const openStock = open ? stockState(open) : null;
  const openRoom = open ? addableQty(open, inCart(open.id)) : 0;
  const openPictures = open ? (gallery[open.id] ?? []) : [];

  return (
    <div className="space-y-4">
      {/* Everything somebody reaches for while browsing, kept on screen: the
          heading that says where they are, the search, and the cart. Negative
          margins so the background spans the page rather than leaving the
          catalogue visible sliding past either side of it. */}
      <div
        data-bar-hidden={barHidden}
        className={`sticky z-30 -mx-4 space-y-3 border-b border-line bg-bg px-4 pb-3 pt-2 ${
          locked
            ? // No title bar in kiosk mode, so nothing to sit under.
              "top-0"
            : "top-14 max-md:data-[bar-hidden=true]:top-0"
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <PageTitle />
          </div>
          {/* A shop is bright at noon and dark at six, and in kiosk mode there
              is no title bar to reach the theme from. */}
          <ThemeToggle />
          {locked && <KioskBar />}
        </div>

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
            // The badge counts items, so the label must say items. A number
            // that means one thing to the eye and another to a screen reader
            // is worse than no label.
            aria-label={`Cart, ${cartCountLine(lines)}`}
            className="pressable relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted"
          >
            <Icon name="cart" className="size-5" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-brand px-1 text-center text-[11px] font-semibold leading-5 text-brand-fg">
                {count}
              </span>
            )}
          </button>
        </div>
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
                            name={item.name}
                            path={item.photo_path}
                            bucket={INVENTORY_BUCKET}
                            fallback={<Icon name="box" className="size-6" />}
                            className="aspect-square w-full rounded-xl"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {item.name}
                            </span>
                            {item.code && (
                              <span className="block truncate text-xs tabular-nums text-muted">
                                {item.code}
                              </span>
                            )}
                            <span className="mt-1 block truncate text-xs font-medium">
                              {priceIn(item, currency)}
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
          /* Two parts, and only the first one scrolls. The detail is read once;
             the panel is worked while a shopkeeper says numbers out loud, so it
             stays put rather than being scrolled back to between answers. */
          <div className="flex max-h-[78vh] flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4 pt-1">
              <ul className="flex gap-2 overflow-x-auto pb-1">
                {(openPictures.length > 0
                  ? openPictures.map((p) => ({ key: p.id, path: p.photo_path }))
                  : [{ key: "lead", path: open.photo_path }]
                ).map((picture) => (
                  <li key={picture.key} className="shrink-0">
                    <StoredPhoto
                      name={open.name}
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

              <p className="text-base font-semibold">{priceIn(open, currency)}</p>

              {open.description && (
                <p className="whitespace-pre-wrap text-sm text-muted">
                  {open.description}
                </p>
              )}

              <Row label="Packing" value={packingLine(open) ?? "Not recorded"} />
              {/* Deliberately empty. There is no promotions table yet, and a
                  fabricated one would read as a feature rather than a gap. */}
              <Row label="Promotion" value="None at the moment" />

              <Row
                label="In stock"
                value={`${open.stock_qty}${
                  inCart(open.id) > 0 ? `, ${inCart(open.id)} claimed by your cart` : ""
                }`}
              />
            </div>

            {openRoom === 0 ? (
              <p className="border-t border-line px-3 py-4 text-sm text-muted">
                {open.stock_qty === 0
                  ? "There is none of this in stock."
                  : "Your cart already holds everything in stock."}
              </p>
            ) : (
              <AddToCart
                // Remounted per item, so yesterday's quantity and discount do
                // not follow the rep to the next thing they open.
                key={open.id}
                item={open}
                room={openRoom}
                currency={currency}
                alreadyInCart={inCart(open.id)}
                busy={busy}
                onAdd={(quantity, free, discount) =>
                  addToCart(open, quantity, free, discount)
                }
              />
            )}
          </div>
        )}
      </Sheet>

      <Sheet
        open={removing !== null}
        onClose={() => setRemovingId(null)}
        title="Remove from the cart?"
      >
        {removing && (
          <div className="space-y-4 px-3 pb-4 pt-1">
            <p className="text-sm text-muted">
              <span className="font-medium text-fg">{removing.item.name}</span> comes
              off this cart. Nothing else changes.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRemovingId(null)}
                className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={() => {
                  const line = removing.line;
                  setRemovingId(null);
                  void setLineQty(line, 0);
                }}
                disabled={busy}
                className="pressable min-h-11 flex-1 rounded-xl bg-danger text-sm font-medium text-danger-fg disabled:opacity-60"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Editing a line reuses the panel that made it, with the line already in
          it. One control for the four numbers, rather than a second, smaller
          set of them wedged into a list row. */}
      <Sheet
        open={editing !== null}
        onClose={() => setEditingId(null)}
        title={editing ? editing.item.name : "Line"}
      >
        {editing && (
          <AddToCart
            key={editing.line.id}
            item={editing.item}
            // One line per item per cart, so this line's own numbers are not
            // competing with another line of the same thing.
            room={editing.item.stock_qty}
            alreadyInCart={0}
            currency={currency}
            busy={busy}
            editing={{
              quantity: editing.line.quantity,
              free: editing.line.free_quantity,
              discount: lineDiscount(editing.line),
            }}
            onAdd={(quantity, free, discount) =>
              saveLine(editing.line, quantity, free, discount)
            }
          />
        )}
      </Sheet>

      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Cart">
        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-3 pb-4 pt-1">
          {placed ? (
            /* The one thing worth saying after confirming: the number, because
               it is what the shop and the warehouse will both quote back. */
            <div className="space-y-4 py-4 text-center">
              <p className="text-sm text-muted">Order placed</p>
              <p className="text-3xl font-semibold tabular-nums">{placed.order_no}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPlaced(null);
                    setCartOpen(false);
                  }}
                  className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium"
                >
                  Keep selling
                </button>
                <Link
                  href={`/${viewKey}/sale-orders/${placed.id}`}
                  onClick={() => haptic("tap")}
                  className="pressable flex min-h-11 flex-1 items-center justify-center rounded-xl bg-brand text-sm font-medium text-brand-fg"
                >
                  See the order
                </Link>
              </div>
            </div>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Your cart is empty. Choose an item to start one.
            </p>
          ) : (
            <>
              <CustomerPicker
                customers={customers}
                chosen={chosen}
                busy={busy}
                onChoose={setCustomer}
              />

              <ul className="divide-y divide-line">
                {entries.map(({ line, item }) => (
                  <CartRow
                    key={line.id}
                    detail={cartLineDetail(item, line, priceIn(item, currency))}
                    name={item.name}
                    total={totalIn(
                      lineTotals(item, line.quantity, lineDiscount(line)),
                      currency,
                    )}
                    disabled={busy}
                    onEdit={() => setEditingId(line.id)}
                    onAskRemove={() => setRemovingId(line.id)}
                  />
                ))}
              </ul>

              <p className="text-center text-xs text-muted">
                Hold a line to change it. Swipe it left to remove it.
              </p>

              <div className="space-y-1 border-t border-line pt-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted">
                    {cartCountLine(lines)}
                    {freeTotal > 0 && `, ${freeTotal} free`}
                  </span>
                  {discountTotal !== null && (
                    <span className="text-xs text-muted">{discountTotal} off</span>
                  )}
                </div>
                {/* Large on purpose: it is the number read out loud, and the
                    one thing on this screen somebody checks from arm's length. */}
                <p className="text-right text-2xl font-semibold tabular-nums text-brand">
                  {totalIn(totals, currency)}
                </p>
              </div>

              <button
                type="button"
                onClick={convertToOrder}
                disabled={busy || !cart?.customer_id}
                className="pressable flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
              >
                <Icon name="file" className="size-4" />
                {busy ? "Placing…" : "Convert to sale order"}
              </button>
              {!cart?.customer_id && (
                <p className="text-center text-xs text-muted">
                  Choose a customer first. An order for nobody cannot be
                  delivered or invoiced.
                </p>
              )}
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
 * The two columns a discount writes, whichever way it was agreed.
 *
 * Both are always sent, and the unused one is zeroed: the database refuses a
 * row carrying a percent *and* an amount, which is what makes "only one can
 * apply" true rather than something the form is trusted to remember.
 */
function discountColumns(discount: Discount) {
  return discount.mode === "percent"
    ? {
        discount_mode: "percent" as const,
        discount_percent: cleanDiscount(discount.percent),
        discount_amount: 0,
      }
    : {
        discount_mode: "amount" as const,
        discount_percent: 0,
        discount_amount: cleanAmount(discount.amount),
      };
}


