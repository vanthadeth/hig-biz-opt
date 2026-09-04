"use client";

import { formatTime, KIND_LABELS, type CheckIn } from "@/lib/checkIns";

/** Today's punches, oldest first. Empty until the first one of the day. */
export function TodayTimeline({ checkIns }: { checkIns: CheckIn[] }) {
  if (checkIns.length === 0) {
    return <p className="text-sm text-muted">Nothing recorded today yet.</p>;
  }

  return (
    <ol className="space-y-2.5">
      {checkIns.map((checkIn) => (
        <li key={checkIn.id} className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${
              checkIn.kind === "in" ? "bg-accent" : "bg-muted"
            }`}
          />
          <span className="text-sm font-medium">{KIND_LABELS[checkIn.kind]}</span>
          <span className="ml-auto font-mono text-sm tabular-nums text-muted">
            {formatTime(checkIn.occurred_at)}
          </span>
        </li>
      ))}
    </ol>
  );
}
