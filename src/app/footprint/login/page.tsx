import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: { absolute: "Sign in — HIG Footprint" } };

/**
 * HIG Footprint's own front door.
 *
 * A separate URL from `/login`, not a separate account system: whoever signs
 * in here is the same person the main app already knows, arriving through a
 * door that opens straight onto check-in/out and nothing else — no view to
 * pick, no dashboard behind it.
 */
export default function FootprintLoginPage() {
  return (
    <main className="relative flex min-h-dvh flex-col justify-center px-6 py-12">
      <div
        className="absolute right-5 top-5"
        style={{ top: "max(env(safe-area-inset-top), 1.25rem)" }}
      >
        <ThemeToggle />
      </div>

      <div className="mx-auto w-full max-w-sm">
        <span className="flex items-center gap-2">
          <Logo className="h-10" />
          <span className="text-lg font-semibold tracking-tight">Footprint</span>
        </span>
        <h1 className="sr-only">HIG Footprint</h1>
        <p className="mt-6 text-sm text-muted">Sign in to check in.</p>
        <Suspense fallback={<div className="mt-8 h-64" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
