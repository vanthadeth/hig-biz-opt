"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import {
  currentFix,
  customerWhere,
  distanceLabel,
  distanceMetres,
  nearestCustomers,
  type NearbyCustomer,
} from "@/lib/geo";

type Here = { latitude: number; longitude: number };

/**
 * The shop list, nearest first.
 *
 * The same shape as the cart's `CustomerPicker`, and for the same reason: a rep
 * opens this standing inside the shop they are about to visit, so the right
 * answer is usually the one they are in, and scrolling an alphabetical list to
 * find it is work the phone can do instead.
 *
 * Location is asked for once, on arrival, and never insisted on. A refusal, a
 * phone with no signal, a shop whose coordinates were never recorded: each of
 * those falls back to alphabetical, which is at least predictable. Nothing here
 * is blocked on knowing where anybody is — the visit is the record, and the
 * coordinates are a nicety.
 */
export function CheckInList({ customers }: { customers: NearbyCustomer[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [here, setHere] = useState<Here | null>(null);
  const [locating, setLocating] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // A refusal, no signal, a browser with no geolocation at all: `currentFix`
    // resolves null for every one of them, so there is one path out of here and
    // the answer always arrives from a callback rather than from this body.
    currentFix().then((found) => {
      if (cancelled) return;
      setHere(found);
      setLocating(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

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

  /**
   * Start the visit.
   *
   * The coordinates go in with the row rather than being added afterwards: this
   * is the stamp that says where the phone was when the rep said they had
   * arrived, and a stamp written a moment later is a different fact. If there is
   * no fix, the visit is still made — see the note above.
   *
   * `user_id` is left to the column default (`auth.uid()`), so `add` at 'own'
   * scope succeeds without this form having to know the rule.
   */
  async function startVisit(customerId: string) {
    haptic("select");
    setStarting(customerId);
    setError(null);

    const supabase = createClient();
    const { data, error: failed } = await supabase
      .from("visits")
      .insert({
        customer_id: customerId,
        checked_in_latitude: here?.latitude ?? null,
        checked_in_longitude: here?.longitude ?? null,
      })
      .select("id")
      .single();

    if (failed || !data) {
      haptic("error");
      // The one refusal worth naming: the unique index that allows a single
      // open visit. Anything else is said in the words the database used.
      setError(
        failed?.code === "23505"
          ? "You are already checked in somewhere. Check out of that visit first."
          : (failed?.message ?? "Could not start the visit."),
      );
      setStarting(null);
      return;
    }

    haptic("success");
    router.replace(`/visit/visits/${data.id}`);
    // The layout reads the open visit, so the centre button has to be told to
    // look again.
    router.refresh();
  }

  return (
    <div className="space-y-4">
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
          aria-label="Search shops"
          className="min-h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
        />
      </div>

      <p className="text-xs text-muted" role="status">
        {locating
          ? "Finding the shops nearest you…"
          : here
            ? "Nearest first."
            : "By name. Allow location to see the nearest first."}
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {ordered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No shop matches that.</p>
      ) : (
        <ul className="space-y-2">
          {ordered.map((customer) => {
            const where = customerWhere(customer);
            const away = here ? distanceLabel(distanceMetres(here, customer)) : null;
            const busy = starting !== null;

            return (
              <li key={customer.id}>
                <Card className="flex items-center gap-3 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {customer.shop_name}
                    </span>
                    {where && (
                      <span className="block truncate text-xs text-muted">{where}</span>
                    )}
                  </span>

                  {away && (
                    <span className="shrink-0 text-xs tabular-nums text-muted">{away}</span>
                  )}

                  <button
                    type="button"
                    onClick={() => startVisit(customer.id)}
                    disabled={busy}
                    className="pressable min-h-11 shrink-0 rounded-xl bg-brand px-3 text-sm font-medium text-brand-fg disabled:opacity-60"
                  >
                    {starting === customer.id ? "Starting…" : "Check in"}
                  </button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
