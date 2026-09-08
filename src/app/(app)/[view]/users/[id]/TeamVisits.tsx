"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useI18n, useT } from "@/components/I18nProvider";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { dayKey, longDay, timeOf } from "@/lib/time";
import { distanceLabel, shopNameOf, type VisitRow } from "@/lib/visits";

/**
 * The calls a manager can now see, without going looking for them.
 *
 * `visit:view:sub` made a subordinate's rows readable at the database, but a
 * permission nobody can find is a permission that goes unused — so their most
 * recent calls sit right here, on the one page a manager already opens to
 * look at that person. Silent for anyone the viewer holds no such reach into:
 * the row policy already returned nothing, and this draws nothing from it,
 * the same "not found and not allowed look the same" rule the visit detail
 * page itself follows.
 *
 * Every row opens the real visit page, already read-only there for anyone but
 * its own owner -- so a tap here can only ever be a look, never a change.
 */
export function TeamVisits({ viewKey, visits }: { viewKey: string; visits: VisitRow[] }) {
  const t = useT();
  const { lang } = useI18n();

  if (visits.length === 0) return null;

  return (
    <div className="space-y-3">
      <SectionHeader title={t("visit.recent")} />
      <Card className="divide-y divide-line p-0">
        {visits.map((visit) => (
          <Link
            key={visit.id}
            href={`/${viewKey}/visits/${visit.id}`}
            className="pressable flex items-center gap-3 p-3"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-subtle">
              <Icon name="pin" className="size-4 text-brand" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {shopNameOf(visit, lang)}
              </span>
              <span className="block text-xs text-muted">
                {longDay(dayKey(visit.checked_in_at), { year: false })} ·{" "}
                {timeOf(visit.checked_in_at)}
              </span>
            </span>
            <Chip
              tone={
                visit.cancelled_at !== null
                  ? "danger"
                  : visit.checked_out_at === null
                    ? "brand"
                    : visit.distance_m === null
                      ? "neutral"
                      : visit.out_of_range
                        ? "warn"
                        : "accent"
              }
            >
              {visit.cancelled_at !== null
                ? t("visit.cancelled")
                : visit.checked_out_at === null
                  ? t("visit.open")
                  : distanceLabel(visit.distance_m, lang)}
            </Chip>
            <Icon name="chevron" className="size-4 shrink-0 text-muted" />
          </Link>
        ))}
      </Card>
    </div>
  );
}
