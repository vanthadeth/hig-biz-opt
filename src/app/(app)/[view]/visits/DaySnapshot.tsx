"use client";

import { useT } from "@/components/I18nProvider";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { hoursMinutes } from "@/lib/attendance";
import { barsFor, type Bar, type Measure, type Quota } from "@/lib/quota";

/**
 * How the day is going, against what it is supposed to be.
 *
 * The three figures were already on this screen; what they were missing was
 * the other half of the sentence. "6h 50m working" is a number. "6h 50m of 8h"
 * is an answer, and it is the answer somebody standing outside a shop at four
 * in the afternoon is actually asking for.
 *
 * A measure nobody has set a target for draws no bar. Not an empty one, not a
 * full one — none, because a bar against a target that does not exist is a
 * judgement nobody made. A business that manages visit counts and not hours
 * sees one bar, and that is correct rather than broken.
 *
 * The bar stops at full; the figures beside it do not. Nine calls against a
 * target of eight reads "9 of 8" with the bar complete, because clipping the
 * ninth would hide the best thing that happened today.
 */
export function DaySnapshot({
  quota,
  today,
  week,
}: {
  quota: Quota;
  today: { visits: number; workingMs: number; activeMs: number } | null;
  week: { visits: number; workingMs: number; activeMs: number } | null;
}) {
  const t = useT();

  const daily = barsFor(today, quota, "daily");
  const weekly = barsFor(week, quota, "weekly");
  if (daily.length === 0 && weekly.length === 0) return null;

  return (
    <Card className="space-y-4 p-4">
      {daily.length > 0 && <ScopeBars title={t("day.soFar")} bars={daily} />}
      {weekly.length > 0 && (
        <div className={daily.length > 0 ? "border-t border-line pt-4" : ""}>
          <ScopeBars title={t("day.thisWeek")} bars={weekly} />
        </div>
      )}
    </Card>
  );
}

function ScopeBars({ title, bars }: { title: string; bars: Bar[] }) {
  const t = useT();

  return (
    <div className="space-y-3">
      <SectionHeader title={title} />
      {bars.map((bar) => (
        <ProgressBar
          key={bar.measure}
          value={bar.percent}
          // Green once it is met, because green is what this app already means
          // by "good" everywhere else; blue while it is still in progress.
          tone={bar.met ? "accent" : "brand"}
          label={`${t(LABEL[bar.measure])} · ${t("day.ofTarget", {
            done: amount(bar.measure, bar.done),
            target: amount(bar.measure, bar.target),
          })}`}
        />
      ))}
    </div>
  );
}

const LABEL: Record<Measure, "day.visits" | "day.working" | "day.active"> = {
  visits: "day.visits",
  working: "day.working",
  active: "day.active",
};

/** Visits are a count; the other two are durations, said the way the rest of the app says them. */
function amount(measure: Measure, value: number): string {
  return measure === "visits" ? String(value) : hoursMinutes(value);
}
