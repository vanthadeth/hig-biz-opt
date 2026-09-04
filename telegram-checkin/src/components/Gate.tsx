"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckInScreen, type Employee } from "@/components/CheckInScreen";
import { SignInPanel } from "@/components/SignInPanel";
import { telegramWebApp } from "@/lib/location";
import { createClient } from "@/lib/supabase/client";

type State =
  | { name: "checking" }
  | { name: "outside" }
  | { name: "linking"; initData: string }
  | { name: "blocked"; message: string }
  | { name: "in"; employee: Employee };

/**
 * What to show, in the order the answers arrive.
 *
 * The session check happens on the server, behind one request, because that is
 * where the bot token lives — the page cannot tell a real launch from a typed
 * string, and should not try.
 */
export function Gate() {
  const [state, setState] = useState<State>({ name: "checking" });

  const enter = useCallback(async (initData: string) => {
    try {
      const response = await fetch("/api/telegram/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      const body = await response.json();

      if (response.ok) {
        setState({ name: "in", employee: body.employee });
        return;
      }
      if (body.needsBinding) {
        setState({ name: "linking", initData });
        return;
      }
      setState({ name: "blocked", message: body.error ?? "You cannot use this app." });
    } catch {
      setState({
        name: "blocked",
        message: "No connection. Check your signal and reopen the app.",
      });
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const app = telegramWebApp();
      if (!app) {
        // An ordinary browser. Say so plainly rather than failing at the first
        // fetch — this is also how the app is developed against a desktop.
        setState({ name: "outside" });
        return;
      }

      app.ready();
      app.expand();
      await enter(app.initData);
    })();
  }, [enter]);

  async function afterLinking() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setState({ name: "blocked", message: "Signing in did not complete. Try again." });
      return;
    }

    const { data } = await supabase
      .from("users")
      .select("id, full_name, nickname")
      .eq("id", user.id)
      .maybeSingle();

    setState({
      name: "in",
      employee: (data as Employee | null) ?? {
        id: user.id,
        full_name: user.email ?? "You",
        nickname: null,
      },
    });
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-8 pt-6">
      {state.name === "checking" ? <Message>Opening…</Message> : null}

      {state.name === "outside" ? (
        <Message>
          Open this from the HIG bot in Telegram. It needs the account you opened it
          with to know who you are.
        </Message>
      ) : null}

      {state.name === "blocked" ? <Message tone="danger">{state.message}</Message> : null}

      {state.name === "linking" ? (
        <SignInPanel initData={state.initData} onLinked={afterLinking} />
      ) : null}

      {state.name === "in" ? <CheckInScreen employee={state.employee} /> : null}
    </main>
  );
}

function Message({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={`fade-up rounded-2xl bg-surface p-5 text-sm ${
        tone === "danger" ? "text-danger" : "text-muted"
      }`}
    >
      {children}
    </p>
  );
}
