"use client";

import { haptic } from "@/lib/haptics";
import { SCOPES, SCOPE_HELP, SCOPE_LABELS } from "@/lib/roleMatrix";
import { SCOPE_FILL, SCOPE_TEXT } from "./scopeTone";
import type { StoredScope } from "@/lib/access";

/**
 * Four stops, and the selected one slides between them.
 *
 * A dropdown hid three of the four choices behind a tap and told you nothing
 * about where a scope sat on the scale. Here the whole range is on screen, the
 * thumb's position *is* the reach, and moving it left or right is the same
 * gesture as thinking "less" or "more".
 *
 * It needs real width to do that — four 44px targets — which a four-across grid
 * on a phone cannot give, so the matrix opens one module at a time.
 */
export function ScopeSlider({
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
  const index = SCOPES.indexOf(value);

  function move(to: number) {
    const next = SCOPES[Math.max(0, Math.min(SCOPES.length - 1, to))];
    if (next === value) return;
    haptic("select");
    onChange(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      // Arrow keys walk the scale, which is what makes it a slider rather than
      // four buttons that happen to sit in a row.
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          move(index - 1);
        } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          move(index + 1);
        } else if (e.key === "Home") {
          e.preventDefault();
          move(0);
        } else if (e.key === "End") {
          e.preventDefault();
          move(SCOPES.length - 1);
        }
      }}
      className={`relative flex rounded-xl bg-bg p-1 ${disabled ? "opacity-60" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-1 rounded-lg shadow-sm transition-[left] duration-200 ease-out motion-reduce:transition-none ${SCOPE_FILL[value]}`}
        style={{
          width: "calc((100% - 0.5rem) / 4)",
          left: `calc(0.25rem + ${index} * (100% - 0.5rem) / 4)`,
        }}
      />

      {SCOPES.map((scope, i) => {
        const active = scope === value;
        return (
          <button
            key={scope}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${SCOPE_LABELS[scope]} — ${SCOPE_HELP[scope]}`}
            disabled={disabled}
            // Roving tabindex: the group is one stop in the tab order, and the
            // arrow keys move within it.
            tabIndex={active ? 0 : -1}
            onClick={() => move(i)}
            className={`relative z-10 min-h-9 flex-1 rounded-lg text-xs font-medium transition-colors disabled:cursor-default ${
              active ? SCOPE_TEXT[scope] : "text-muted"
            }`}
          >
            {SCOPE_LABELS[scope]}
          </button>
        );
      })}
    </div>
  );
}
