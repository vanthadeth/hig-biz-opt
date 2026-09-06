"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES, CURRENCY_NAME, CURRENCY_SYMBOL, type Currency } from "@/lib/money";

/**
 * Which currency the app quotes in.
 *
 * One choice for the whole organisation, like the printers below it: what HIG
 * quotes in is decided once, not per rep and then argued about at a counter.
 *
 * It changes nothing about what is stored. Both prices stay on the item, and
 * this picks which of them a screen shows — nothing here converts anything,
 * because there is no rate in this app and inventing one would be worse than
 * showing two figures.
 */
export function CurrencySettings({
  current,
  canEdit,
}: {
  current: Currency;
  canEdit: boolean;
}) {
  const [currency, setCurrency] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: Currency) {
    if (next === currency || saving) return;
    const previous = currency;

    haptic("select");
    setCurrency(next);
    setSaving(true);
    setError(null);

    // `.select()` because an update the policy refuses matches no rows and
    // raises nothing at all — without it a rep who may not edit settings would
    // watch the button move and believe it.
    const { data, error: e } = await createClient()
      .from("app_settings")
      .update({ primary_currency: next })
      .eq("id", true)
      .select("primary_currency");

    setSaving(false);
    if (e || !data?.length) {
      haptic("error");
      setCurrency(previous);
      setError(e?.message ?? "That could not be saved.");
      return;
    }
    // A full reload: every price on every screen is rendered on the server and
    // has to come back knowing which currency it is in.
    window.location.reload();
  }

  return (
    <Card className="space-y-3 p-4">
      <SectionHeader
        title="Currency"
        caption="Which price the catalogue, the cart and orders show."
      />

      <div className="grid grid-cols-2 gap-2">
        {CURRENCIES.map((option) => (
          <button
            key={option}
            type="button"
            disabled={!canEdit || saving}
            aria-pressed={currency === option}
            onClick={() => choose(option)}
            className={`pressable min-h-14 rounded-xl border px-3 text-left disabled:opacity-60 ${
              currency === option ? "border-brand bg-brand/10" : "border-line"
            }`}
          >
            <span className="block text-lg font-semibold tabular-nums">
              {CURRENCY_SYMBOL[option]}
            </span>
            <span className="block text-xs text-muted">{CURRENCY_NAME[option]}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-muted">
        Prices are kept in both currencies and nothing here converts between
        them. An item priced only in the other currency still shows that price,
        with its own symbol in front of it.
      </p>

      {!canEdit && (
        <p className="text-sm text-muted">
          You may see this but not change it.
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
