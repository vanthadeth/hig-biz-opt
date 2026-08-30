"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import { Notifications } from "./Notifications";
import { createClient } from "@/lib/supabase/client";
import { useScrollHidden } from "@/hooks/useScrollDirection";
import { useShell, usePageTitle } from "./ShellContext";

export function TitleBar() {
  const pathname = usePathname();
  const router = useRouter();
  const hidden = useScrollHidden();
  const { viewer, view, views } = useShell();
  const title = usePageTitle(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header
      data-hidden={hidden}
      className="fixed inset-x-0 top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md transition-transform duration-200 ease-out max-md:data-[hidden=true]:-translate-y-full md:left-18 lg:left-60"
      style={{ paddingTop: "env(safe-area-inset-top)", viewTransitionName: "shell-titlebar" }}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-4">

        <h1 className="min-w-0 flex-1 truncate pr-2 text-base font-semibold tracking-tight">
          {title}
        </h1>

        <Notifications />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:text-fg"
          >
            <StoredPhoto
              name={viewer.full_name}
              path={viewer.photo_path}
              className="size-8 rounded-full text-xs"
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-12 w-60 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg shadow-black/5"
            >
              <div className="border-b border-line px-4 py-3">
                <p className="truncate text-sm font-medium">{viewer.full_name}</p>
                <p className="truncate text-xs text-muted">{viewer.email}</p>
              </div>

              <div className="border-b border-line">
                <ThemeSwitcher />
              </div>

              <Link
                href={`/${view.key}/profile`}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-subtle"
              >
                <Icon name="user" className="size-4.5 text-muted" />
                My profile
              </Link>

              {views.length > 1 && (
                <Link
                  href="/select-view"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-subtle"
                >
                  <Icon name="grid" className="size-4.5 text-muted" />
                  Switch view
                </Link>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-sm text-danger hover:bg-subtle"
              >
                <Icon name="logout" className="size-4.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
