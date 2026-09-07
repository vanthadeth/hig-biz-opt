"use client";

import { haptic } from "@/lib/haptics";

/**
 * A choice made by tapping, not by opening a menu.
 *
 * A native select on a phone costs three interactions — open the wheel, spin
 * it, confirm — and hides every option until the first of them. This costs
 * one, and the whole set is readable at a glance, which matters when the rep
 * is standing in a shop with the owner waiting.
 *
 * The chosen one can be tapped again to clear it. Nothing here is required,
 * and a form with no way back to "not answered" turns a mis-tap into a wrong
 * record.
 */
export function OptionButtons({
  label,
  options,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <fieldset className="grid gap-1.5" disabled={disabled}>
      <legend className="text-xs font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const chosen = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={chosen}
              onClick={() => {
                haptic("select");
                onChange(chosen ? null : option.value);
              }}
              className="pressable min-h-10 rounded-xl border border-line px-3 text-sm font-medium text-fg disabled:opacity-50 aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-brand-fg"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
