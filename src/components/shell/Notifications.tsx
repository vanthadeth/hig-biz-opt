"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";

/**
 * The bell beside the profile badge.
 *
 * There is no notifications table yet, so this deliberately carries no unread
 * count. A badge showing a number nothing produced would be an invention, and
 * the one thing worse than an empty inbox is a fake one. The panel says so
 * plainly; when events start being recorded it fills in without changing shape.
 */
export function Notifications() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setOpen(true);
        }}
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="pressable flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:text-fg"
      >
        <Icon name="bell" className="size-5" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Notifications">
        <div className="flex flex-col items-center px-4 pb-8 pt-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-subtle text-muted">
            <Icon name="inbox" className="size-7" />
          </span>
          <p className="mt-4 text-sm font-medium">You are all caught up</p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            Nothing to read yet. Approvals, mentions and overdue items will land
            here once those modules are built.
          </p>
        </div>
      </Sheet>
    </>
  );
}
