"use client";

import { Icon } from "@/components/Icon";
import { haptic } from "@/lib/haptics";
import { ACTIVE_FILTERS, type ActiveFilter } from "@/lib/inventory";

/**
 * Quick search and a status filter, shared by the category and brand lists.
 *
 * One component rather than two near-identical ones: the two lists ask the same
 * question of their data, and letting them drift apart is how "Inactive" comes
 * to mean something slightly different on each screen.
 *
 * `extra` is where a list puts a control only it needs — the brand list uses it
 * for the tile/list switch.
 */
export function ListToolbar({
  query,
  onQuery,
  filter,
  onFilter,
  placeholder,
  label,
  extra,
}: {
  query: string;
  onQuery: (value: string) => void;
  filter: ActiveFilter;
  onFilter: (value: ActiveFilter) => void;
  placeholder: string;
  label: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={label}
            className="min-h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
          />
        </div>
        {extra}
      </div>

      {/* A radiogroup rather than three buttons: these are three answers to one
          question, and only one of them can be true at a time. */}
      <div role="radiogroup" aria-label="Filter by status" className="flex gap-2">
        {ACTIVE_FILTERS.map((option) => {
          const active = option.value === filter;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                haptic("tap");
                onFilter(option.value);
              }}
              className="pressable flex min-h-9 items-center rounded-full border border-line px-3 text-sm font-medium text-muted aria-checked:border-brand aria-checked:bg-brand aria-checked:text-brand-fg"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The Active / Inactive chip both lists show on every row. */
export function statusChip(active: boolean) {
  return {
    tone: active ? ("accent" as const) : ("warn" as const),
    label: active ? "Active" : "Inactive",
  };
}
