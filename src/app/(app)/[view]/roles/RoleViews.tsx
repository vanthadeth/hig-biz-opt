"use client";

import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { haptic } from "@/lib/haptics";
import { toggleView } from "@/lib/roleMatrix";

export type ViewOption = {
  key: string;
  name: string;
  description: string | null;
  icon: string;
};

/**
 * Which workspaces a role opens.
 *
 * A view is a whole workspace with its own landing page and navigation, and a
 * role may hold several. The count matters on arrival: one view goes straight
 * in, so a single-purpose role never meets a chooser with one option on it, and
 * several land on the selection screen. That is stated on the card, because it
 * is the visible consequence of ticking a second box.
 */
export function RoleViews({
  views,
  selected,
  roleName,
  disabled,
  onChange,
}: {
  views: ViewOption[];
  selected: string[];
  roleName: string;
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const count = selected.length;

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Views</h2>
        <span className="text-xs text-muted">
          {count === 0 ? "None" : `${count} of ${views.length}`}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted">
        {count === 0
          ? `Nobody holding ${roleName} can enter the app until at least one view is ticked.`
          : count === 1
            ? "With one view, signing in goes straight there — no selection screen."
            : "With more than one, signing in lands on the view selection screen."}
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {views.map((view) => {
          const on = selected.includes(view.key);
          return (
            <li key={view.key}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={view.name}
                disabled={disabled}
                onClick={() => {
                  haptic("select");
                  onChange(toggleView(selected, view.key));
                }}
                className="pressable flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left aria-checked:border-brand aria-checked:bg-brand/10 disabled:opacity-60"
              >
                <Icon
                  name={view.icon}
                  className={`size-5 shrink-0 ${on ? "text-brand" : "text-muted"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{view.name}</span>
                  {view.description && (
                    <span className="block truncate text-xs text-muted">
                      {view.description}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${
                    on ? "border-brand bg-brand text-brand-fg" : "border-line"
                  }`}
                >
                  {on && <Icon name="check" className="size-3.5" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
