import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getMyNav, getMyViews, requireViewer, resolveEntryPath } from "@/lib/access";

/**
 * Entitlement is re-checked here on every request. Hiding a view from the
 * switcher is presentation; this is the part that actually stops someone typing
 * the URL of a view they do not hold.
 */
export default async function ViewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ view: string }>;
}) {
  const { view: viewKey } = await params;
  const viewer = await requireViewer();
  const views = await getMyViews();

  const view = views.find((v) => v.key === viewKey);
  if (!view) {
    const fallback = await resolveEntryPath();
    // Sending them back to /[view] they cannot enter would loop.
    if (fallback.startsWith(`/${viewKey}/`)) notFound();
    redirect(fallback);
  }

  const nav = await getMyNav(view.key);

  return <AppShell data={{ viewer, view, views, nav }}>{children}</AppShell>;
}
