"use client";

import { useState } from "react";

/**
 * A count, typed or stepped.
 *
 * Typed matters here: "a hundred and forty-four" is a number somebody says,
 * and reaching it with a + button is not a thing anybody would do twice. The
 * buttons stay because one more and one fewer are the other two things that
 * happen, and both are a thumb's width away.
 */
export function Counter({
  value,
  min,
  max,
  disabled,
  compact,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  compact?: boolean;
  onChange: (next: number) => void;
  label: string;
}) {
  // Held as text while it is being typed, so clearing the box to type a new
  // number does not snap it back to the minimum between keystrokes.
  const [draft, setDraft] = useState<string | null>(null);
  const size = compact ? "size-9" : "size-10";

  return (
    <span
      role="group"
      aria-label={label}
      className="flex w-fit shrink-0 items-center rounded-xl border border-line p-1"
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label={`Fewer — ${label}`}
        className={`pressable ${size} rounded-lg text-lg leading-none text-muted disabled:opacity-40`}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        disabled={disabled}
        value={draft ?? String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "");
          setDraft(digits);
          if (digits !== "") onChange(Number(digits));
        }}
        onBlur={() => setDraft(null)}
        className="w-12 bg-transparent text-center text-sm font-medium tabular-nums outline-none disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label={`More — ${label}`}
        className={`pressable ${size} rounded-lg text-lg leading-none text-muted disabled:opacity-40`}
      >
        +
      </button>
    </span>
  );
}
