"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { haptic } from "@/lib/haptics";
import { useScrollHidden } from "@/hooks/useScrollDirection";
import { VISIT_TABS, centreAction, type VisitTab } from "@/lib/visitNav";

/**
 * Three buttons, and no way to rearrange them.
 *
 * The bar in the other four views has five slots and a long press to change the
 * middle ones, because those views carry a dozen modules and no two people use
 * the same three. This app has three things in it. A rep holding a phone in a
 * shop wants the check-in button under the thumb it was under yesterday, and
 * customising a bar with nothing to customise would only be a way to break it.
 *
 * Unlike `BottomNav` this is not `md:hidden`: there is no rail to hand over to
 * on a wider screen, and three buttons read the same on a tablet.
 */
export function VisitNav({ openVisitId }: { openVisitId: string | null }) {
  const pathname = usePathname();
  const hidden = useScrollHidden();
  const centre = centreAction(openVisitId);

  return (
    <nav
      data-hidden={hidden}
      aria-label="Main"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        viewTransitionName: "shell-bottomnav",
      }}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-md transition-transform duration-200 ease-out data-[hidden=true]:translate-y-[calc(100%+env(safe-area-inset-bottom))]"
    >
      <ul className="mx-auto flex max-w-md items-center">
        <NavItem tab={VISIT_TABS[0]} active={pathname === VISIT_TABS[0].href} />

        <li className="flex flex-1 justify-center">
          <Link
            href={centre.href}
            onClick={() => haptic("select")}
            aria-label={centre.label}
            className="pressable -mt-7 flex flex-col items-center"
          >
            <span className="flex size-15 items-center justify-center rounded-full bg-brand text-brand-fg shadow-[var(--shadow-fab)]">
              <Icon name={centre.icon} className="size-7" />
            </span>
            {/* Said as well as drawn. Which of the two states the button is in
                is the single most important thing on this screen, and an icon
                alone would leave a rep tapping to find out. */}
            <span className="mt-1 text-[11px] font-medium leading-none text-brand">
              {centre.label}
            </span>
          </Link>
        </li>

        <NavItem tab={VISIT_TABS[1]} active={pathname === VISIT_TABS[1].href} />
      </ul>
    </nav>
  );
}

function NavItem({ tab, active }: { tab: VisitTab; active: boolean }) {
  return (
    <li className="min-w-0 flex-1">
      <Link
        href={tab.href}
        onClick={() => haptic("tap")}
        aria-current={active ? "page" : undefined}
        className="flex min-h-16 w-full flex-col items-center justify-center gap-1.5 px-1 py-2 text-muted transition-colors aria-[current=page]:text-brand"
      >
        <Icon name={tab.icon} className="size-6" />
        <span className="w-full truncate text-center text-[11px] font-medium leading-none">
          {tab.label}
        </span>
      </Link>
    </li>
  );
}
