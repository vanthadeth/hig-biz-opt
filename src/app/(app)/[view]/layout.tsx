import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import {
  getMyModules,
  getMyNav,
  getMyPermissions,
  getMyViews,
  requireViewer,
} from "@/lib/access";

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
    // The same 0/1/many rule as resolveEntryPath, but resolved from the views
    // already in hand. There is no loop to guard against: every destination
    // here is either a view this user does hold, or not a view route at all.
    if (views.length === 0) redirect("/no-access");
    if (views.length === 1) redirect(`/${views[0].key}/home`);
    redirect("/select-view");
  }

  // Fetched together rather than in sequence: the nav and the quick actions are
  // both needed before the shell can render, and they do not depend on one
  // another.
  const [nav, modules, permissions] = await Promise.all([
    getMyNav(view.key),
    getMyModules(view.key),
    getMyPermissions(),
  ]);

  return (
    <AppShell data={{ viewer, view, views, nav, modules, permissions }}>
      {children}
    </AppShell>
  );
}
