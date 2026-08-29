"use client";

import { SCOPES, SCOPE_HELP, SCOPE_LABELS } from "@/lib/roleMatrix";
import type { StoredScope } from "@/lib/access";

/** Deny reads as a refusal, the three grants as increasing reach. */
const TONE: Record<StoredScope, string> = {
  deny: "bg-danger text-white",
  own: "bg-brand/15 text-brand",
  sub: "bg-brand/40 text-brand",
  any: "bg-brand text-brand-fg",
};

/**
 * The four states a permission cell can hold.
 *
 * Laid out least-to-most reach so the row reads like a dial, and rendered as
 * buttons rather than a native select: on a phone a select opens a system
 * sheet for every one of thirty-six cells, which makes bulk editing painful.
 */
export function ScopeSelector({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: StoredScope;
  onChange: (scope: StoredScope) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-1 rounded-lg bg-subtle p-1"
    >
      {SCOPES.map((scope) => {
        const active = scope === value;
        return (
          <button
            key={scope}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={SCOPE_HELP[scope]}
            onClick={() => onChange(scope)}
            className={`min-h-8 flex-1 rounded-md px-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              active ? TONE[scope] : "text-muted hover:text-fg"
            }`}
          >
            {SCOPE_LABELS[scope]}
          </button>
        );
      })}
    </div>
  );
}
