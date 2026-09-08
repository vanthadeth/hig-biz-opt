"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/I18nProvider";
import { Card } from "@/components/ui/Card";
import { Ring } from "@/components/ui/Ring";
import { useScrolledPast } from "@/hooks/useScrollDirection";
import { hoursMinutes } from "@/lib/attendance";
import { anyTarget, barsFor, type Bar, type Measure, type Quota, type Scope } from "@/lib/quota";

/**
 * How the day is going, against what it is supposed to be.
 *
 * This is the first thing on the page and the reason somebody opens it between
 * calls: not "what did I do" — the timeline below answers that — but "am I where
 * I should be by now". Three figures against three targets, one scope at a time.
 *
 * IT COLLAPSES AS YOU SCROLL, INTO A LINE RATHER THAN INTO NOTHING. Two hundred
 * pixels of dashboard is right at the top of the page and wrong over a list
 * somebody is reading; but hiding it outright would put the one number that
 * matters behind a scroll back to the top, which is how a target stops being
 * something anybody looks at. So it shrinks to a sticky strip carrying the
 * leading figure and its bar, and stays on screen the whole way down.
 *
 * The collapse follows scroll *position*, never direction. A panel that grows
 * back on any upward flick expands under the reader's thumb and pushes what
 * they were looking at off the screen — the exact opposite of getting out of
 * the way. This only changes when they are genuinely back at the top.
 *
 * And a tap beats both. Once somebody has opened or shut it deliberately, that
 * is what it does until they say otherwise: an explicit choice outranks a
 * gesture the screen inferred.
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
  const scrolled = useScrolledPast(140);
  // null while nobody has said: the scroll position decides. A tap pins it.
  const [pinned, setPinned] = useState<boolean | null>(null);
  const [scope, setScope] = useState<Scope>("daily");

  const open = pinned ?? !scrolled;

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
  // manages by and the one worth keeping on screen when there is room for one.
  const lead = bars[0];

  return (
    <div className="sticky top-16 z-30 -mx-1 px-1">
      {/* The padding lives on the parts rather than on the card, so the strip
          keeps its own breathing room when the card around it shrinks. */}
      <Card className="overflow-hidden p-0">
        <button
          type="button"
          onClick={() => setPinned(!open)}
          aria-expanded={open}
          className="pressable flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {showing === "daily" ? t("day.soFar") : t("day.thisWeek")}
            </span>
            {!open && lead && (
              /* Collapsed, the strip carries the one figure worth not losing. */
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
    </div>
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
