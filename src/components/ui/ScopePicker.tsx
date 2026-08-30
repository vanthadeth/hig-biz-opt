"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { SCOPES, SCOPE_HELP, SCOPE_LABELS } from "@/lib/roleMatrix";
import { SCOPE_CHIP } from "./scopeTone";
import type { StoredScope } from "@/lib/access";

/**
 * One cell of the permission grid, and the menu it opens.
 *
 * The cell stays small enough for four to sit across a 390px phone, and the
 * choosing happens in a pop-up that has room to say what each scope actually
 * means — "own and subordinates' records" rather than the bare word "Sub".
 * That explanation is the part a permission screen most needs and the part a
 * cramped inline control has never had space for.
 *
 * The menu is the shared Sheet: a bottom sheet on a phone, a centred dialog
 * from `sm` up, portalled out of the title bar's transform.
 */
export function ScopePicker({
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
  const [open, setOpen] = useState(false);

  function pick(scope: StoredScope) {
    setOpen(false);
    if (scope === value) return;
    haptic("select");
    onChange(scope);
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${SCOPE_HELP[value]}`}
        title={`${label} — ${SCOPE_HELP[value]}`}
        onClick={() => {
          haptic("tap");
          setOpen(true);
        }}
        className={`min-h-9 w-full rounded-lg border text-center text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-60 ${SCOPE_CHIP[value]}`}
      >
        {SCOPE_LABELS[value]}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <ul className="stagger pb-2">
          {SCOPES.map((scope, i) => {
            const active = scope === value;
            return (
              <li key={scope} style={{ "--i": i } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => pick(scope)}
                  aria-current={active}
                  className="pressable flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-subtle"
                >
                  <span
                    aria-hidden="true"
                    className={`size-9 shrink-0 rounded-xl border ${SCOPE_CHIP[scope]}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {SCOPE_LABELS[scope]}
                    </span>
                    <span className="block text-xs text-muted">
                      {SCOPE_HELP[scope]}
                    </span>
                  </span>
                  {active && (
                    <Icon name="check" className="size-5 shrink-0 text-brand" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
