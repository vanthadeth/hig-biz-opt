import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/Icon";
import { customerWhere } from "@/lib/geo";
import { durationLabel, editableUntil, visitMinutes, type Visit } from "@/lib/visits";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/**
 * The stamps: which shop, when the rep arrived, when they left.
 *
 * Facts, not fields. Nothing here is ever an input — `guard_visit_edit()` in
 * 0047 refuses to change any of it, and a form that offered the attempt would
 * only be a way to meet that refusal.
 */
export function VisitFacts({ visit, editable }: { visit: Visit; editable: boolean }) {
  const where = customerWhere({
    street_address: visit.street_address,
    district_text: visit.district_text,
    province_text: visit.province_text,
  });
  const minutes = visitMinutes(visit);
  const until = editableUntil(visit);

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Icon name="building" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight">
            {visit.shop_name}
          </h2>
          {where && <p className="truncate text-xs text-muted">{where}</p>}
        </div>
        {visit.checked_out_at === null && <Chip tone="brand">Open</Chip>}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Checked in</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{time(visit.checked_in_at)}</dd>
          <dd className="text-xs text-muted">{day(visit.checked_in_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Checked out</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {visit.checked_out_at ? time(visit.checked_out_at) : "—"}
          </dd>
          {visit.checked_out_at && (
            <dd className="text-xs text-muted">{day(visit.checked_out_at)}</dd>
          )}
        </div>
        <div>
          <dt className="text-xs text-muted">In the shop</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {durationLabel(minutes) ?? "Still there"}
          </dd>
        </div>
      </dl>

      {/* Said while it still means something. A rep who needs to fix an answer
          should learn how long they have before they need it, not after. */}
      {until && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          {editable
            ? `Editable until ${time(until.toISOString())} on ${day(until.toISOString())}.`
            : `Closed for editing on ${day(until.toISOString())}.`}
        </p>
      )}
    </Card>
  );
}
