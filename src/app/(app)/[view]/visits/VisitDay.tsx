"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { attendanceDays, hoursMinutes } from "@/lib/attendance";
import { haptic } from "@/lib/haptics";
import type { CartCustomer } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/client";
import { dayKey, longDay, timeOf } from "@/lib/time";
import { openVisit, visitLength, visitsByDay, type VisitRow } from "@/lib/visits";
import { CheckInPanel } from "./CheckInPanel";
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
  customers,
  radiusM,
  now,
}: {
  viewKey: string;
  userId: string;
  visits: VisitRow[];
  customers: CartCustomer[];
  radiusM: number;
  now: string;
}) {
  const router = useRouter();

  const [nowMs, setNowMs] = useState(() => Date.parse(now));
  const { fix, problem: fixProblem } = useFix();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useMemo(() => openVisit(visits), [visits]);

  // A minute is enough: the running time is shown to the minute, and a ticking
  // second hand on a page somebody is typing into is a distraction.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function checkIn(customer: CartCustomer) {
    setBusy(true);
    setError(null);

    // The row comes back, so the screen that opens next is that visit's own.
    const { data, error: failed } = await createClient().rpc("check_in", {
      p_customer: customer.id,
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
  const mine = useMemo(() => visits.filter((v) => v.user_id === userId), [visits, userId]);
  const today = useMemo(() => {
    const days = attendanceDays(
      mine.map((v) => ({ checkedInAt: v.checked_in_at, checkedOutAt: v.checked_out_at })),
      nowMs,
    );
    return days.find((day) => day.key === dayKey(nowMs)) ?? null;
  }, [mine, nowMs]);

  const grouped = useMemo(
    () => visitsByDay(visits.filter((v) => v.checked_out_at !== null)),
    [visits],
  );

  return (
    <div className="space-y-5">
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
                {open.customer?.shop_name ?? "Shop removed"}
              </span>
              <span className="block text-xs text-muted">
                Checked in {timeOf(open.checked_in_at)} ·{" "}
                {hoursMinutes(visitLength(open, nowMs))} ago
              </span>
            </span>
            <Chip tone="brand">Open</Chip>
            <Icon name="chevron" className="size-4 shrink-0 text-muted" />
          </Card>
        </Link>
      ) : (
        <div className="space-y-3">
          {fixProblem && (
            <Card className="flex items-start gap-2 p-3 text-xs text-muted">
              <Icon name="pin" className="mt-0.5 size-4 shrink-0" />
              <span>{fixProblem}</span>
            </Card>
          )}
          <CheckInPanel
            customers={customers}
            fix={fix}
            radiusM={radiusM}
            busy={busy}
            onCheckIn={checkIn}
          />
        </div>
      )}

      {today && (
        <Link href={`/${viewKey}/visits/reports`} className="pressable block">
          <Card className="grid grid-cols-3 divide-x divide-line p-0">
            <Figure label="Working" value={hoursMinutes(today.workingMs)} />
            <Figure label="Active" value={hoursMinutes(today.activeMs)} />
            <Figure label="Visits" value={String(today.visits)} />
          </Card>
        </Link>
      )}

      <div className="flex gap-2">
        <Link
          href={`/${viewKey}/visits/reports`}
          className="pressable flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-medium"
        >
          <Icon name="chart" className="size-4" />
          Report
        </Link>
        <Link
          href={`/${viewKey}/visits/map`}
          className="pressable flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-medium"
        >
          <Icon name="pin" className="size-4" />
          Map
        </Link>
      </div>

      {grouped.length > 0 && (
        <div className="space-y-4">
          {grouped.map((day) => (
            <section key={day.key} className="space-y-2">
              <SectionHeader title={dayHeading(day.key, nowMs)} />
              <ul className="space-y-2">
                {day.visits.map((visit) => (
                  <li key={visit.id}>
                    <Link href={`/${viewKey}/visits/${visit.id}`} className="pressable block">
                      <Card className="flex items-center gap-3 p-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {visit.customer?.shop_name ?? "Shop removed"}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {timeOf(visit.checked_in_at)}
                            {visit.checked_out_at && `–${timeOf(visit.checked_out_at)}`} ·{" "}
                            {hoursMinutes(visitLength(visit, nowMs))}
                          </span>
                        </span>
                        {visit.out_of_range && <Chip tone="warn">Out of range</Chip>}
                        <Icon name="chevron" className="size-4 shrink-0 text-muted" />
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
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

function dayHeading(key: string, nowMs: number): string {
  if (key === dayKey(nowMs)) return "Today";
  if (key === dayKey(nowMs - 86_400_000)) return "Yesterday";
  return longDay(key, { year: false });
}
