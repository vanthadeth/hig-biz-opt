import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { can, getMyPermissions, getViewer } from "@/lib/access";

/**
 * HIG Footprint's whole shell: a strip with the mark, its own name, and a way
 * out — and whatever the page puts under it. No side nav, no module menu, no
 * view to switch — this app does one thing, so there is nothing here to
 * navigate.
 *
 * Entitlement is checked here, on every request, the same as the main app's
 * `[view]/layout.tsx` checks a view — not to decide whose account this is
 * (that is still Supabase's own session), but whether the visits module is
 * any part of what it may see. `visit:add` or `visit:view` is enough to be
 * let in; neither is a person this app has nothing for.
 *
 * The `(protected)` group is what keeps this off `/footprint/login` itself: a
 * layout at `footprint/` would wrap the login page too, and a login page that
 * redirects an unauthenticated visitor to itself is a redirect loop, not a
 * login screen. Login lives as a sibling outside this group, with no gate at
 * all — the same shape the main app's own `/login` already has.
 */
export default async function FootprintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  // Its own login, not the main app's: somebody who lands here signed out
  // should come back to the door they knocked on, not a different app.
  if (!viewer) redirect("/footprint/login");

  const permissions = await getMyPermissions();
  const entitled = can(permissions, "visit", "add") || can(permissions, "visit", "view");

  return (
    <div className="min-h-dvh bg-bg">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-3"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
      >
        <span className="flex items-center gap-2">
          <Logo className="h-7" />
          {/* The mark alone still reads as the main app. This is the one
              product where the two are meant to look like different doors,
              so the name says so right beside it. */}
          <span className="text-sm font-semibold tracking-tight text-muted">
            Footprint
          </span>
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignOutButton redirectTo="/footprint/login" />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-4">
        {entitled ? (
          children
        ) : (
          // Said plainly rather than left as a blank page: this account is
          // real and signed in, it simply holds nothing this app is for.
          <div className="space-y-2 py-12 text-center">
            <p className="text-base font-medium">Nothing to check in to</p>
            <p className="text-sm text-muted">
              {viewer.full_name}, your account is not set up to record visits.
              Ask an administrator for access.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
