"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import {
  customerWhere,
  distanceMetres,
  nearestCustomers,
  type CartCustomer,
} from "@/lib/catalog";
import { distanceLabel, type Fix } from "@/lib/visits";

/**
 * Which shop this visit was to, chosen after the fact.
 *
 * The check-in fires on one tap so the time and the position are the real
 * ones; naming the shop happens here, a moment later, with the rep already
 * inside. Nearest first, because the answer is almost always the shop they are
 * standing in.
 *
 * The distances are this device's arithmetic and only sort the list. They are
 * never written to the visit: the recorded distance is the database's, taken
 * at the check-in, and a shop named afterwards has no such measurement.
 */
export function ShopPicker({
  customers,
  fix,
  busy,
  onChoose,
}: {
  customers: CartCustomer[];
  fix: Fix | null;
  busy: boolean;
  onChoose: (customer: CartCustomer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => nearestCustomers(customers, fix), [customers, fix]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? sorted.filter((customer) => {
          const where = customerWhere(customer);
          return (
            customer.shop_name.toLowerCase().includes(needle) ||
            (where !== null && where.toLowerCase().includes(needle))
          );
        })
      : sorted;
    return list.slice(0, 40);
  }, [sorted, query]);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          haptic("tap");
          setQuery("");
          setOpen(true);
        }}
        className="pressable flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-brand px-3 text-sm font-medium text-brand disabled:opacity-60"
      >
        <Icon name="building" className="size-4" />
        Choose the shop
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Which shop?">
        <div className="space-y-3 p-4">
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a shop"
              aria-label="Find a shop"
              className="min-h-11 w-full rounded-xl border border-line bg-bg pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
            />
          </div>

          {matches.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No shop matches that.</p>
          ) : (
            <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
              {matches.map((customer) => {
                const metres = fix ? distanceMetres(fix, customer) : null;
                const where = customerWhere(customer);
                return (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => {
                        haptic("select");
                        setOpen(false);
                        onChoose(customer);
                      }}
                      className="pressable flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-subtle"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {customer.shop_name}
                        </span>
                        {where && (
                          <span className="block truncate text-xs text-muted">{where}</span>
                        )}
                      </span>
                      {fix && (
                        <Chip tone={metres === null ? "neutral" : "accent"}>
                          {metres === null ? "No pin" : distanceLabel(metres)}
                        </Chip>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Sheet>
    </>
  );
}
