"use client";

import { Field } from "@/components/ui/Field";
import { useT } from "@/components/I18nProvider";
import type { Quota } from "@/lib/quota";

/**
 * The six boxes a quota is typed into, shared by the company-wide settings
 * screen and the one-person override on somebody's account page. Both ask the
 * same six questions; only what a blank box means and where it saves differ.
 *
 * The boxes are text rather than number inputs on purpose: a number input on a
 * phone hands back an empty string for "0" in some browsers and swallows the
 * difference between "nothing typed" and "zero", which is exactly the
 * distinction a quota exists to keep.
 */
const BOXES: {
  field: keyof Quota;
  labelKey: "quota.visits" | "quota.workingHours" | "quota.activeHours";
}[][] = [
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

export function QuotaBoxes({
  text,
  onChange,
  disabled,
  placeholder,
}: {
  text: Record<keyof Quota, string>;
  onChange: (field: keyof Quota, value: string) => void;
  disabled: boolean;
  /** What an empty box says. A fixed caption for the company row; the company's
   *  own figure for a person's override, so leaving a box blank visibly means
   *  "follow that number" rather than reading as an unanswered question. */
  placeholder: (field: keyof Quota) => string;
}) {
  const t = useT();

  return (
    <>
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
                onChange={(value) => onChange(box.field, value.replace(/[^\d.]/g, ""))}
                disabled={disabled}
                inputMode="numeric"
                placeholder={placeholder(box.field)}
                optional
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
