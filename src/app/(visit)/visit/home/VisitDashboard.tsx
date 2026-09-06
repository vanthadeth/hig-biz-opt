"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatTile } from "@/components/ui/StatTile";
import { VisitRow } from "@/components/visit/VisitRow";
import { customerWhere } from "@/lib/geo";
import type { Visit, VisitSummary } from "@/lib/visits";

/**
 * The morning screen.
 *
 * An open visit takes the whole top of it, in the brand colour, because a rep
 * who is still checked in somewhere is looking at a phone that is quietly
 * wrong about where they are — and because that is the one state this app can
 * be in that needs doing something about.
 */
export function VisitDashboard({
  firstName,
  greeting,
  today,
  open,
  openFor,
  visits,
  counts,
}: {
  firstName: string;
  greeting: string;
  today: string;
  open: Visit | null;
  /**
   * How long they have been in there, measured on the server.
   *
   * Read there rather than here because this component is rendered twice — once
   * on the server, once on hydration — and a clock read in the middle of a
   * render gives a different answer each time, which React sees as the markup
   * having changed underneath it.
   */
  openFor: string | null;
  visits: Visit[];
  counts: VisitSummary;
}) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          {greeting}, {firstName}
        </h1>
        <p className="mt-0.5 text-sm text-muted">{today}</p>
      </header>

      {open ? (
        <Link href={`/visit/visits/${open.id}`} className="pressable block">
          <div className="rounded-2xl bg-brand p-4 text-brand-fg shadow-[var(--shadow-card)]">
            <p className="text-xs opacity-80">Still checked in</p>
            <p className="mt-1 truncate text-lg font-semibold tracking-tight">
              {open.shop_name}
            </p>
            <p className="mt-0.5 truncate text-xs opacity-80">
              {[
                openFor,
                customerWhere({
                  street_address: open.street_address,
                  district_text: open.district_text,
                  province_text: open.province_text,
                }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-3 flex items-center gap-1 text-sm font-medium">
              Record the visit and check out
              <Icon name="chevron" className="size-4" />
            </p>
          </div>
        </Link>
      ) : (
        <Link href="/visit/check-in" className="pressable block">
          <Card className="flex items-center gap-3 p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Icon name="pin" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Check in</span>
              <span className="block text-xs text-muted">
                Pick the shop you are standing in.
              </span>
            </span>
            <Icon name="chevron" className="size-4 shrink-0 text-muted" />
          </Card>
        </Link>
      )}

      <section className="grid grid-cols-3 gap-3">
        <StatTile value={counts.visits} label="Today" tint={1} icon="pin" />
        <StatTile value={counts.ordered} label="Orders" tint={2} icon="cart" />
        <StatTile value={counts.collected} label="Payments" tint={3} icon="wallet" />
      </section>

      <section>
        <SectionHeader
          title="Today"
          caption="Where you have been"
          actionLabel="Report"
          actionHref="/visit/report"
        />
        {visits.length === 0 ? (
          <Card className="mt-3 p-6 text-center">
            <p className="text-sm text-muted">Nothing yet today.</p>
          </Card>
        ) : (
          <ul className="mt-3 space-y-2">
            {visits.map((visit) => (
              <li key={visit.id}>
                <VisitRow visit={visit} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
