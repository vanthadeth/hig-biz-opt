import { Icon } from "@/components/Icon";
import type { TintIndex } from "./StatTile";

const TINTS: Record<TintIndex, string> = {
  1: "bg-tint-1 text-tint-1-fg",
  2: "bg-tint-2 text-tint-2-fg",
  3: "bg-tint-3 text-tint-3-fg",
  4: "bg-tint-4 text-tint-4-fg",
};

/**
 * One entry in a day's list: what kind of thing it is, what it is, and when.
 *
 * The kind sits above the title in small caps rather than beside it, so the
 * titles stay left-aligned and scannable down the column.
 */
export function TimelineItem({
  kind,
  title,
  time,
  icon = "square",
  tint = 1,
  last = false,
}: {
  kind: string;
  title: string;
  time?: string;
  icon?: string;
  tint?: TintIndex;
  last?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${TINTS[tint]}`}>
          <Icon name={icon} className="size-4.5" />
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-line" />}
      </div>

      <div className={`min-w-0 flex-1 ${last ? "" : "pb-5"}`}>
        <p className="text-xs text-muted">{kind}</p>
        <p className="mt-0.5 font-medium leading-snug">{title}</p>
        {time && <p className="mt-1 text-xs text-muted">{time}</p>}
      </div>
    </li>
  );
}
