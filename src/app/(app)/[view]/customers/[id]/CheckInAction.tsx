"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/I18nProvider";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { useFix } from "../../visits/useFix";

/**
 * Check in at this shop, from its own record.
 *
 * The same one-tap path the nearby-customer screen offers, just reached the
 * other way round: there the shop is found by distance and the record is a
 * tap away, here somebody already opened the record — an existing account,
 * a follow-up call, one found through search rather than by standing outside
 * it — and checking in from here is the shorter route than leaving to find
 * it again on the day screen.
 *
 * Only rendered when the caller has already confirmed `visit:add` and an
 * active shop; the RPC still refuses on its own terms (already checked in
 * elsewhere, in particular), and that refusal is what shows, not a guess
 * made here first.
 */
export function CheckInAction({
  viewKey,
  customerId,
}: {
  viewKey: string;
  customerId: string;
}) {
  const t = useT();
  const router = useRouter();
  const { fix } = useFix();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkIn() {
    haptic("tap");
    setBusy(true);
    setError(null);

    const { data, error: failed } = await createClient().rpc("check_in", {
      p_customer: customerId,
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

  // A flex item of its own, the same width as the Edit/Map buttons it sits
  // beside, so a refusal can stack a line under this button alone rather
  // than forcing a paragraph the whole width of the row.
  return (
    <div className="flex-1">
      <button
        type="button"
        onClick={checkIn}
        disabled={busy}
        className="pressable flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
      >
        <Icon name="pin" className="size-4" />
        {busy ? t("customer.checkingIn") : t("customer.checkInHere")}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
