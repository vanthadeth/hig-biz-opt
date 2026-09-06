"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { haptic } from "@/lib/haptics";

/**
 * A value shown once, with a button that puts it on the clipboard.
 *
 * The fallback matters more than the copy button does. `navigator.clipboard`
 * needs a secure context and a permission, and on a phone that has just been
 * handed round it can quietly refuse — so the value stays selectable text, and
 * a failure says "select it and copy" rather than pretending it worked.
 */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      haptic("success");
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      haptic("error");
      setFailed(true);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-stretch gap-2">
        <code
          aria-label={label}
          className="min-w-0 flex-1 select-all break-all rounded-xl border border-line bg-subtle px-3 py-2 text-base font-medium tabular-nums"
        >
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="pressable flex w-14 shrink-0 items-center justify-center rounded-xl border border-line bg-surface"
        >
          <Icon name={copied ? "check" : "file"} className="size-4" />
        </button>
      </div>
      {copied && (
        <p role="status" className="text-xs text-muted">
          Copied.
        </p>
      )}
      {failed && (
        <p role="alert" className="text-xs text-muted">
          Could not reach the clipboard. Select the text above and copy it.
        </p>
      )}
    </div>
  );
}
