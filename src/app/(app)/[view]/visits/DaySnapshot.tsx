"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/I18nProvider";
import { Card } from "@/components/ui/Card";
import { Ring } from "@/components/ui/Ring";
import { hoursMinutes } from "@/lib/attendance";
import { anyTarget, barsFor, type Bar, type Measure, type Quota, type Scope } from "@/lib/quota";

/**
 * How the day is going, against what it is supposed to be.
 *
 * The first card on the page and the reason somebody opens it between calls:
 * not "what did I do" — the timeline below answers that — but "am I where I
 * should be by now". Three figures against three targets, one scope at a time.
 *
 * It scrolls with the page like any other card. It used to pin itself under the
 * title bar and shrink to a strip as the timeline scrolled underneath, which
 * put a second bar fighting the real one for the same 56 pixels. A collapsed
 * card that scrolls away like everything else is a simpler promise: open it to
 * check the day, close it to make room, and either way it behaves like the
 * rest of the list around it rather than like chrome.
 *
 * Closing is a tap, not a scroll. Nothing here reacts to scroll position, so
 * there is no gesture for the reader to fight — what they last chose is what
 * it shows.
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
  const [open, setOpen] = useState(true);
  const [scope, setScope] = useState<Scope>("daily");

  const dailyBars = barsFor(today, quota, "daily");
  const weeklyBars = barsFor(week, quota, "weekly");

  // A scope nobody manages is not offered: a tab that leads to an empty panel
  // is a tab that teaches people not to press it.
  const scopes = ([["daily", dailyBars], ["weekly", weeklyBars]] as const)
    .filter(([, bars]) => bars.length > 0)
    .map(([key]) => key);

  if (scopes.length === 0) return null;

  const showing = scopes.includes(scope) ? scope : scopes[0];
  const bars = showing === "daily" ? dailyBars : weeklyBars;
  // Visits first where it is managed, because that is the figure the business
  // manages by and the one worth keeping visible when there is room for one.
  const lead = bars[0];

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="pressable flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {showing === "daily" ? t("day.soFar") : t("day.thisWeek")}
          </span>
          {!open && lead && (
            /* Collapsed, the header carries the one figure worth not losing. */
            <span className="mt-0.5 block text-xs text-muted">
              {t(LABEL[lead.measure])} ·{" "}
              <span className="font-medium tabular-nums text-fg">
                {amount(lead.measure, lead.done)}
              </span>{" "}
              / {amount(lead.measure, lead.target)}
            </span>
          )}
        </span>

        {!open && lead && (
          <span
            className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-subtle"
            role="progressbar"
            aria-valuenow={Math.round(lead.percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t(LABEL[lead.measure])}
          >
            <span
              className={`block h-full rounded-full transition-[width] duration-500 ${
                lead.met ? "bg-accent" : "bg-brand"
              }`}
              style={{ width: `${Math.round(lead.percent)}%` }}
            />
          </span>
        )}

        <Icon
          name="chevron"
          className={`size-4 shrink-0 text-muted transition-transform duration-200 ${
            open ? "-rotate-90" : "rotate-90"
          }`}
        />
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          {scopes.length > 1 && (
            <div role="tablist" className="flex gap-1 rounded-full bg-subtle p-1">
              {scopes.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={key === showing}
                  onClick={() => setScope(key)}
                  className="pressable min-h-8 flex-1 rounded-full text-xs font-medium text-muted aria-selected:bg-surface aria-selected:text-fg aria-selected:shadow-sm"
                >
                  {key === "daily" ? t("day.today") : t("day.thisWeek")}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-start justify-around gap-2">
            {bars.map((bar) => (
              <Ring
                key={bar.measure}
                percent={bar.percent}
                met={bar.met}
                label={t(LABEL[bar.measure])}
                done={amount(bar.measure, bar.done)}
                target={amount(bar.measure, bar.target)}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Whether anything is managed at all — what decides if the section exists. */
export function hasSnapshot(quota: Quota): boolean {
  return anyTarget(quota, "daily") || anyTarget(quota, "weekly");
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

export type { Bar };
