"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/I18nProvider";
import { QuotaBoxes } from "@/components/ui/QuotaBoxes";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { numberOrNull, quotaProblem, type Quota } from "@/lib/quota";

const textOf = (value: number | null) => (value === null ? "" : String(value));

/**
 * One person's target, set apart from the company's.
 *
 * Only rendered when `can_edit_visit_quota` has already said yes for this
 * particular employee — a system administrator anywhere, a sales supervisor
 * or sales manager down their own line, nobody else. The page decides whether
 * to show the button; this only has to act once it is on screen.
 *
 * A blank box here does not mean zero and does not mean "not managed" the way
 * it does on the company settings screen — it means "follow the company
 * figure", which is why the placeholder is that figure's own number rather
 * than a fixed caption. Typing something overrides it; clearing the box again
 * hands the field back to the company.
 */
export function QuotaAction({
  userId,
  fullName,
  current,
  org,
}: {
  userId: string;
  fullName: string;
  current: Quota;
  org: Quota;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const [text, setText] = useState<Record<keyof Quota, string>>(() => ({
    daily_visit_target: textOf(current.daily_visit_target),
    daily_working_hours: textOf(current.daily_working_hours),
    daily_active_hours: textOf(current.daily_active_hours),
    weekly_visit_target: textOf(current.weekly_visit_target),
    weekly_working_hours: textOf(current.weekly_working_hours),
    weekly_active_hours: textOf(current.weekly_active_hours),
  }));
  const [saved, setSaved] = useState(text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quota: Quota = {
    daily_visit_target: numberOrNull(text.daily_visit_target),
    daily_working_hours: numberOrNull(text.daily_working_hours),
    daily_active_hours: numberOrNull(text.daily_active_hours),
    weekly_visit_target: numberOrNull(text.weekly_visit_target),
    weekly_working_hours: numberOrNull(text.weekly_working_hours),
    weekly_active_hours: numberOrNull(text.weekly_active_hours),
  };

  const problem = quotaProblem(quota);
  const dirty = JSON.stringify(text) !== JSON.stringify(saved);

  async function save() {
    setBusy(true);
    setError(null);

    // One row per person, so a first override and a later change are the same
    // write. `.select()` is what tells a refusal from a success: a policy that
    // says no matches zero rows and raises nothing at all.
    const { data, error: e } = await createClient()
      .from("user_visit_quotas")
      .upsert({ user_id: userId, ...quota }, { onConflict: "user_id" })
      .select("user_id");

    setBusy(false);
    if (e || !data?.length) {
      haptic("error");
      setError(e?.message ?? "That could not be saved.");
      return;
    }
    haptic("success");
    setSaved(text);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setOpen(true);
        }}
        className="pressable flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-medium"
      >
        <Icon name="chart" className="size-4" />
        {t("quota.setAction")}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("quota.forPerson", { name: fullName })}>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted">{t("quota.personCaption")}</p>

          <QuotaBoxes
            text={text}
            onChange={(field, value) => setText((all) => ({ ...all, [field]: value }))}
            disabled={busy}
            placeholder={(field) => (org[field] === null ? t("quota.notManaged") : String(org[field]))}
          />

          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty || problem !== null}
            className="pressable min-h-11 w-full rounded-xl bg-brand text-sm font-semibold text-brand-fg disabled:opacity-50"
          >
            {dirty ? t("common.save") : t("common.saved")}
          </button>

          {problem && dirty && (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
