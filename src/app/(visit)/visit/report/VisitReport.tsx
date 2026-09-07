"use client";

import { useMemo, useState } from "react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { StatTile } from "@/components/ui/StatTile";
import { Card } from "@/components/ui/Card";
import { VisitRow } from "@/components/visit/VisitRow";
import {
  PERIODS,
  inPeriod,
  periodRange,
  summarise,
  type Period,
  type Visit,
} from "@/lib/visits";

/**
 * The round, by period.
 *
 * Four numbers and the list they came from. The numbers are there to be read at
 * a glance on the way to the next shop; the list is there because a number
 * nobody can open is a number nobody trusts.
 */
export function VisitReport({ visits }: { visits: Visit[] }) {
  const [period, setPeriod] = useState<Period>("today");

  // `now` is read once per render rather than per call, so the tiles and the
  // list cannot land on opposite sides of midnight.
  const { shown, counts } = useMemo(() => {
    const range = periodRange(period, new Date());
    const shown = visits.filter((v) => inPeriod(v, range));
    return { shown, counts: summarise(shown) };
  }, [visits, period]);

  return (
    <div className="space-y-5">
      <SegmentedTabs
        segments={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
        value={period}
        onChange={(v) => setPeriod(v as Period)}
      />

      <section className="grid grid-cols-2 gap-3">
        <StatTile value={counts.visits} label="Visits" tint={1} icon="pin" />
        <StatTile value={counts.completed} label="Completed" tint={2} icon="check" />
        <StatTile value={counts.ordered} label="Orders taken" tint={3} icon="cart" />
        <StatTile value={counts.collected} label="Payments" tint={4} icon="wallet" />
      </section>

      {shown.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">
            Nothing {period === "today" ? "today" : `in this ${period}`} yet.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {shown.map((visit) => (
            <li key={visit.id}>
              <VisitRow visit={visit} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
