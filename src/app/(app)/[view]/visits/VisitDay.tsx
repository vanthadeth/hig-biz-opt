"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useI18n, useT } from "@/components/I18nProvider";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { attendanceDays, groupByWeek, hoursMinutes } from "@/lib/attendance";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { dayKey, longDay, timeOf, weekKey } from "@/lib/time";
import { totalsOfDay, totalsOfPeriod, type Quota } from "@/lib/quota";
import { openVisit, shopNameOf, visitLength, visitsByDay, type VisitRow } from "@/lib/visits";
import { DaySnapshot, hasSnapshot } from "./DaySnapshot";
import { VisitTimeline } from "./VisitTimeline";
import { useFix } from "./useFix";

/**
 * The whole of a rep's day on one screen.
 *
 * Two states, and which one you are in is not a tab somebody chooses — it is
 * whether there is an open visit. Standing outside a shop, the only question
 * is "which shop"; standing inside one, the only question is "how did it go".
 * The screen asks whichever of those applies and puts the other away.
 *
 * The clock arrives as a prop from the server and is then ticked here, so the
 * first render in the browser matches the HTML it is hydrating. A component
 * that reads the clock while rendering renders two different pages, and an
 * open visit's running time is exactly the sort of thing that would flicker.
 */
export function VisitDay({
  viewKey,
  userId,
  visits,
  quota,
  provinces,
  now,
}: {
  viewKey: string;
  userId: string;
  visits: VisitRow[];
  quota: Quota;
  /** Province code to name, so a timeline row can say which one a shop is in. */
  provinces: [string, string][];
  now: string;
}) {
  const router = useRouter();
  const t = useT();
  const { lang } = useI18n();

  const [nowMs, setNowMs] = useState(() => Date.parse(now));
  const { fix, problem: fixProblem } = useFix();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A supervisor's own screen can carry a subordinate's rows too, now that
  // `visit:view:sub` exists -- so every reading of "my day" below, starting
  // with whether the viewer is themselves checked in, has to start from this
  // filtered list rather than the raw, RLS-visible one.
  const mine = useMemo(() => visits.filter((v) => v.user_id === userId), [visits, userId]);

  const open = useMemo(() => openVisit(mine), [mine]);

  // A minute is enough: the running time is shown to the minute, and a ticking
  // second hand on a page somebody is typing into is a distraction.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /**
   * One tap starts the visit.
   *
   * The record is written now, with this moment and this position, and the
   * shop is named on the screen that opens next. The other way round — pick a
   * shop from a list, then check in — stamps the visit with whenever the rep
   * finished scrolling, which is not when they arrived. The time and the place
   * are the evidence; the shop is a detail that can wait thirty seconds.
   */
  async function startVisit() {
    setBusy(true);
    setError(null);

    // The row comes back, so the screen that opens next is that visit's own.
    const { data, error: failed } = await createClient().rpc("check_in", {
      p_customer: null,
      p_latitude: fix?.latitude ?? null,
      p_longitude: fix?.longitude ?? null,
    });

    if (failed || !data?.id) {
      setBusy(false);
      haptic("error");
      setError(failed?.message ?? "That check-in was not recorded.");
      return;
    }
    haptic("success");
    // Left busy on purpose: the button stays disabled until the next screen
    // takes over, so a second tap cannot land in the gap.
    router.push(`/${viewKey}/visits/${data.id}`);
  }

  // The day's figures come from the same maths the reports use, so a rep and
  // the office never see two different answers for the same day.
  const days = useMemo(
    () =>
      attendanceDays(
        mine.map((v) => ({
          checkedInAt: v.checked_in_at,
          checkedOutAt: v.checked_out_at,
          cancelledAt: v.cancelled_at,
        })),
        nowMs,
      ),
    [mine, nowMs],
  );

  const today = useMemo(
    () => days.find((day) => day.key === dayKey(nowMs)) ?? null,
    [days, nowMs],
  );

  // The week the day belongs to, from the same maths, so the two bars never
  // disagree about a visit.
  const week = useMemo(
    () => groupByWeek(days).find((period) => period.key === weekKey(dayKey(nowMs))) ?? null,
    [days, nowMs],
  );

  // Every visit of the viewer's own, cancelled and open alike: the timeline
  // is what their day was. A supervisor's subordinate rows are real and
  // readable now, but they belong on that person's own account page, not
  // folded unlabelled into somebody else's "my day" -- so this stays `mine`,
  // the same list the snapshot and the open-visit check above use.
  const grouped = useMemo(() => visitsByDay(mine), [mine]);
  const provinceNames = useMemo(() => new Map(provinces), [provinces]);
  const hasTargets = hasSnapshot(quota);

  return (
    <div className="space-y-5">
      {/* The day against what it is supposed to be, first, because that is what
          somebody opens this page between calls to find out. It is a card like
          any other — a tap collapses it, and it scrolls away with the rest of
          the page rather than pinning itself over the timeline.

          Where nobody has set a target there is nothing to draw a ring against,
          and the three bare figures lead instead — inventing a quota so the
          page has a chart would be the app telling the office what to manage
          by. */}
      {hasTargets ? (
        <DaySnapshot
          quota={quota}
          today={totalsOfDay(today)}
          week={totalsOfPeriod(week)}
        />
      ) : (
        today && (
          <Link href={`/${viewKey}/visits/reports`} className="pressable block">
            <Card className="grid grid-cols-3 divide-x divide-line p-0">
              <Figure label={t("day.working")} value={hoursMinutes(today.workingMs)} />
              <Figure label={t("day.active")} value={hoursMinutes(today.activeMs)} />
              <Figure label={t("day.visits")} value={String(today.visits)} />
            </Card>
          </Link>
        )
      )}

      {error && (
        <div role="alert">
          <Card className="border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            {error}
          </Card>
        </div>
      )}

      {open ? (
        /* Checked in somewhere: the only thing this screen offers is the way
           back to that visit. Two places to write one record is two records. */
        <Link href={`/${viewKey}/visits/${open.id}`} className="pressable block">
          <Card className="flex items-center gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-fg">
              <Icon name="pin" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {shopNameOf(open, lang)}
              </span>
              <span className="block text-xs text-muted">
                {t("visit.checkedInAt", { time: timeOf(open.checked_in_at) })} ·{" "}
                {t("visit.ago", { length: hoursMinutes(visitLength(open, nowMs)) })}
              </span>
            </span>
            <Chip tone="brand">{t("visit.open")}</Chip>
            <Icon name="chevron" className="size-4 shrink-0 text-muted" />
          </Card>
        </Link>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              void startVisit();
            }}
            disabled={busy}
            className="pressable flex min-h-20 w-full items-center justify-center gap-3 rounded-2xl bg-brand text-lg font-semibold text-brand-fg disabled:opacity-60"
          >
            <Icon name="pin" className="size-6" />
            {busy ? t("visit.starting") : t("visit.new")}
          </button>

          <p className="text-center text-xs text-muted">
            {/* Said before the tap, not after: a rep who knows the shop comes
                second will not go looking for it first. */}
            {fixProblem
              ? fixProblem
              : fix
                ? t("visit.startsHere")
                : t("visit.findingYou")}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Link
          href={`/${viewKey}/visits/reports`}
          className="pressable flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-medium"
        >
          <Icon name="chart" className="size-4" />
          {t("day.report")}
        </Link>
        <Link
          href={`/${viewKey}/visits/map`}
          className="pressable flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-medium"
        >
          <Icon name="pin" className="size-4" />
          {t("day.map")}
        </Link>
      </div>

      {grouped.length > 0 ? (
        <div className="space-y-5">
          {grouped.map((day) => (
            <section key={day.key} className="space-y-2">
              <SectionHeader title={dayHeading(day.key, nowMs, t)} />
              <VisitTimeline
                viewKey={viewKey}
                day={day.key}
                visits={day.visits}
                provinces={provinceNames}
                nowMs={nowMs}
              />
            </section>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-muted">{t("day.nothingYet")}</Card>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 text-center">
      <p className="text-lg font-semibold tabular-nums text-brand">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function dayHeading(
  key: string,
  nowMs: number,
  t: (key: "day.today" | "day.yesterday") => string,
): string {
  if (key === dayKey(nowMs)) return t("day.today");
  if (key === dayKey(nowMs - 86_400_000)) return t("day.yesterday");
  // The date itself stays in English: month names have no Khmer form in this
  // dictionary, and a half-Khmer date reads worse than an English one.
  return longDay(key, { year: false });
}
