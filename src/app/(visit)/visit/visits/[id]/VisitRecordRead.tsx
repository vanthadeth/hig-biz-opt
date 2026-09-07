import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONE,
  VISIT_STATUS_LABELS,
  VISIT_STATUS_TONE,
  VISIT_TYPE_LABELS,
  type Visit,
} from "@/lib/visits";

/** What the visit says, once nobody may change it any more. */
export function VisitRecordRead({ visit }: { visit: Visit }) {
  return (
    <Card className="divide-y divide-line">
      <Row label="Type of visit">
        {visit.visit_type ? <Chip>{VISIT_TYPE_LABELS[visit.visit_type]}</Chip> : null}
      </Row>
      <Row label="Visit status">
        {visit.status ? (
          <Chip tone={VISIT_STATUS_TONE[visit.status]}>
            {VISIT_STATUS_LABELS[visit.status]}
          </Chip>
        ) : null}
      </Row>
      <Row label="Order status">
        {visit.order_status ? (
          <Chip tone={ORDER_STATUS_TONE[visit.order_status]}>
            {ORDER_STATUS_LABELS[visit.order_status]}
          </Chip>
        ) : null}
      </Row>
      <Row label="Payment status">
        {visit.payment_status ? (
          <Chip tone={PAYMENT_STATUS_TONE[visit.payment_status]}>
            {PAYMENT_STATUS_LABELS[visit.payment_status]}
          </Chip>
        ) : null}
      </Row>
      <Row label="Next appointment">
        {visit.next_appointment_date ? (
          <span className="text-sm tabular-nums">
            {new Date(visit.next_appointment_date).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        ) : null}
      </Row>
      {visit.remarks && (
        <div className="p-4">
          <p className="text-xs text-muted">Remarks</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{visit.remarks}</p>
        </div>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <span className="text-sm text-muted">{label}</span>
      {children ?? <span className="text-sm text-muted">—</span>}
    </div>
  );
}
