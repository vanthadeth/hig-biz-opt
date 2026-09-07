/**
 * The three buttons My Visit is made of.
 *
 * The other four views assemble their bar from `my_nav`, because their contents
 * change with what a person may reach. This one does not: it is a single app
 * with a dashboard, one action and a report, and a rep learns where those are
 * on the first morning. So the bar is written down rather than queried, and this
 * is where it is written down — the bar and the title bar both read it, which is
 * how they stay in step.
 *
 * No server imports: the bar is a client component.
 */

export type VisitTab = {
  href: string;
  /** Under the icon in the bar, where there is room for one word. */
  label: string;
  /** In the title bar, where the app can afford to name itself. */
  title: string;
  icon: string;
};

export const VISIT_TABS: VisitTab[] = [
  { href: "/visit/home", label: "Dashboard", title: "My Visit", icon: "home" },
  { href: "/visit/report", label: "Report", title: "Report", icon: "chart" },
];

/**
 * What the centre button does, which depends on whether a visit is open.
 *
 * One button with two states rather than a menu offering both: the database
 * already knows which of them makes sense — `visits_one_open_per_person` means
 * there is either an open visit or there is not — so asking the rep would be
 * asking them something the phone could see for itself.
 */
export function centreAction(openVisitId: string | null): VisitTab {
  return openVisitId
    ? {
        href: `/visit/visits/${openVisitId}`,
        label: "Check out",
        title: "Check out",
        icon: "logout",
      }
    : { href: "/visit/check-in", label: "Check in", title: "Check in", icon: "pin" };
}

/**
 * The heading for a path.
 *
 * The shared `usePageTitle` derives one from the module registry, which is right
 * for a view whose pages are modules. Here the pages are not modules, and its
 * fallback would title-case the URL into "Check In".
 */
export function visitTitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const segment = segments[1] ?? "home";

  const tab = VISIT_TABS.find((t) => t.href === `/visit/${segment}`);
  if (tab) return tab.title;

  if (segment === "check-in") return "Check in";
  if (segment === "visits") return "Visit";
  if (segment === "profile") return "Profile";

  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
