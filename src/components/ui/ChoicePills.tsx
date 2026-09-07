"use client";

import { useId } from "react";
import { haptic } from "@/lib/haptics";

/**
 * Pick one, by tapping it.
 *
 * `SegmentedTabs` looks like this and is not this: that is a filter, a view of
 * something already true. These are answers being given, so they are a radio
 * group — which is what a screen reader has to be told, and what makes the
 * arrow keys work the way somebody expects inside a form.
 *
 * Pills rather than a `<select>` because the whole list is three to six words
 * long and a rep is answering it standing up with one thumb. A select is one tap
 * to open, one to choose, and a rolling drum in between.
 */
export function ChoicePills<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: T | null;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="grid gap-1.5">
      <span id={id} className="text-xs font-medium text-muted">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="no-scrollbar flex flex-wrap gap-2"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => {
                haptic("tap");
                onChange(option.value);
              }}
              className="pressable flex min-h-10 shrink-0 items-center rounded-full border border-line px-4 text-sm font-medium text-muted transition-colors aria-checked:border-brand aria-checked:bg-brand aria-checked:text-brand-fg disabled:opacity-60"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
