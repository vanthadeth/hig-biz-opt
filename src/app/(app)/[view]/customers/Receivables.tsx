import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AGEING_BUCKETS, type Ageing } from "@/lib/customers";
import { formatUsd } from "@/lib/inventory";

/**
 * What this shop owes, and when it was last seen.
 *
 * Two of these four figures are facts the customer record holds — the last
 * visit and the last purchase. The other two are not: a balance and an ageing
 * breakdown are computed from unpaid invoices, and there is no invoice table in
 * this system yet.
 *
 * So the card shows what it has and says plainly what it does not. It would be
 * easy to render zeros here and let them look like a settled account; a shop
 * that owes $4,000 shown as owing nothing is exactly the error this module
 * exists to prevent. `ageing` is the seam: pass it once invoicing lands and the
 * table below fills in, with no other change to this component.
 */
export function Receivables({
  creditLimit,
  lastVisit,
  lastPurchase,
  ageing,
}: {
  creditLimit: number | null;
  lastVisit: string | null;
  lastPurchase: string | null;
  /** Absent until the invoicing module exists to compute it. */
  ageing?: Ageing;
}) {
  return (
    <Card className="p-4">
      <SectionHeader title="Account" />

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Figure label="Credit limit" value={formatUsd(creditLimit) ?? "None set"} />
        <Figure
          label="Balance"
          value={ageing ? (formatUsd(ageing.total) ?? "—") : "Not available yet"}
          muted={!ageing}
        />
        <Figure label="Last visit" value={lastVisit ?? "Never recorded"} muted={!lastVisit} />
        <Figure
          label="Last purchase"
          value={lastPurchase ?? "Never recorded"}
          muted={!lastPurchase}
        />
      </dl>

      <div className="mt-4 border-t border-line pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Ageing
        </h3>

        {ageing ? (
          <ul className="mt-2 divide-y divide-line">
            {ageing.buckets.map((bucket) => (
              <li key={bucket.key} className="flex items-center justify-between py-1.5">
                <span className="text-sm">{bucket.label}</span>
                <span
                  className={`text-sm tabular-nums ${
                    bucket.key !== "current" && bucket.amount > 0 ? "text-danger" : ""
                  }`}
                >
                  {formatUsd(bucket.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {/* The buckets are named even while empty, so it is clear what will
                appear here rather than leaving a blank nobody can interpret. */}
            <p className="mt-2 text-sm text-muted">
              The balance and its ageing are worked out from unpaid invoices, and
              the Invoice module is not built yet. Nothing is shown here rather
              than zeros, because a shop that owes money should never read as
              settled.
            </p>
            <p className="mt-2 text-xs text-muted">
              It will break down as {AGEING_BUCKETS.map((b) => b.label).join(", ")}.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function Figure({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-sm ${muted ? "text-muted" : "font-medium"}`}>{value}</dd>
    </div>
  );
}
