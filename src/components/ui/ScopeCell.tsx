"use client";

import { haptic } from "@/lib/haptics";
import { nextScope, SCOPE_HELP, SCOPE_LABELS } from "@/lib/roleMatrix";
import type { StoredScope } from "@/lib/access";

/**
 * Deny reads as a refusal; the three grants deepen as reach widens.
 *
 * The label is body text, so it carries the reach through the fill rather than
 * through its own colour: brand-on-brand/40 is 2.75:1 in light mode and 3.22:1
 * in dark, well short of the 4.5:1 a 12px label needs. Computed, not eyeballed.
 */
const TONE: Record<StoredScope, string> = {
  deny: "border-line bg-transparent text-muted",
  own: "border-transparent bg-brand/15 text-fg",
  sub: "border-transparent bg-brand/40 text-fg",
  any: "border-transparent bg-brand text-brand-fg",
};

/**
 * One cell of the permission grid: a module's scope for a single action.
 *
 * A row has to carry four of these and still fit a 390px phone, which rules out
 * four buttons per action. So the cell shows its current scope and advances on
 * tap, least reach to most and back to deny — one gesture per change, and the
 * whole row readable at a glance because the colour tracks the reach.
 *
 * The label names the action and both states, since "Own" alone tells a screen
 * reader nothing about which column it is in or what a tap would do.
 */
export function ScopeCell({
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
  const next = nextScope(value);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${label}: ${SCOPE_HELP[value]}.${
        disabled ? "" : ` Change to ${SCOPE_HELP[next].toLowerCase()}.`
      }`}
      title={`${label} — ${SCOPE_HELP[value]}`}
      onClick={() => {
        haptic("select");
        onChange(next);
      }}
      className={`pressable min-h-9 w-full rounded-lg border text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 ${TONE[value]}`}
    >
      {SCOPE_LABELS[value]}
    </button>
  );
}
