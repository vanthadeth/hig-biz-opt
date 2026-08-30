"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import { haptic } from "@/lib/haptics";
import {
  bothPrices,
  categoryPath,
  countItems,
  groupByCategory,
  INVENTORY_BUCKET,
  type CatalogueEntry,
} from "@/lib/inventory";

/**
 * The catalogue under its category headings.
 *
 * Search filters across the groups rather than flattening them, so a match
 * keeps the context of where it sits — the same rule the staff list follows,
 * for the same reason. It looks at both names, the code, the brand and either
 * category level, because any of those is a reasonable thing to half-remember.
 */
export function ItemList({
  items,
  canAdd,
  viewKey,
}: {
  items: CatalogueEntry[];
  canAdd: boolean;
  viewKey: string;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => groupByCategory(items, query), [items, query]);
  const shown = countItems(groups);
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
            placeholder="Name, code, brand or category"
            aria-label="Search the catalogue"
            className="min-h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
          />
        </div>

        {canAdd && (
          <Link
            href={`/${viewKey}/inventory/new`}
            onClick={() => haptic("tap")}
            aria-label="Add new item"
            className="pressable flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-medium text-brand-fg"
          >
            <Icon name="plus" className="size-4" />
            <span className="max-sm:sr-only">Add new item</span>
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/${viewKey}/inventory/categories`}
          className="pressable flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-medium text-muted hover:text-fg"
        >
          <Icon name="grid" className="size-4" />
          Categories
        </Link>
        <Link
          href={`/${viewKey}/inventory/brands`}
          className="pressable flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-medium text-muted hover:text-fg"
        >
          <Icon name="bolt" className="size-4" />
          Brands
        </Link>
      </div>

      <p className="text-xs text-muted" role="status">
        {shown === 0
          ? searching
            ? `Nothing matches “${query.trim()}”.`
            : "No items in the catalogue yet."
          : `${shown} item${shown === 1 ? "" : "s"}${searching ? " matching" : ""} in ${
              groups.length
            } categor${groups.length === 1 ? "y" : "ies"}`}
      </p>

      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {group.name}
            <span className="ml-1.5 font-normal normal-case tracking-normal">
              {group.items.length}
            </span>
          </h2>

          <Card className="divide-y divide-line p-0">
            {group.items.map((item) => {
              const path = categoryPath(item);
              return (
                <Link
                  key={item.id}
                  href={`/${viewKey}/inventory/${item.id}`}
                  onClick={() => haptic("tap")}
                  className="flex min-h-16 items-center gap-3 px-3 py-2 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-subtle"
                >
                  <StoredPhoto
                    name={item.name_en}
                    path={item.photo_path}
                    bucket={INVENTORY_BUCKET}
                    fallback={<Icon name="box" className="size-5" />}
                    className="size-11 rounded-xl"
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.name_en}
                    </span>
                    {item.name_km && (
                      <span className="block truncate text-xs text-muted">
                        {item.name_km}
                      </span>
                    )}
                    {/* Wraps rather than truncates: two currencies and a range
                        do not fit one line on a phone, and a clipped price is
                        worse than a two-line one. */}
                    <span className="block text-xs text-muted">
                      {bothPrices(item)}
                      {item.variant_count !== null && item.variant_count > 1 && (
                        <> · {item.variant_count} options</>
                      )}
                    </span>
                  </span>

                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {!item.active && <Chip tone="warn">Inactive</Chip>}
                    {item.brand_name && <Chip tone="brand">{item.brand_name}</Chip>}
                    {path && path !== group.name && (
                      <span className="max-w-28 truncate text-[11px] text-muted">
                        {item.category_name}
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
