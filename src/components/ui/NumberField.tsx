"use client";

import { useState } from "react";

/** A decimal somebody types: a percent, or an amount of money. */
export function NumberField({
  value,
  disabled,
  onChange,
  label,
}: {
  value: number;
  disabled: boolean;
  onChange: (next: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      disabled={disabled}
      placeholder="0"
      value={draft ?? (value === 0 ? "" : String(value))}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^0-9.]/g, "");
        setDraft(cleaned);
        onChange(cleaned === "" ? 0 : Number(cleaned));
      }}
      onBlur={() => setDraft(null)}
      // 44px, which is what a compact Counter comes to: a 36px button inside
      // 4px of padding. The two sit side by side and have to match.
      className="min-h-11 w-full min-w-0 rounded-xl border border-line px-2 text-sm tabular-nums outline-none focus:border-brand disabled:opacity-60"
    />
  );
}
