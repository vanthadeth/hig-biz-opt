"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { haptic } from "@/lib/haptics";
import {
  actionTone,
  actorLabel,
  AUDIT_ACTIONS,
  actionLabel,
  changeRows,
  filterEntries,
  groupByDay,
  recordTitle,
  tableLabel,
  tablesIn,
  timeOf,
  type AuditAction,
  type AuditEntry,
} from "@/lib/audit";

/**
 * The log, newest first, under day headings.
 *
 * Every row answers who, what and when on one line, and opens to show the
 * columns that moved. The detail is folded away rather than on a page of its
 * own: reading an audit log is scanning, and a screen you have to leave and
 * come back to makes scanning into navigation.
 */
export function AuditList({
  entries,
  /** Passed in rather than read from the clock, so "Today" means the same thing
      on the server that rendered this and in the browser that hydrates it. */
  now,
}: {
  entries: AuditEntry[];
  now: string;
}) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<AuditAction | "all">("all");
  const [table, setTable] = useState<string>("all");
  const [open, setOpen] = useState<number | null>(null);

  const tables = tablesIn(entries);
  const matched = filterEntries(entries, query, action, table);
  const days = groupByDay(matched, new Date(now));

  return (
    <div className="space-y-4">
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="A person, a record, a field"
              aria-label="Search the audit log"
              className="min-h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
            />
          </div>

          <select
            value={table}
            onChange={(e) => setTable(e.target.value)}
            aria-label="Filter by record type"
            className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand"
          >
            <option value="all">Everything</option>
            {tables.map((name) => (
              <option key={name} value={name}>
                {tableLabel(name)}
              </option>
            ))}
          </select>
        </div>

        {/* Four answers to one question, so a radiogroup rather than four
            buttons that happen to look related. */}
        <div role="radiogroup" aria-label="Filter by what happened" className="flex gap-2">
          {AUDIT_ACTIONS.map((option) => {
            const on = option.value === action;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  haptic("tap");
                  setAction(option.value);
                }}
                className="pressable flex min-h-9 items-center rounded-full border border-line px-3 text-sm font-medium text-muted aria-checked:border-brand aria-checked:bg-brand aria-checked:text-brand-fg"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted" role="status">
        {matched.length === entries.length
          ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`
          : `${matched.length} of ${entries.length}`}
      </p>

      {days.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">
            {entries.length === 0
              ? "Nothing has been recorded yet. Changes appear here as they are made."
              : "Nothing here matches that."}
          </p>
        </Card>
      ) : (
        days.map((day) => (
          <section key={day.key} className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {day.label}
            </h2>

            <Card className="divide-y divide-line p-0">
              {day.entries.map((entry) => {
                const expanded = open === entry.id;
                const rows = changeRows(entry);
                return (
                  <div key={entry.id}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => {
                        haptic("tap");
                        setOpen(expanded ? null : entry.id);
                      }}
                      className="flex w-full items-start gap-3 p-3 text-left"
                    >
                      <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-muted">
                        {timeOf(entry.occurred_at)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Chip tone={actionTone(entry.action)}>
                            {actionLabel(entry.action)}
                          </Chip>
                          <span className="text-xs text-muted">
                            {tableLabel(entry.table_name)}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-sm font-medium">
                          {recordTitle(entry)}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {actorLabel(entry)}
                          {entry.action === "update" && entry.changed.length > 0 && (
                            <>
                              {" · "}
                              {entry.changed.length}{" "}
                              {entry.changed.length === 1 ? "field" : "fields"}
                            </>
                          )}
                        </span>
                      </span>

                      <Icon
                        name="chevron"
                        className={`mt-1 size-4 shrink-0 text-muted transition-transform ${
                          expanded ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {expanded && (
                      <div className="border-t border-line bg-subtle/50 px-3 py-3">
                        {rows.length === 0 ? (
                          <p className="text-xs text-muted">
                            Nothing was stored against this entry.
                          </p>
                        ) : (
                          <dl className="space-y-2">
                            {rows.map((row) => (
                              <div
                                key={row.column}
                                className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3"
                              >
                                <dt className="text-xs font-medium text-muted">
                                  {row.label}
                                </dt>
                                <dd className="text-xs break-words">
                                  {entry.action === "update" ? (
                                    <>
                                      <span className="text-muted line-through">
                                        {row.from}
                                      </span>{" "}
                                      <span aria-hidden="true">→</span>{" "}
                                      <span className="font-medium">{row.to}</span>
                                    </>
                                  ) : (
                                    <span
                                      className={
                                        entry.action === "delete"
                                          ? "text-muted line-through"
                                          : "font-medium"
                                      }
                                    >
                                      {entry.action === "delete" ? row.from : row.to}
                                    </span>
                                  )}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}

                        {entry.record_id && (
                          <p className="mt-3 border-t border-line pt-2 text-[11px] text-muted">
                            {entry.record_id}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
