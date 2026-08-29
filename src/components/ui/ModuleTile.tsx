import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { TintIndex } from "./StatTile";

const TINTS: Record<TintIndex, string> = {
  1: "bg-tint-1 text-tint-1-fg",
  2: "bg-tint-2 text-tint-2-fg",
  3: "bg-tint-3 text-tint-3-fg",
  4: "bg-tint-4 text-tint-4-fg",
};

/**
 * A module, as somewhere to go.
 *
 * Distinct from StatTile, which leads with a number: here the name is the
 * content, so it is set at body size and the tile keeps a fixed height. Using
 * StatTile for this made "Sales Order" wrap at heading size and threw the grid
 * out of alignment.
 */
export function ModuleTile({
  name,
  icon,
  href,
  tint = 1,
  meta,
}: {
  name: string;
  icon: string;
  href: string;
  tint?: TintIndex;
  meta?: string;
}) {
  return (
    <Link
      href={href}
      className={`pressable flex min-h-24 flex-col justify-between rounded-2xl p-3.5 ${TINTS[tint]}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-surface/70">
          <Icon name={icon} className="size-4.5" />
        </span>
        <Icon name="chevron" className="mt-1 size-4 opacity-60" />
      </span>
      <span className="mt-3 min-w-0">
        <span className="block truncate text-sm font-semibold text-fg">{name}</span>
        {meta && <span className="block truncate text-xs opacity-80">{meta}</span>}
      </span>
    </Link>
  );
}
