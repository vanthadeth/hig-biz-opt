import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <Logo className="h-9" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">HIG Biz Operation</h1>
        <p className="mt-1 text-sm text-muted">Sign in to continue.</p>
        <Suspense fallback={<div className="mt-8 h-64" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
