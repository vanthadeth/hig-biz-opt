import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { ViewSummary } from "@/lib/access";

/**
 * The list of views on the chooser screen.
 *
 * Every card is the same height whatever its description, and both lines
 * truncate: view names and descriptions are configured in the database, so one
 * long one must not push its row taller than the rest. The full text stays
 * available as the link's tooltip.
 */
export function ViewChooserList({ views }: { views: ViewSummary[] }) {
  return (
    // grid-cols-1 rather than a bare `grid`: an implicit auto track is sized to
    // min-content, and min-content of a nowrap line is the whole line — so the
    // cards would grow past the viewport instead of truncating. `grid-cols-*`
    // resolves to minmax(0, 1fr), which caps the track at the row's width.
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {views.map((view) => (
        <li key={view.key}>
          <Link
            href={`/${view.key}/home`}
            title={view.description ?? view.name}
            className="flex h-24 items-center gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-brand/40 hover:bg-subtle"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Icon name={view.icon} className="size-5.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{view.name}</span>
              {view.description && (
                <span className="mt-0.5 block truncate text-sm text-muted">
                  {view.description}
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
