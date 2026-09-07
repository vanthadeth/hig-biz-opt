"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { mappableDays, pinsFor } from "@/lib/mapView";
import { longDay, timeOf } from "@/lib/time";
import { distanceLabel, peopleIn, type ReportVisit } from "@/lib/visits";

// Leaflet touches `window` on the way in, so the map is never part of the
// server render. Everything around it is.
const VisitMapCanvas = dynamic(
  () => import("./VisitMapCanvas").then((mod) => mod.VisitMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="h-[60vh] min-h-72 w-full animate-pulse rounded-2xl bg-subtle" />
    ),
  },
);

/**
 * Where somebody was, on one day.
 *
 * A day at a time rather than everything at once: a quarter of a rep's calls
 * on one map is a cloud of pins nobody can read, and the question anybody
 * actually asks is "where was Sokha on Tuesday".
 *
 * The numbered discs are check-ins, in the order of the day, and the line
 * through them is the route. The hollow rings are where the shops are
 * recorded, and the dashed line to one is how far off the check-in was. That
 * gap is the point of the whole screen: it is either a bad fix, a shop pinned
 * in the wrong place, or somebody who was not where they said — and the map
 * shows the gap without deciding which.
 */
export function VisitMapView({ visits }: { visits: ReportVisit[] }) {
  const people = useMemo(() => peopleIn(visits), [visits]);
  const [who, setWho] = useState(() => people[0]?.id ?? "");
  const chosen = people.some((person) => person.id === who) ? who : (people[0]?.id ?? "");

  const mine = useMemo(
    () => visits.filter((visit) => visit.user_id === chosen),
    [visits, chosen],
  );
  const days = useMemo(() => mappableDays(mine), [mine]);

  const [day, setDay] = useState<string | null>(null);
  const shown = day && days.includes(day) ? day : (days[0] ?? null);

  const pins = useMemo(() => (shown ? pinsFor(mine, shown) : []), [mine, shown]);

  if (people.length === 0 || days.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted">
        {/* Distinct messages: nothing recorded is a different problem from
            nothing having a position on it, and they need different fixes. */}
        {people.length === 0
          ? "No visits recorded in the last ninety days."
          : "None of these visits has a position on it, so there is nothing to map. Pin the shops, or turn location on before checking in."}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {people.length > 1 && (
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted">Employee</span>
            <select
              value={chosen}
              onChange={(e) => {
                setWho(e.target.value);
                setDay(null); // Their days, not the last person's.
              }}
              className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand"
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="grid gap-1">
          <span className="text-xs font-medium text-muted">Day</span>
          <select
            value={shown ?? ""}
            onChange={(e) => setDay(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand"
          >
            {days.map((key) => (
              <option key={key} value={key}>{longDay(key)}</option>
            ))}
          </select>
        </label>
      </div>

      <VisitMapCanvas pins={pins} />

      <ol className="space-y-2">
        {pins.map((pin) => (
          <li key={pin.visitId}>
            <Card className="flex items-center gap-3 p-3">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  pin.outOfRange ? "bg-warn text-warn-fg" : "bg-brand text-brand-fg"
                }`}
              >
                {pin.order}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{pin.shopName}</span>
                <span className="block text-xs text-muted">{timeOf(pin.checkedInAt)}</span>
              </span>
              {!pin.at && <Chip tone="neutral">No fix</Chip>}
              {pin.at && <Chip tone={pin.outOfRange ? "warn" : "accent"}>
                {distanceLabel(pin.distanceM)}
              </Chip>}
            </Card>
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted">
        Numbered discs are check-ins, in the order of the day. Rings are where
        the shops are recorded; a dashed line to one is the distance between
        them. Maps are drawn with tiles from OpenStreetMap and need a
        connection — the pins do not.
      </p>
    </div>
  );
}
