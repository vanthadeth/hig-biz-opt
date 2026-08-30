"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import { haptic } from "@/lib/haptics";
import {
  addressLine,
  countCustomers,
  CUSTOMERS_BUCKET,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_TONE,
  groupByProvince,
  type DirectoryCustomer,
} from "@/lib/customers";

/**
 * The shops you may see, under their province.
 *
 * A rep works a territory, so province is the heading that matches how the list
 * is used — the same reasoning that groups the staff list by department. Search
 * reaches the landmark and the contact's phone as well as the name, because a
 * rep looking for a shop remembers the pagoda opposite it, not its street
 * number.
 */
export function CustomerList({
  customers,
  canAdd,
  viewKey,
}: {
  customers: DirectoryCustomer[];
  canAdd: boolean;
  viewKey: string;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => groupByProvince(customers, query), [customers, query]);
  const shown = countCustomers(groups);
  const searching = query.trim().length > 0;

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
            placeholder="Shop, contact, landmark or area"
            aria-label="Search customers"
            className="min-h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
          />
        </div>

        {canAdd && (
          <Link
            href={`/${viewKey}/customers/new`}
            onClick={() => haptic("tap")}
            aria-label="Add new customer"
            className="pressable flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-medium text-brand-fg"
          >
            <Icon name="plus" className="size-4" />
            <span className="max-sm:sr-only">Add new customer</span>
          </Link>
        )}
      </div>

      <p className="text-xs text-muted" role="status">
        {shown === 0
          ? searching
            ? `Nothing matches “${query.trim()}”.`
            : "No customers yet."
          : `${shown} shop${shown === 1 ? "" : "s"}${searching ? " matching" : ""} in ${
              groups.length
            } ${groups.length === 1 ? "area" : "areas"}`}
      </p>

      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {group.name}
            <span className="ml-1.5 font-normal normal-case tracking-normal">
              {group.customers.length}
            </span>
          </h2>

          <Card className="divide-y divide-line p-0">
            {group.customers.map((customer) => {
              const where = addressLine(customer);
              return (
                <Link
                  key={customer.id}
                  href={`/${viewKey}/customers/${customer.id}`}
                  onClick={() => haptic("tap")}
                  className="flex min-h-16 items-center gap-3 px-3 py-2 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-subtle"
                >
                  <StoredPhoto
                    name={customer.shop_name}
                    path={customer.primary_photo_path}
                    bucket={CUSTOMERS_BUCKET}
                    fallback={<Icon name="building" className="size-5" />}
                    className="size-11 rounded-xl"
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {customer.shop_name}
                    </span>
                    {customer.primary_contact_name && (
                      <span className="block truncate text-xs text-muted">
                        {customer.primary_contact_name}
                        {customer.primary_contact_phone &&
                          ` · ${customer.primary_contact_phone}`}
                      </span>
                    )}
                    {where && (
                      <span className="block truncate text-xs text-muted">{where}</span>
                    )}
                  </span>

                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {customer.status !== "active" && (
                      <Chip tone={CUSTOMER_STATUS_TONE[customer.status]}>
                        {CUSTOMER_STATUS_LABELS[customer.status]}
                      </Chip>
                    )}
                    {customer.business_type && (
                      <span className="max-w-28 truncate text-[11px] text-muted">
                        {customer.business_type}
                      </span>
                    )}
                  </span>

                  <Icon name="chevron" className="size-4 shrink-0 text-muted" />
                </Link>
              );
            })}
          </Card>
        </section>
      ))}
    </div>
  );
}
