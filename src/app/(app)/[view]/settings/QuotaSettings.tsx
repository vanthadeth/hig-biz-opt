"use client";

import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { numberOrNull, quotaProblem, type Quota } from "@/lib/quota";

/**
 * What a day, and a week, is supposed to look like.
 *
 * Six boxes, and every one of them may be left empty. Empty means nobody
 * manages that figure, which is a real answer and the one every business
 * starts on — the screens read it as "draw no bar" rather than "the target is
 * zero", so a company that cares about visit counts and not about hours is
 * never shown two bars it did not ask for.
 *
 * Weekly is typed rather than multiplied. Five times the daily figure is a
 * guess about a six-day week, and a company that works Saturday mornings would
 * spend its time fighting the arithmetic instead of typing a number.
 *
 * The boxes are text rather than number inputs on purpose: a number input on a
 * phone hands back an empty string for "0" in some browsers and swallows the
 * difference between "nothing typed" and "zero", which is exactly the
 * distinction this screen exists to keep.
 */
const BOXES: { field: keyof Quota; labelKey: "quota.visits" | "quota.workingHours" | "quota.activeHours" }[][] = [
  [
    { field: "daily_visit_target", labelKey: "quota.visits" },
    { field: "daily_working_hours", labelKey: "quota.workingHours" },
    { field: "daily_active_hours", labelKey: "quota.activeHours" },
  ],
  [
    { field: "weekly_visit_target", labelKey: "quota.visits" },
    { field: "weekly_working_hours", labelKey: "quota.workingHours" },
    { field: "weekly_active_hours", labelKey: "quota.activeHours" },
  ],
];

const textOf = (value: number | null) => (value === null ? "" : String(value));

export function QuotaSettings({
  current,
  canEdit,
}: {
  current: Quota;
  canEdit: boolean;
}) {
  const t = useT();

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

    // `.select()` because an update the policy refuses matches no rows and
    // raises nothing at all — without it somebody who may not edit settings
    // would watch the numbers stay put and believe they had saved them.
    const { data, error: e } = await createClient()
      .from("app_settings")
      .update(quota)
      .eq("id", true)
      .select("daily_visit_target");

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
    <Card className="space-y-4 p-4">
      <SectionHeader title={t("quota.title")} caption={t("quota.caption")} />

      {BOXES.map((row, at) => (
        <div key={at} className="space-y-2">
          <p className="text-xs font-medium text-muted">
            {at === 0 ? t("quota.daily") : t("quota.weekly")}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {row.map((box) => (
              <Field
                key={box.field}
                label={t(box.labelKey)}
                value={text[box.field]}
                onChange={(value) =>
                  setText((all) => ({ ...all, [box.field]: value.replace(/[^\d.]/g, "") }))
                }
                disabled={!canEdit || busy}
                inputMode="numeric"
                placeholder={t("quota.notManaged")}
                optional
              />
            ))}
          </div>
        </div>
      ))}

      <p className="text-sm text-muted">{t("quota.activeMeaning")}</p>

      {canEdit && (
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty || problem !== null}
          className="pressable min-h-11 w-full rounded-xl bg-brand text-sm font-semibold text-brand-fg disabled:opacity-50"
        >
          {dirty ? t("common.save") : t("common.saved")}
        </button>
      )}

      {!canEdit && <p className="text-sm text-muted">You may see this but not change it.</p>}

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
    </Card>
  );
}
