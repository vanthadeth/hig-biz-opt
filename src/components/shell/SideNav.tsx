"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useShell } from "./ShellContext";

/**
 * Tablet and desktop navigation: a 72px icon rail from md, widening into a
 * labelled 240px sidebar from lg. One tree, two shapes — labels are present in
 * the markup at every size and hidden visually on the rail, so the accessible
 * name never disappears.
 */
export function SideNav() {
  const pathname = usePathname();
  const { view, views, nav } = useShell();

  const items = [
    { key: "home", name: "Home", icon: "home", href: "home" },
    ...nav.map((n) => ({
      key: n.module_key,
      name: n.name,
      icon: n.icon,
      href: n.href,
    })),
  ];

  return (
    <aside
      style={{ viewTransitionName: "shell-sidenav" }}
      className="fixed inset-y-0 left-0 z-50 hidden w-18 flex-col border-r border-line bg-surface md:flex lg:w-60"
    >
      <div className="flex h-14 items-center gap-3 border-b border-line px-4 lg:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg">
          <Icon name={view.icon} className="size-5" />
        </span>
        <span className="hidden min-w-0 lg:block">
          <span className="block truncate text-sm font-semibold leading-tight">
            {view.name}
          </span>
          <span className="block truncate text-xs text-muted">HIG Biz Operation</span>
        </span>
      </div>

      <ul className="flex-1 space-y-1 overflow-y-auto p-2 lg:p-3">
        {items.map((item) => {
          const href = `/${view.key}/${item.href}`;
          const active = pathname === href;
          return (
            <li key={item.key}>
              <Link
                href={href}
                title={item.name}
                aria-current={active ? "page" : undefined}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-muted transition-colors hover:bg-subtle hover:text-fg aria-[current=page]:bg-brand/10 aria-[current=page]:text-brand max-lg:justify-center max-lg:px-0"
              >
                <Icon name={item.icon} className="size-5 shrink-0" />
                <span className="truncate text-sm font-medium max-lg:sr-only">
                  {item.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {views.length > 1 && (
        <div className="border-t border-line p-2 lg:p-3">
          <Link
            href="/select-view"
            title="Switch view"
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-muted transition-colors hover:bg-subtle hover:text-fg max-lg:justify-center max-lg:px-0"
          >
            <Icon name="grid" className="size-5 shrink-0" />
            <span className="truncate text-sm font-medium max-lg:sr-only">
              Switch view
            </span>
          </Link>
        </div>
      )}
    </aside>
  );
}
