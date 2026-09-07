"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { haptic } from "@/lib/haptics";
import {
  customerWhere,
  distanceMetres,
  nearestCustomers,
  type CartCustomer,
} from "@/lib/catalog";
import { distanceLabel, type Fix } from "@/lib/visits";

/**
 * Where are you.
 *
 * Nearest first, because a rep opens this standing outside the shop they are
 * about to walk into: the right answer is almost always the top one, and
 * scrolling an alphabetical list to find it is work the phone can do instead.
 *
 * The distance beside each shop is this device's arithmetic and is only ever a
 * sorting aid. What gets written against the visit is the database's own
 * measurement, taken at the moment of the check-in from the shop's own row.
 *
 * A shop further away than the radius is not hidden or disabled. Somebody
 * standing in a concrete building with a bad fix still made the call, and the
 * check-in records the distance rather than refusing it — so the list says how
 * far, and lets them decide.
 */
export function CheckInPanel({
  customers,
  fix,
  radiusM,
  busy,
  onCheckIn,
}: {
  customers: CartCustomer[];
  fix: Fix | null;
  radiusM: number;
  busy: boolean;
  onCheckIn: (customer: CartCustomer) => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => nearestCustomers(customers, fix), [customers, fix]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((customer) => {
      const where = customerWhere(customer);
      return (
        customer.shop_name.toLowerCase().includes(needle) ||
        (where !== null && where.toLowerCase().includes(needle))
      );
    });
  }, [sorted, query]);

  // Five is what fits above the fold on a phone. The rest are one tap away,
  // and searching skips the question entirely.
  const shown = showAll || query.trim() ? matches : matches.slice(0, 5);

  return (
    <div className="space-y-3">
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
          className="min-h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
        />
      </div>

      {matches.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          {customers.length === 0
            ? "No shops to visit yet. Add a customer first."
            : "No shop matches that."}
        </Card>
      ) : (
        <ul className="space-y-2">
          {shown.map((customer) => {
            const metres = fix ? distanceMetres(fix, customer) : null;
            const far = metres !== null && metres > radiusM;
            const where = customerWhere(customer);

            return (
              <li key={customer.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    haptic("tap");
                    onCheckIn(customer);
                  }}
                  className="pressable block w-full text-left disabled:opacity-60"
                >
                  <Card className="flex items-center gap-3 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {customer.shop_name}
                      </span>
                      {where && (
                        <span className="block truncate text-xs text-muted">{where}</span>
                      )}
                    </span>
                    {fix && (
                      <Chip tone={metres === null ? "neutral" : far ? "warn" : "accent"}>
                        {/* "No pin" rather than "unknown": it names what is
                            missing, which is something somebody can go and fix. */}
                        {metres === null ? "No pin" : distanceLabel(metres)}
                      </Chip>
                    )}
                    <Icon name="chevron" className="size-4 shrink-0 text-muted" />
                  </Card>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!showAll && !query.trim() && matches.length > shown.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="pressable w-full rounded-xl border border-line py-2 text-sm text-muted"
        >
          Show all {matches.length} shops
        </button>
      )}
    </div>
  );
}
