"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useI18n, useT } from "@/components/I18nProvider";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { hoursMinutes } from "@/lib/attendance";
import { timeOf } from "@/lib/time";
import {
  dayEnds,
  provinceOf,
  rangeFlag,
  shopNameOf,
  visitLength,
  type VisitRow,
} from "@/lib/visits";

/**
 * A day of calls as the day itself, not as a pile of cards.
 *
 * A list sorted newest-first answers "what did I just do"; a rep looking at
 * yesterday is asking something else — where the day went. So it reads
 * downwards in the order it happened, bracketed by the two moments that
 * define a working day: the first check-in and the last check-out. The rule
 * running down the left is the day, and every call is a stop on it.
 *
 * Each stop says the four things somebody checks: when it started, when it
 * ended, how long that was, and which shop — with its province, because two
 * shops of the same name three provinces apart are two shops and a name alone
 * makes them look like one.
 *
 * The whole row is the link rather than just the name. A shop name on a phone
 * is a target about four millimetres tall, and a rep tapping it in a tuk-tuk
 * should not have to hit it exactly.
 */
export function VisitTimeline({
  viewKey,
  day,
  visits,
  provinces,
  nowMs,
}: {
  viewKey: string;
  day: string;
  visits: VisitRow[];
  provinces: Map<string, string>;
  nowMs: number;
}) {
  const t = useT();
  const { lang } = useI18n();

  // Upwards through the day: the earliest call first, because that is the
  // order it was lived in and the order the two clock marks bracket.
  const inOrder = [...visits].sort((a, b) =>
    a.checked_in_at < b.checked_in_at ? -1 : a.checked_in_at > b.checked_in_at ? 1 : 0,
  );
  const ends = dayEnds(inOrder);

  return (
    <ol className="relative space-y-0">
      {ends.clockIn && <Mark label={t("day.clockIn")} time={timeOf(ends.clockIn)} icon="sun" />}

      {inOrder.map((visit) => {
        const cancelled = visit.cancelled_at !== null;
        const flag = rangeFlag(visit);
        const province = provinceOf(visit, provinces);

        return (
          <li key={visit.id} className="flex gap-3">
            <Rule />

            <div className="min-w-0 flex-1 pb-2.5">
              <Link href={`/${viewKey}/visits/${visit.id}`} className="pressable block">
                <Card className="flex items-center gap-2.5 p-3">
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-medium ${
                        cancelled ? "text-muted line-through" : ""
                      }`}
                    >
                      {shopNameOf(visit, lang)}
                      {province && (
                        <span className="font-normal text-muted"> ({province})</span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs tabular-nums text-muted">
                      {timeOf(visit.checked_in_at)}
                      {"–"}
                      {visit.checked_out_at
                        ? timeOf(visit.checked_out_at)
                        : t("visit.stillOpen")}
                      {" · "}
                      {hoursMinutes(visitLength(visit, nowMs))}
                    </span>
                  </span>

                  {cancelled ? (
                    <Chip tone="danger">{t("visit.cancelled")}</Chip>
                  ) : flag === "away" ? (
                    <Chip tone="warn">{t("visit.away")}</Chip>
                  ) : flag === "unknown" ? (
                    <Chip tone="neutral">{t("visit.noPin")}</Chip>
                  ) : null}

                  <Icon name="chevron" className="size-4 shrink-0 text-muted" />
                </Card>
              </Link>
            </div>
          </li>
        );
      })}

      {ends.open ? (
        <Mark label={t("day.stillOut")} time={null} icon="history" last />
      ) : (
        ends.clockOut && (
          <Mark label={t("day.clockOut")} time={timeOf(ends.clockOut)} icon="moon" last />
        )
      )}

      {/* A day whose every visit was called off: the rule would otherwise
          bracket nothing, and an empty pair of clock marks reads like a bug. */}
      {ends.clockIn === null && !ends.open && (
        <li className="py-1 text-xs text-muted">{t("visit.cancelledPlain")}</li>
      )}
      <span className="sr-only">{day}</span>
    </ol>
  );
}

/** The rule between two stops: the day passing, drawn once. */
function Rule() {
  return (
    <div className="flex w-6 flex-col items-center">
      <span className="mt-4 size-2 shrink-0 rounded-full bg-line" />
      <span className="w-px flex-1 bg-line" />
    </div>
  );
}

/** One end of the day. Bigger than a stop, because it is not a visit. */
function Mark({
  label,
  time,
  icon,
  last = false,
}: {
  label: string;
  time: string | null;
  icon: string;
  last?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex w-6 flex-col items-center">
        {last && <span className="mb-1 w-px flex-1 bg-line" />}
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-subtle text-brand">
          <Icon name={icon} className="size-3.5" />
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-line" />}
      </div>
      <p className={`text-xs text-muted ${last ? "pt-1" : "pb-2.5 pt-1"}`}>
        {label}
        {time && <span className="ml-1.5 font-medium tabular-nums text-fg">{time}</span>}
      </p>
    </li>
  );
}
