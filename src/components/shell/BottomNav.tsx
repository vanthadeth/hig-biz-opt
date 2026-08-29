"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useScrollHidden } from "@/hooks/useScrollDirection";
import { useShell } from "./ShellContext";

/**
 * Phone navigation. Home plus the view's modules, capped at five so the labels
 * stay readable at 390px without a "More" sheet.
 */
export function BottomNav() {
  const pathname = usePathname();
  const hidden = useScrollHidden();
  const { view, nav } = useShell();

  const items = [
    { key: "home", name: "Home", icon: "home", href: "home" },
    ...nav.map((n) => ({
      key: n.module_key,
      name: n.name,
      icon: n.icon,
      href: n.href,
    })),
  ].slice(0, 5);

  return (
    <nav
      data-hidden={hidden}
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-md transition-transform duration-200 ease-out data-[hidden=true]:translate-y-[calc(100%+env(safe-area-inset-bottom))] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {items.map((item) => {
          const href = `/${view.key}/${item.href}`;
          const active = pathname === href;
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-muted transition-colors aria-[current=page]:text-brand"
              >
                <Icon name={item.icon} className="size-5.5" />
                <span className="max-w-full truncate text-[10px] font-medium leading-none">
                  {item.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
