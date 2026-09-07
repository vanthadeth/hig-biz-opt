"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import {
  customerWhere,
  distanceMetres,
  nearestCustomers,
  type CartCustomer,
} from "@/lib/catalog";
import { distanceLabel } from "@/lib/visits";
import { useFix } from "../../visits/useFix";

/**
 * The shops around here, closest first.
 *
 * Deliberately a short list rather than a jump straight to the top answer. A
 * phone's fix is good to a few metres at best and often much worse, and two
 * shops in a row of shophouses are twenty metres apart — so opening the wrong
 * customer record with no way to tell it was wrong is worse than one more tap.
 * The nearest is offered large; the next few sit under it.
 *
 * Without a position this is just the customer list, alphabetically, which is
 * what the customers page already is. Said plainly rather than left to look
 * broken.
 */
export function NearestCustomer({
  viewKey,
  customers,
}: {
  viewKey: string;
  customers: CartCustomer[];
}) {
  const { fix, problem } = useFix();

  const ranked = useMemo(() => {
    const sorted = nearestCustomers(customers, fix);
    return sorted.slice(0, 6).map((customer) => ({
      customer,
      metres: fix ? distanceMetres(fix, customer) : null,
    }));
  }, [customers, fix]);

  if (customers.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted">
        No shops to look up yet.
      </Card>
    );
  }

  const [top, ...others] = ranked;

  return (
    <div className="space-y-3">
      {!fix && (
        <Card className="flex items-start gap-2 p-3 text-xs text-muted">
          <Icon name="pin" className="mt-0.5 size-4 shrink-0" />
          <span>
            {problem ?? "Finding where you are…"}
            {problem && " Showing every shop by name instead."}
          </span>
        </Card>
      )}

      <Link href={`/${viewKey}/customers/${top.customer.id}`} className="pressable block">
        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-brand-fg">
            <Icon name="building" className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">
              {top.customer.shop_name}
            </span>
            <span className="block truncate text-xs text-muted">
              {customerWhere(top.customer) ?? "No address recorded"}
            </span>
          </span>
          {top.metres !== null && <Chip tone="accent">{distanceLabel(top.metres)}</Chip>}
          <Icon name="chevron" className="size-4 shrink-0 text-muted" />
        </Card>
      </Link>

      {others.length > 0 && (
        <ul className="space-y-2">
          {others.map(({ customer, metres }) => (
            <li key={customer.id}>
              <Link href={`/${viewKey}/customers/${customer.id}`} className="pressable block">
                <Card className="flex items-center gap-3 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {customer.shop_name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {customerWhere(customer) ?? "No address recorded"}
                    </span>
                  </span>
                  {metres !== null && (
                    <Chip tone="neutral">{distanceLabel(metres)}</Chip>
                  )}
                  <Icon name="chevron" className="size-4 shrink-0 text-muted" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/${viewKey}/customers`}
        className="pressable block w-full rounded-xl border border-line py-2 text-center text-sm text-muted"
      >
        All customers
      </Link>
    </div>
  );
}
