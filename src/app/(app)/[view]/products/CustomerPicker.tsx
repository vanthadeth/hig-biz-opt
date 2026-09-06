"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import {
  customerWhere,
  distanceLabel,
  distanceMetres,
  nearestCustomers,
  type CartCustomer,
} from "@/lib/catalog";

/**
 * Who the cart is for.
 *
 * Nearest first, because a rep opens this standing inside the shop they are
 * selling to — the right answer is usually the one they are in, and scrolling
 * an alphabetical list to find it is work the phone can do instead.
 *
 * Location is asked for once, when the picker opens, and never insisted on.
 * A refusal, a phone with no signal, a customer whose coordinates were never
 * recorded: each of those falls back to alphabetical, which is at least
 * predictable. Nothing here is blocked on knowing where anybody is.
 */
export function CustomerPicker({
  customers,
  chosen,
  busy,
  onChoose,
}: {
  customers: CartCustomer[];
  chosen: CartCustomer | null;
  busy: boolean;
  onChoose: (customerId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [here, setHere] = useState<{ latitude: number; longitude: number } | null>(null);
  // Asked at most once per opening, and only when the button is pressed: the
  // effect below reacts to that decision rather than making it, so nothing
  // sets state on the way into a render.
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        setHere({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setAsking(false);
      },
      // Refused, unavailable, timed out — all the same answer here: sort by
      // name and say nothing further about it.
      () => {
        if (!cancelled) setAsking(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );

    return () => {
      cancelled = true;
    };
  }, [asking]);

  const ordered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? customers.filter((c) =>
          [c.shop_name, customerWhere(c)].some(
            (field) => field && field.toLowerCase().includes(needle),
          ),
        )
      : customers;
    return nearestCustomers(matching, here);
  }, [customers, query, here]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setQuery("");
          setOpen(true);
          if (!here && typeof navigator !== "undefined" && navigator.geolocation) {
            setAsking(true);
          }
        }}
        disabled={busy}
        aria-haspopup="dialog"
        className="pressable flex min-h-14 w-full items-center gap-3 rounded-xl border border-line px-3 text-left disabled:opacity-60"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon name="building" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">Customer</span>
          <span className="block truncate text-sm font-medium">
            {chosen ? chosen.shop_name : "Nobody yet"}
          </span>
        </span>
        <Icon name="chevron" className="size-4 shrink-0 text-muted" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Who is this for?">
        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-3 pb-4 pt-1">
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="A shop, or where it is"
              aria-label="Search customers"
              className="min-h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
            />
          </div>

          <p className="text-xs text-muted" role="status">
            {asking
              ? "Finding the shops nearest you…"
              : here
                ? "Nearest first."
                : "By name. Allow location to see the nearest first."}
          </p>

          {ordered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              {customers.length === 0
                ? "There are no customers you can sell to yet."
                : "No shop matches that."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {ordered.map((customer) => {
                const where = customerWhere(customer);
                const away = here ? distanceLabel(distanceMetres(here, customer)) : null;
                const isChosen = chosen?.id === customer.id;
                return (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChoose(customer.id);
                        setOpen(false);
                      }}
                      className="pressable flex min-h-14 w-full items-center gap-3 py-2 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {customer.shop_name}
                        </span>
                        {where && (
                          <span className="block truncate text-xs text-muted">{where}</span>
                        )}
                      </span>
                      {away && (
                        <span className="shrink-0 text-xs tabular-nums text-muted">
                          {away}
                        </span>
                      )}
                      {isChosen && (
                        <Icon name="check" className="size-4 shrink-0 text-brand" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {chosen && (
            <button
              type="button"
              onClick={() => {
                onChoose(null);
                setOpen(false);
              }}
              className="pressable min-h-11 w-full rounded-xl border border-line text-sm text-muted"
            >
              Clear the customer
            </button>
          )}
        </div>
      </Sheet>
    </>
  );
}
