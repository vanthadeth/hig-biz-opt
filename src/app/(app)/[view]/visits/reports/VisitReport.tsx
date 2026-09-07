"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import {
  attendanceDays,
  byPerson,
  groupByMonth,
  groupByWeek,
  hoursMinutes,
  type AttendanceDay,
  type Period,
} from "@/lib/attendance";
import { longDay, monthLabel, timeOf, weekLabel } from "@/lib/time";
import { peopleIn, type ReportVisit } from "@/lib/visits";

type Grain = "day" | "week" | "month";

const GRAINS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

/**
 * Somebody's days, added up three ways.
 *
 * The figures come from `attendance.ts` — the same code the rep's own screen
 * uses, so the office and the person it is about never see two different
 * answers for the same day. Working hours are the day's span, active hours are
 * the time inside shops, and the gap between them is the travelling.
 *
 * A day with a visit somebody never checked out of is marked rather than
 * quietly short. The alternative is a figure that looks like a slow day and is
 * really a missing check-out, and nobody would ever find out which.
 */
export function VisitReport({
  visits,
  now,
}: {
  visits: ReportVisit[];
  now: string;
}) {
  const nowMs = Date.parse(now);
  const people = useMemo(() => peopleIn(visits), [visits]);

  const [grain, setGrain] = useState<Grain>("day");
  const [who, setWho] = useState<string>(() => people[0]?.id ?? "");

  const chosen = people.some((person) => person.id === who) ? who : (people[0]?.id ?? "");

  const days = useMemo(() => {
    const spans = byPerson(
      visits.map((visit) => ({
        userId: visit.user_id,
        checkedInAt: visit.checked_in_at,
        checkedOutAt: visit.checked_out_at,
      })),
    ).get(chosen);
    return spans ? attendanceDays(spans, nowMs) : [];
  }, [visits, chosen, nowMs]);

  const periods = useMemo(() => {
    if (grain === "week") return groupByWeek(days);
    if (grain === "month") return groupByMonth(days);
    return null;
  }, [grain, days]);

  if (people.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted">
        No visits recorded in the last ninety days.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Only worth a control when there is a choice to make. */}
      {people.length > 1 && (
        <label className="grid gap-1">
          <span className="text-xs font-medium text-muted">Employee</span>
          <select
            value={chosen}
            onChange={(e) => setWho(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand"
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <SegmentedTabs
        segments={GRAINS}
        value={grain}
        onChange={(value) => setGrain(value as Grain)}
      />

      {days.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          Nothing recorded for {people.find((p) => p.id === chosen)?.name} in the
          last ninety days.
        </Card>
      ) : periods ? (
        <ul className="space-y-2">
          {periods.map((period) => (
            <li key={period.key}>
              <PeriodCard
                period={period}
                label={grain === "week" ? weekLabel(period.key) : monthLabel(period.key)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {days.map((day) => (
            <li key={day.key}>
              <DayCard day={day} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DayCard({ day }: { day: AttendanceDay }) {
  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{longDay(day.key)}</p>
        {day.open && <Chip tone="brand">Out now</Chip>}
        {day.unclosed && <Chip tone="warn">Never checked out</Chip>}
      </div>

      <p className="text-xs text-muted">
        {/* Clock in and clock out, which are the first check-in and the last
            check-out. An em dash and nothing else when the day is not over. */}
        {day.clockIn ? timeOf(day.clockIn) : "—"}
        {" – "}
        {day.clockOut ? timeOf(day.clockOut) : "—"}
      </p>

      <Figures
        working={day.workingMs}
        active={day.activeMs}
        third={{ label: "Visits", value: String(day.visits) }}
      />
    </Card>
  );
}

function PeriodCard({ period, label }: { period: Period; label: string }) {
  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{label}</p>
        {period.unclosed && <Chip tone="warn">A day was never closed</Chip>}
      </div>

      <p className="text-xs text-muted">
        {period.daysWorked} {period.daysWorked === 1 ? "day" : "days"} worked ·{" "}
        {period.visits} {period.visits === 1 ? "visit" : "visits"}
      </p>

      <Figures
        working={period.workingMs}
        active={period.activeMs}
        third={{
          label: "A day",
          // The average over days actually worked, not over the calendar: a
          // week with two days off is not a week of short days.
          value: period.daysWorked
            ? hoursMinutes(period.workingMs / period.daysWorked)
            : "—",
        }}
      />
    </Card>
  );
}

function Figures({
  working,
  active,
  third,
}: {
  working: number;
  active: number;
  third: { label: string; value: string };
}) {
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      <Figure label="Working" value={hoursMinutes(working)} />
      <Figure label="Active" value={hoursMinutes(active)} />
      <Figure label={third.label} value={third.value} />
    </dl>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-subtle p-2">
      <dd className="text-sm font-semibold tabular-nums text-brand">{value}</dd>
      <dt className="whitespace-nowrap text-xs text-muted">{label}</dt>
    </div>
  );
}
