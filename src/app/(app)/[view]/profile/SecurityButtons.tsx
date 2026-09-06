"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { ChangePassword } from "./ChangePassword";
import { PinForm } from "./PinForm";
import { ResetPasswordButton } from "./ResetPasswordButton";

type Open = "password" | "pin" | null;

/**
 * The two things somebody comes to their profile to change.
 *
 * Buttons rather than two open forms. A profile is read far more often than it
 * is edited, and a page that greets everybody with four empty boxes for
 * passwords and PINs makes the record underneath them harder to find. Each one
 * opens where the work is, and closes when it is done.
 */
export function SecurityButtons({
  email,
  pinIsSet,
}: {
  email: string | null;
  pinIsSet: boolean;
}) {
  const [open, setOpen] = useState<Open>(null);

  const show = (which: Open) => () => {
    haptic("tap");
    setOpen(which);
  };

  return (
    <>
      <button
        type="button"
        onClick={show("password")}
        aria-haspopup="dialog"
        className="pressable inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-fg"
      >
        <Icon name="shield" className="size-4.5" />
        Change password
      </button>

      <button
        type="button"
        onClick={show("pin")}
        aria-haspopup="dialog"
        className="pressable inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-fg"
      >
        <Icon name="pin" className="size-4.5" />
        {pinIsSet ? "Change PIN" : "Set PIN"}
      </button>

      <Sheet
        open={open === "password"}
        onClose={() => setOpen(null)}
        title="Change password"
      >
        <div className="space-y-4 px-3 pb-4 pt-1">
          <ChangePassword />
          {/* Still here for somebody who is locked out and cannot reach this
              page at all — a different problem from the one above it. */}
          <div className="border-t border-line pt-3">
            <ResetPasswordButton email={email} />
          </div>
        </div>
      </Sheet>

      <Sheet
        open={open === "pin"}
        onClose={() => setOpen(null)}
        title={pinIsSet ? "Change your unlock PIN" : "Set an unlock PIN"}
      >
        <div className="px-3 pb-4 pt-1">
          <PinForm isSet={pinIsSet} />
        </div>
      </Sheet>
    </>
  );
}
