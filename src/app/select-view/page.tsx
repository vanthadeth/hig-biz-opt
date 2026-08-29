import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ViewChooserList } from "@/components/ViewChooserList";
import { getMyViews, requireViewer } from "@/lib/access";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = { title: "Select view" };

export default async function SelectViewPage() {
  const viewer = await requireViewer();
  const views = await getMyViews();

  // Reachable only when there is an actual choice to make.
  if (views.length === 0) redirect("/no-access");
  if (views.length === 1) redirect(`/${views[0].key}/home`);

  return (
    <main className="relative mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
      <div className="absolute right-5 top-8 sm:top-14">
        <ThemeToggle />
      </div>

      <Logo className="h-8" />

      <p className="mt-8 text-sm text-muted">Signed in as {viewer.full_name}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        Select view
      </h1>

      <div className="mt-8">
        <ViewChooserList views={views} />
      </div>

      <div className="mt-8">
        <SignOutButton />
      </div>
    </main>
  );
}
