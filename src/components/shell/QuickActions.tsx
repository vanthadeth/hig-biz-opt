"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { quickActionsFor } from "@/lib/quickActions";
import { useShell } from "./ShellContext";

/**
 * The centre button's menu.
 *
 * It lists only what the signed-in person may create in this view, resolved
 * from the same permissions the database enforces — so it cannot offer an
 * action that would then be refused.
 */
export function QuickActions({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { nav, permissions, view } = useShell();
  const actions = quickActionsFor(nav, permissions, view.key);

  return (
    <Sheet open={open} onClose={onClose} title="Quick actions">
      {actions.length === 0 ? (
        <p className="px-3 pb-4 pt-1 text-sm text-muted">
          You do not have permission to create anything in {view.name}.
        </p>
      ) : (
        <ul className="stagger">
          {actions.map((action, i) => (
            <li key={action.moduleKey} style={{ "--i": i } as React.CSSProperties}>
              <Link
                href={action.href}
                onClick={onClose}
                className="pressable flex min-h-14 items-center gap-3 rounded-2xl px-3 hover:bg-subtle"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Icon name={action.icon} className="size-5" />
                </span>
                <span className="flex-1 text-sm font-medium">{action.label}</span>
                <Icon name="chevron" className="size-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
