"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useI18n, useT } from "@/components/I18nProvider";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import {
  customerWhere,
  distanceMetres,
  nearestCustomers,
  type CartCustomer,
} from "@/lib/catalog";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { daysSince } from "@/lib/time";
import { distanceLabel } from "@/lib/visits";
import { useFix } from "../../visits/useFix";

const SHOWN = 5;

/**
 * The shops around here, closest first.
 *
 * Deliberately a short list rather than a jump straight to the top answer. A
 * phone's fix is good to a few metres at best and often much worse, and two
 * shops in a row of shophouses are twenty metres apart — so opening the wrong
 * customer record with no way to tell it was wrong is worse than one more tap.
 * The nearest is offered large; the next few sit under it.
 *
 * Balance has no figure to show — there is no invoice table yet — so its slot
 * stays in place with a dash rather than a number, the same rule
 * {@link ../../customers/Receivables.tsx} follows for the full account view.
 * Last visit comes from `visits` directly, filtered by whatever `visit:view`
 * scope the viewer holds, so a rep sees their own history with a shop and a
 * supervisor sees their line's.
 *
 * Checking in from here calls `check_in` with the shop already named, rather
 * than the anonymous-then-name-it path the main Visits screen uses. That path
 * exists because naming a shop from a long, searched list takes time the
 * check-in moment should not wait on; choosing one of five rows already
 * sorted by distance is the one tap the button says it is.
 *
 * Without a position this is just the customer list, alphabetically, which is
 * what the customers page already is. Said plainly rather than left to look
 * broken.
 */
export function NearestCustomer({
  viewKey,
  customers,
  lastVisits,
  now,
}: {
  viewKey: string;
  customers: CartCustomer[];
  /** Customer id to the ISO time of their most recent (non-cancelled) visit. */
  lastVisits: [string, string][];
  now: string;
}) {
  const t = useT();
  const { lang } = useI18n();
  const { fix, problem } = useFix();
  const router = useRouter();

  const nowMs = useMemo(() => Date.parse(now), [now]);
  const lastVisitOf = useMemo(() => new Map(lastVisits), [lastVisits]);

  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ranked = useMemo(() => {
    const sorted = nearestCustomers(customers, fix);
    return sorted.slice(0, SHOWN).map((customer) => ({
      customer,
      metres: fix ? distanceMetres(fix, customer) : null,
      lastVisitAt: lastVisitOf.get(customer.id) ?? null,
    }));
  }, [customers, fix, lastVisitOf]);

  function lastVisitLabel(lastVisitAt: string | null): string {
    if (lastVisitAt === null) return t("customer.neverVisited");
    const days = daysSince(lastVisitAt, nowMs);
    if (days === 0) return t("day.today");
    if (days === 1) return t("day.yesterday");
    return t("customer.daysAgo", { n: days });
  }

  /** Check in, already at this shop -- no picker, because there is nothing left
   * to pick. */
  async function checkInHere(customerId: string) {
    haptic("tap");
    setCheckingIn(customerId);
    setError(null);

    const { data, error: failed } = await createClient().rpc("check_in", {
      p_customer: customerId,
      p_latitude: fix?.latitude ?? null,
      p_longitude: fix?.longitude ?? null,
    });

    if (failed || !data?.id) {
      setCheckingIn(null);
      haptic("error");
      setError(failed?.message ?? "That check-in was not recorded.");
      return;
    }
    haptic("success");
    // Left set on purpose: the button stays disabled until the next screen
    // takes over, so a second tap cannot land in the gap.
    router.push(`/${viewKey}/visits/${data.id}`);
  }

  if (customers.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted">
        {t("customer.none")}
      </Card>
    );
  }

  const [top, ...others] = ranked;

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert">
          <Card className="border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            {error}
          </Card>
        </div>
      )}

      {!fix && (
        <Card className="flex items-start gap-2 p-3 text-xs text-muted">
          <Icon name="pin" className="mt-0.5 size-4 shrink-0" />
          <span>{problem ?? t("visit.findingYou")}</span>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <Link
          href={`/${viewKey}/customers/${top.customer.id}`}
          className="pressable flex items-center gap-3"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-brand-fg">
            <Icon name="building" className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">
              {top.customer.shop_name}
            </span>
            <span className="block truncate text-xs text-muted">
              {customerWhere(top.customer) ?? t("customer.noAddress")}
            </span>
          </span>
          {top.metres !== null && <Chip tone="accent">{distanceLabel(top.metres, lang)}</Chip>}
          <Icon name="chevron" className="size-4 shrink-0 text-muted" />
        </Link>

        <Facts
          t={t}
          lastVisitLabel={lastVisitLabel(top.lastVisitAt)}
          busy={checkingIn === top.customer.id}
          onCheckIn={() => checkInHere(top.customer.id)}
        />
      </Card>

      {others.length > 0 && (
        <ul className="space-y-2">
          {others.map(({ customer, metres, lastVisitAt }) => (
            <li key={customer.id}>
              <Card className="space-y-2 p-3">
                <Link
                  href={`/${viewKey}/customers/${customer.id}`}
                  className="pressable flex items-center gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {customer.shop_name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {customerWhere(customer) ?? t("customer.noAddress")}
                    </span>
                  </span>
                  {metres !== null && <Chip tone="neutral">{distanceLabel(metres, lang)}</Chip>}
                  <Icon name="chevron" className="size-4 shrink-0 text-muted" />
                </Link>

                <Facts
                  t={t}
                  lastVisitLabel={lastVisitLabel(lastVisitAt)}
                  busy={checkingIn === customer.id}
                  onCheckIn={() => checkInHere(customer.id)}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/${viewKey}/customers`}
        className="pressable block w-full rounded-xl border border-line py-2 text-center text-sm text-muted"
      >
        {t("customer.all")}
      </Link>
    </div>
  );
}

/** Balance, last visit, and the one button that matters -- under every row,
 * top and rest alike, so the shape of the information does not change with
 * how close the shop is. */
function Facts({
  t,
  lastVisitLabel,
  busy,
  onCheckIn,
}: {
  t: ReturnType<typeof useT>;
  lastVisitLabel: string;
  busy: boolean;
  onCheckIn: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line pt-2 text-xs text-muted">
      <span>
        {t("customer.balance")} <span className="font-medium text-fg">—</span>
      </span>
      <span className="truncate">
        {t("customer.lastVisit")}{" "}
        <span className="font-medium text-fg">{lastVisitLabel}</span>
      </span>
      <button
        type="button"
        onClick={onCheckIn}
        disabled={busy}
        className="pressable shrink-0 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-brand-fg disabled:opacity-60"
      >
        {busy ? t("customer.checkingIn") : t("customer.checkInHere")}
      </button>
    </div>
  );
}
