import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/Icon";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONE,
  VISIT_STATUS_LABELS,
  VISIT_STATUS_TONE,
  type Visit,
} from "@/lib/visits";

/**
 * One visit in a list.
 *
 * Two chips at most: how the visit went, and whether an order came of it. The
 * payment status is on the record rather than here — four chips on a phone row
 * wrap, and a wrapped row of chips is a row nobody scans.
 */
export function VisitRow({ visit }: { visit: Visit }) {
  const at = new Date(visit.checked_in_at);

  return (
    <Card href={`/visit/visits/${visit.id}`} className="flex items-center gap-3 p-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{visit.shop_name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs tabular-nums text-muted">
            {at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>
          {visit.status ? (
            <Chip tone={VISIT_STATUS_TONE[visit.status]}>
              {VISIT_STATUS_LABELS[visit.status]}
            </Chip>
          ) : (
            <Chip tone="brand">Open</Chip>
          )}
          {visit.order_status === "ordered" && (
            <Chip tone={ORDER_STATUS_TONE.ordered}>{ORDER_STATUS_LABELS.ordered}</Chip>
          )}
        </span>
      </span>
      <Icon name="chevron" className="size-4 shrink-0 text-muted" />
    </Card>
  );
}
