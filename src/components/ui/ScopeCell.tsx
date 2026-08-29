"use client";

import { haptic } from "@/lib/haptics";
import { SCOPES, SCOPE_HELP, SCOPE_LABELS } from "@/lib/roleMatrix";
import type { StoredScope } from "@/lib/access";

/**
 * The whole scale is the brand: green grants everything, the brand blue grants
 * some of it, and nothing at all grants none.
 *
 * Own and Sub share the blue and are told apart by weight, so the two partial
 * reaches read as related rather than as separate decisions. Deny carries no
 * fill — an empty outline says "nothing here" more directly than any colour,
 * and a fill would have to come from outside the palette to be distinct.
 *
 * Every label is body text on its own fill and every pair clears 4.5:1 in both
 * themes; computed, not eyeballed. The lowest is 4.84:1, white on the light
 * blue. A grey fill was the near miss: --muted on --subtle is 4.49:1.
 */
const TONE: Record<StoredScope, string> = {
  deny: "border-line bg-transparent text-muted",
  own: "border-transparent bg-brand/15 text-fg",
  sub: "border-transparent bg-brand text-brand-fg",
  any: "border-transparent bg-accent text-accent-fg",
};

/**
 * One cell of the permission grid: a module's scope for a single action.
 *
 * A native select, so the four choices are all visible at once and picking one
 * is a single decision rather than a count of taps. It is styled down to fit
 * four across a 390px phone: the chevron is drawn rather than native, since the
 * platform one costs more width than the label has to spare.
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
  return (
    // The fill and the text colour sit on the wrapper so the drawn chevron can
    // pick them up through currentColor and stay legible on every tone.
    <div
      className={`relative rounded-lg border transition-colors has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-brand has-[select:disabled]:opacity-60 ${TONE[value]}`}
    >
      <select
        value={value}
        disabled={disabled}
        aria-label={`${label}: ${SCOPE_HELP[value]}`}
        title={`${label} — ${SCOPE_HELP[value]}`}
        onChange={(e) => {
          haptic("select");
          onChange(e.target.value as StoredScope);
        }}
        className="w-full appearance-none rounded-lg bg-transparent py-2 pl-1.5 pr-2.5 text-xs font-medium text-inherit outline-none"
      >
        {SCOPES.map((scope) => (
          // The options themselves are drawn by the platform, so they get the
          // fuller wording there is room for in a native menu.
          <option key={scope} value={scope}>
            {SCOPE_LABELS[scope]}
          </option>
        ))}
      </select>

      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute right-0.5 top-1/2 size-2 -translate-y-1/2 opacity-60"
      >
        <path
          d="m6 9 6 6 6-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
