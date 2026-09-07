"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";

/**
 * How close counts as being at the shop.
 *
 * Not a gate. A check-in further away than this is still recorded — a phone
 * inside a concrete building can be three hundred metres out, and refusing the
 * check-in would lose a real visit to protect a number. What the setting does
 * is decide which visits get flagged, and the flag is what the report filters
 * on.
 *
 * The choices are round numbers rather than a free number box, because the
 * difference between 200 and 215 metres is not a decision anybody is really
 * making, and a box invites arguing about it.
 */
const CHOICES = [
  { metres: 50, label: "50 m", caption: "A shopfront" },
  { metres: 100, label: "100 m", caption: "A street corner" },
  { metres: 200, label: "200 m", caption: "A city block" },
  { metres: 500, label: "500 m", caption: "Rough signal" },
  { metres: 1000, label: "1 km", caption: "Countryside" },
];

export function CheckInSettings({
  current,
  canEdit,
}: {
  current: number;
  canEdit: boolean;
}) {
  const [radius, setRadius] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: number) {
    if (next === radius || saving) return;
    const previous = radius;

    haptic("select");
    setRadius(next);
    setSaving(true);
    setError(null);

    // `.select()` because an update the policy refuses matches no rows and
    // raises nothing at all — without it a rep who may not edit settings would
    // watch the button move and believe it.
    const { data, error: e } = await createClient()
      .from("app_settings")
      .update({ checkin_radius_m: next })
      .eq("id", true)
      .select("checkin_radius_m");

    setSaving(false);
    if (e || !data?.length) {
      haptic("error");
      setRadius(previous);
      setError(e?.message ?? "That could not be saved.");
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <SectionHeader
        title="Check-in distance"
        caption="How close to a shop a rep has to be for the visit to count as on-site."
      />

      <div className="flex flex-wrap gap-2">
        {CHOICES.map((choice) => (
          <button
            key={choice.metres}
            type="button"
            disabled={!canEdit || saving}
            aria-pressed={radius === choice.metres}
            onClick={() => choose(choice.metres)}
            className={`pressable min-h-14 flex-1 basis-24 rounded-xl border px-3 text-left disabled:opacity-60 ${
              radius === choice.metres ? "border-brand bg-brand/10" : "border-line"
            }`}
          >
            <span className="block text-base font-semibold tabular-nums">
              {choice.label}
            </span>
            <span className="block text-xs text-muted">{choice.caption}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-muted">
        A check-in further away than this is still recorded, with the distance
        on it, and marked out of range. Nobody is stopped from working; the
        report is what reads the flag.
      </p>

      {!canEdit && <p className="text-sm text-muted">You may see this but not change it.</p>}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
