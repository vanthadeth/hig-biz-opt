import { redirect } from "next/navigation";
import { VisitShell } from "@/components/visit/VisitShell";
import {
  getMyModules,
  getMyNav,
  getMyPermissions,
  getMyViews,
  requireViewer,
} from "@/lib/access";
import { openVisitId } from "@/lib/visits.server";

/**
 * My Visit's own front door.
 *
 * A static `visit` segment beside `(app)/[view]`'s dynamic one: Next resolves
 * the literal first, so this layout serves `/visit/...` and the other never sees
 * it. That is what lets this app have a three-button bar while the other four
 * views keep their customisable five.
 *
 * The entitlement check is the same one `(app)/[view]/layout.tsx` makes, for the
 * same reason: hiding the workspace from the chooser is presentation, and this
 * is the part that stops somebody typing the URL of a view they do not hold.
 */
export default async function VisitLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const views = await getMyViews();

  const view = views.find((v) => v.key === "visit");
  if (!view) {
    // The same 0/1/many rule as resolveEntryPath, resolved from the views
    // already in hand.
    if (views.length === 0) redirect("/no-access");
    if (views.length === 1) redirect(`/${views[0].key}/home`);
    redirect("/select-view");
  }

  // Fetched together: none of them depends on another, and the shell cannot
  // render until it has all four.
  const [nav, modules, permissions, openId] = await Promise.all([
    getMyNav(view.key),
    getMyModules(view.key),
    getMyPermissions(),
    openVisitId(),
  ]);

  return (
    <VisitShell
      data={{ viewer, view, views, nav, modules, permissions }}
      openVisitId={openId}
    >
      {children}
    </VisitShell>
  );
}
