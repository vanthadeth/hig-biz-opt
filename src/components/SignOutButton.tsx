"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-fg disabled:opacity-60"
    >
      <Icon name="logout" className="size-4.5" />
      Sign out
    </button>
  );
}
