import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
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
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
      <p className="text-sm text-muted">Signed in as {viewer.full_name}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        Select view
      </h1>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {views.map((view) => (
          <li key={view.key}>
            <Link
              href={`/${view.key}/home`}
              className="flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-brand/40 hover:bg-subtle"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Icon name={view.icon} className="size-5.5" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{view.name}</span>
                {view.description && (
                  <span className="mt-0.5 block text-sm text-muted">
                    {view.description}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <SignOutButton />
      </div>
    </main>
  );
}
