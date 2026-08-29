"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { haptic } from "@/lib/haptics";
import {
  countPeople,
  displayName,
  groupByDepartment,
  STATUS_LABELS,
  STATUS_TONE,
  type Department,
  type DirectoryEntry,
} from "@/lib/users";

/**
 * Everyone you may see, under their department heading.
 *
 * Grouping is the organisation chart people already have in their heads, so it
 * beats one long alphabetical list for finding a colleague. Search filters
 * across the groups rather than flattening them, so a match keeps the context
 * of which department it came from.
 */
export function UserList({
  people,
  departments,
  canAdd,
  viewKey,
}: {
  people: DirectoryEntry[];
  departments: Department[];
  canAdd: boolean;
  viewKey: string;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(
    () => groupByDepartment(people, departments, query),
    [people, departments, query],
  );
  const shown = countPeople(groups);
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
            placeholder="Name, nickname or position"
            aria-label="Search people"
            className="min-h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand"
          />
        </div>

        {canAdd && (
          <Link
            href={`/${viewKey}/users/new`}
            onClick={() => haptic("tap")}
            aria-label="Add new user"
            className="pressable flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-medium text-brand-fg"
          >
            <Icon name="plus" className="size-4" />
            <span className="max-sm:sr-only">Add new user</span>
          </Link>
        )}
      </div>

      <p className="text-xs text-muted" role="status">
        {shown === 0
          ? searching
            ? `Nobody matches “${query.trim()}”.`
            : "Nobody here yet."
          : `${shown} ${shown === 1 ? "person" : "people"}${
              searching ? " matching" : ""
            } in ${groups.length} department${groups.length === 1 ? "" : "s"}`}
      </p>

      {groups.map((group) => (
        <section key={group.id ?? "unassigned"} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {group.name}
            <span className="ml-1.5 font-normal normal-case tracking-normal">
              {group.people.length}
            </span>
          </h2>

          <Card className="divide-y divide-line p-0">
            {group.people.map((person) => (
              <Link
                key={person.id}
                href={`/${viewKey}/users/${person.id}`}
                onClick={() => haptic("tap")}
                className="flex min-h-16 items-center gap-3 px-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-subtle"
              >
                <Avatar name={person.full_name} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {displayName(person)}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {person.position ?? "No position set"}
                  </span>
                </span>
                <Chip tone={STATUS_TONE[person.status]}>
                  {STATUS_LABELS[person.status]}
                </Chip>
                <Icon name="chevron" className="size-4 shrink-0 text-muted" />
              </Link>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
