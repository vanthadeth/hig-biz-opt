"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { groupNav } from "@/lib/nav";
import {
  parseSlots,
  resolveSlots,
  slotChoices,
  CENTRE_STORAGE_KEY,
  parseCentre,
  serialiseCentre,
  SLOTS_STORAGE_KEY,
  SLOT_KEYS,
  SLOT_LABELS,
  type CentreAction,
  type SlotConfig,
  type SlotKey,
} from "@/lib/navSlots";
import { useLongPress } from "@/hooks/useLongPress";
import { haptic } from "@/lib/haptics";
import { useScrollHidden } from "@/hooks/useScrollDirection";
import { QuickActions } from "./QuickActions";
import { useShell } from "./ShellContext";

/**
 * The arrangement lives in localStorage, so it is per device — which is what it
 * is about. A tiny store rather than an effect: reading storage while rendering
 * would make the first paint disagree with the markup the server sent.
 */
const slotListeners = new Set<() => void>();

function subscribeToSlots(listener: () => void) {
  slotListeners.add(listener);
  // Another tab of the same app, arranged there.
  window.addEventListener("storage", listener);
  return () => {
    slotListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readSlots(): string | null {
  try {
    return window.localStorage.getItem(SLOTS_STORAGE_KEY);
  } catch {
    // A browser with site data switched off. The default bar is correct.
    return null;
  }
}

function readCentre(): string | null {
  try {
    return window.localStorage.getItem(CENTRE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeCentre(action: CentreAction) {
  try {
    window.localStorage.setItem(CENTRE_STORAGE_KEY, serialiseCentre(action));
  } catch {
    // As above: the button still changes for this session.
  }
  slotListeners.forEach((listener) => listener());
}

function writeSlots(config: SlotConfig) {
  try {
    window.localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Nothing to do about it and nothing worth interrupting somebody over.
  }
  slotListeners.forEach((listener) => listener());
}

/**
 * Phone navigation.
 *
 * Five slots, no more: Home, the view's first two modules, the raised centre
 * button, and Menu on the right. Five is not a style choice — a 320px phone
 * gives each slot 64px, and a sixth would push the labels below the width
 * their words need.
 *
 * Menu holds the last slot always, rather than appearing only when something
 * overflows, so it is somewhere a person can learn rather than somewhere that
 * moves as their permissions change.
 */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const hidden = useScrollHidden();
  const { view, modules } = useShell();
  const [quickOpen, setQuickOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // "centre" is not a slot in the same sense — it holds an action rather than a
  // module — but it is customised by the same gesture, so it shares the state.
  const [editing, setEditing] = useState<SlotKey | "centre" | null>(null);

  // The raw string is the snapshot, not the parsed object: a snapshot has to be
  // referentially stable between reads, and parsing on every call would hand
  // React a new object each time and spin.
  const raw = useSyncExternalStore(subscribeToSlots, readSlots, () => null);
  const config = useMemo(() => parseSlots(raw), [raw]);
  const centreRaw = useSyncExternalStore(subscribeToSlots, readCentre, () => null);
  const centre = useMemo(() => parseCentre(centreRaw), [centreRaw]);

  const choices = slotChoices(modules, view.key);
  const chosen = resolveSlots(config, modules, view.key);

  const assign = useCallback(
    (slot: SlotKey, moduleKey: string) => {
      // Pin what is already showing before changing one of them. Otherwise the
      // untouched slot is still running on a fallback, and re-resolving after
      // the change moves it — so customising the left button silently rewrites
      // the right one.
      const current: SlotConfig = {};
      SLOT_KEYS.forEach((key, i) => {
        const showing = chosen[i];
        if (showing) current[key] = showing.module_key;
      });

      const next = { ...current, [slot]: moduleKey };
      // Whatever else held it gives it up, rather than the bar quietly showing
      // one module twice and leaving a dead slot.
      for (const key of SLOT_KEYS) {
        if (key !== slot && next[key] === moduleKey) delete next[key];
      }
      writeSlots(next);
      haptic("success");
      setEditing(null);
    },
    [chosen],
  );

  // Home is fixed on the left and Menu on the right; the three between them are
  // the ones somebody arranges.
  const slots = [
    { key: "home", name: "Home", icon: "home", href: "home" },
    ...chosen.map((m) => ({
      key: m.module_key,
      name: m.name,
      icon: m.icon,
      href: m.href,
    })),
  ].slice(0, 3);

  const left = slots.slice(0, 2);
  const right = slots.slice(2);

  // Everything this person can reach, not just this view's modules — which is
  // what makes the sheet worth opening rather than a longer version of the bar.
  const groups = groupNav(modules);
  const menuActive = modules.some((m) => pathname === `/${m.view_key}/${m.href}`);

  // Built once per slot rather than inside the renderer: hooks may not be
  // called from a callback, and a fresh handler set per render would restart
  // the timer on every scroll frame.
  const held = {
    left: useLongPress(() => setEditing("left")),
    right: useLongPress(() => setEditing("right")),
  };
  const longPress = (slot: SlotKey) => held[slot];
  const centreHeld = useLongPress(() => setEditing("centre"));

  const item = (
    entry: { key: string; name: string; icon: string; href: string },
    slot?: SlotKey,
  ) => {
    const href = `/${view.key}/${entry.href}`;
    const active = pathname === href;
    return (
      // `min-w-0` is what makes the columns equal. A flex item defaults to
      // `min-width: auto`, which refuses to shrink below its content, so one
      // long module name would widen its slot and steal the difference from
      // every other. Zeroing it lets all five share the width evenly and hands
      // the overflow to the label, which truncates.
      <li key={entry.key} className="min-w-0 flex-1">
        <Link
          href={href}
          onClick={() => haptic("tap")}
          {...(slot ? longPress(slot) : {})}
          title={slot ? "Hold to change this button" : undefined}
          aria-current={active ? "page" : undefined}
          className="flex min-h-16 w-full flex-col items-center justify-center gap-1.5 px-1 py-2 text-muted transition-colors aria-[current=page]:text-brand"
        >
          <Icon name={entry.icon} className="size-6" />
          {/* `w-full` rather than `max-w-full`: an ellipsis needs a definite
              width to be placed against, and a centred flex child would
              otherwise size itself to the text it is meant to be cutting. */}
          <span className="w-full truncate text-center text-[11px] font-medium leading-none">
            {entry.name}
          </span>
        </Link>
      </li>
    );
  };


  return (
    <>
      <nav
        data-hidden={hidden}
        aria-label="Main"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          viewTransitionName: "shell-bottomnav",
        }}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-md transition-transform duration-200 ease-out data-[hidden=true]:translate-y-[calc(100%+env(safe-area-inset-bottom))] md:hidden"
      >
        <ul className="flex items-center">
          {left.map((entry, i) =>
            // Home is not customisable: it is the way back from anywhere, and
            // a way back that moves is not one.
            item(entry, i === 0 ? undefined : "left"),
          )}

          <li className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => {
                haptic("select");
                // A pinned action goes straight there. The sheet is still one
                // long press away, so pinning is never a one-way door.
                if (centre.kind === "module") {
                  const target = modules.find((m) => m.module_key === centre.key);
                  if (target) {
                    router.push(`/${target.view_key}/${target.href}/new`);
                    return;
                  }
                }
                setQuickOpen(true);
              }}
              {...centreHeld}
              title="Hold to change this button"
              aria-label="Quick actions"
              aria-haspopup="dialog"
              aria-expanded={quickOpen}
              className="pressable -mt-7 flex size-15 items-center justify-center rounded-full bg-brand text-brand-fg shadow-[var(--shadow-fab)]"
            >
              <Icon name="plus" className="size-7" />
            </button>
          </li>

          {right.map((entry) => item(entry, "right"))}

          {/* Same shape as a nav item, so the five columns stay identical. */}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setMenuOpen(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-current={menuActive ? "page" : undefined}
              className="flex min-h-16 w-full flex-col items-center justify-center gap-1.5 px-1 py-2 text-muted transition-colors aria-[current=page]:text-brand"
            >
              <Icon name="menu" className="size-6" />
              <span className="w-full truncate text-center text-[11px] font-medium leading-none">
                Menu
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <QuickActions open={quickOpen} onClose={() => setQuickOpen(false)} />

      {/* Held rather than tapped, so a bar somebody uses forty times a day is
          never one mis-tap away from rearranging itself. */}
      <Sheet
        open={editing !== null && editing !== "centre"}
        onClose={() => setEditing(null)}
        title={editing && editing !== "centre" ? SLOT_LABELS[editing] : "Button"}
      >
        <div className="max-h-[60vh] overflow-y-auto px-1 pb-2">
          {choices.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">
              There is nothing else in {view.name} to put here.
            </p>
          ) : (
            <ul>
              {choices.map((choice) => {
                const current =
                  editing !== null &&
                  editing !== "centre" &&
                  chosen[SLOT_KEYS.indexOf(editing)]?.module_key === choice.module_key;
                return (
                  <li key={choice.module_key}>
                    <button
                      type="button"
                      onClick={() =>
                        editing && editing !== "centre" && assign(editing, choice.module_key)
                      }
                      className="pressable flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-subtle"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                        <Icon name={choice.icon} className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {choice.name}
                      </span>
                      {current && <Icon name="check" className="size-4 shrink-0 text-brand" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="px-3 pt-2 text-xs text-muted">
            Kept on this phone, not on your account.
          </p>
        </div>
      </Sheet>

      <Sheet
        open={editing === "centre"}
        onClose={() => setEditing(null)}
        title="Centre button"
      >
        <div className="max-h-[60vh] overflow-y-auto px-1 pb-2">
          <ul>
            <li>
              <button
                type="button"
                onClick={() => {
                  writeCentre({ kind: "sheet" });
                  haptic("success");
                  setEditing(null);
                }}
                className="pressable flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-subtle"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Icon name="plus" className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Quick actions</span>
                  <span className="block text-xs text-muted">
                    The list of everything you can start. The default.
                  </span>
                </span>
                {centre.kind === "sheet" && (
                  <Icon name="check" className="size-4 shrink-0 text-brand" />
                )}
              </button>
            </li>

            {choices.map((choice) => (
              <li key={choice.module_key}>
                <button
                  type="button"
                  onClick={() => {
                    writeCentre({ kind: "module", key: choice.module_key });
                    haptic("success");
                    setEditing(null);
                  }}
                  className="pressable flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-subtle"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                    <Icon name={choice.icon} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    New {choice.name.toLowerCase()}
                  </span>
                  {centre.kind === "module" && centre.key === choice.module_key && (
                    <Icon name="check" className="size-4 shrink-0 text-brand" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="px-3 pt-2 text-xs text-muted">
            Kept on this phone. Hold the button again to change it back.
          </p>
        </div>
      </Sheet>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        {/* Capped and scrollable: the list grows with the person's permissions,
            and an administrator's runs past the height of a phone. */}
        <div className="max-h-[60vh] overflow-y-auto px-1 pb-2">
          {groups.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">
              Nothing here yet. Ask an administrator which modules your role
              should reach.
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.name} className="pt-2 first:pt-0">
                <h3 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  {group.name}
                </h3>
                <ul>
                  {group.items.map((entry) => (
                    <li key={entry.module_key}>
                      <Link
                        href={`/${entry.view_key}/${entry.href}`}
                        onClick={() => {
                          haptic("tap");
                          setMenuOpen(false);
                        }}
                        className="pressable flex min-h-14 items-center gap-3 rounded-2xl px-3 hover:bg-subtle"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                          <Icon name={entry.icon} className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {entry.name}
                          </span>
                          {/* Named only when it leads out of the view they are
                              standing in, since the shell changes underfoot. */}
                          {entry.view_key !== view.key && (
                            <span className="block truncate text-xs text-muted">
                              Opens in {entry.view_name}
                            </span>
                          )}
                        </span>
                        <Icon name="chevron" className="size-4 shrink-0 text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </Sheet>
    </>
  );
}
