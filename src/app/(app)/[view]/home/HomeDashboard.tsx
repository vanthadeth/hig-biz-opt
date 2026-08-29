"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ModuleTile } from "@/components/ui/ModuleTile";
import { StatTile, type TintIndex } from "@/components/ui/StatTile";
import { useShell } from "@/components/shell/ShellContext";
import { quickActionsFor } from "@/lib/quickActions";
import type { HomeSummary } from "@/lib/dashboard";

/** Tints cycle so a grid of any length stays varied without hard-coding. */
const TINT_CYCLE: TintIndex[] = [1, 2, 3, 4];

export function HomeDashboard({
  summary,
  greeting,
  today,
}: {
  summary: HomeSummary;
  greeting: string;
  today: string;
}) {
  const { viewer, view, views, nav, permissions } = useShell();
  const actions = quickActionsFor(nav, permissions, view.key);
  const firstName = viewer.nickname || viewer.full_name.split(" ")[0];

  return (
    <div className="space-y-8">
      {/* Greeting ---------------------------------------------------------- */}
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          {greeting}, {firstName}
        </h1>
        <p className="mt-0.5 text-sm text-muted">{today}</p>
      </header>

      {/* What we can honestly count today ---------------------------------- */}
      <section className="grid grid-cols-3 gap-3">
        <StatTile value={nav.length} label="Modules" tint={1} icon="grid" />
        <StatTile value={views.length} label="Views" tint={2} icon="shield" />
        <StatTile value={summary.teamCount} label="Team" tint={3} icon="users" />
      </section>

      {/* Quick actions ------------------------------------------------------ */}
      {actions.length > 0 && (
        <section>
          <SectionHeader title="Create" caption="What you can add in this workspace" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            {actions.map((action) => (
              <Link
                key={action.moduleKey}
                href={action.href}
                className="pressable flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 py-3 shadow-[var(--shadow-card)] hover:border-brand/30"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Icon name={action.icon} className="size-4.5" />
                </span>
                <span className="min-w-0 truncate text-sm font-medium leading-tight">{action.short}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* The view's modules, as a launcher --------------------------------- */}
      <section>
        <SectionHeader
          title="Your modules"
          caption={`${nav.length} in ${view.name}`}
        />
        <div className="stagger mt-3 grid grid-cols-2 gap-3">
          {nav.map((item, i) => (
            <ModuleTile
              key={item.module_key}
              name={item.name}
              icon={item.icon}
              tint={TINT_CYCLE[i % TINT_CYCLE.length]}
              href={`/${view.key}/${item.href}`}
            />
          ))}
        </div>
      </section>

      {/* Other workspaces --------------------------------------------------- */}
      {views.length > 1 && (
        <section>
          <SectionHeader
            title="Workspaces"
            caption="Other places you can work"
            actionLabel="Switch"
            actionHref="/select-view"
          />
          <ul className="stagger mt-3 space-y-2">
            {views
              .filter((other) => other.key !== view.key)
              .map((other, i) => (
                <li key={other.key} style={{ "--i": i } as React.CSSProperties}>
                  <Card href={`/${other.key}/home`} className="flex items-center gap-3 p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                      <Icon name={other.icon} className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{other.name}</span>
                      {other.description && (
                        <span className="block truncate text-xs text-muted">
                          {other.description}
                        </span>
                      )}
                    </span>
                    <Icon name="chevron" className="size-4 shrink-0 text-muted" />
                  </Card>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Said plainly rather than filled with invented records. */}
      <p className="pb-2 text-center text-xs text-muted">
        Module screens are still being built. Numbers appear here as each one lands.
      </p>
    </div>
  );
}
