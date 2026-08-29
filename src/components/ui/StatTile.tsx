import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Sparkline } from "./Sparkline";

export type TintIndex = 1 | 2 | 3 | 4;

const TINTS: Record<TintIndex, string> = {
  1: "bg-tint-1 text-tint-1-fg",
  2: "bg-tint-2 text-tint-2-fg",
  3: "bg-tint-3 text-tint-3-fg",
  4: "bg-tint-4 text-tint-4-fg",
};

type StatTileProps = {
  value: string | number;
  label: string;
  tint?: TintIndex;
  /** Optional trend shape. Omitted when there is nothing real to plot. */
  trend?: number[];
  href?: string;
  icon?: string;
};

/**
 * A headline number on a tinted ground.
 *
 * The value stays in the foreground colour rather than the tint's accent, so it
 * keeps full contrast; the accent is spent on the trend line and the chevron.
 */
export function StatTile({ value, label, tint = 1, trend, href, icon }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl font-semibold tracking-tight text-fg">{value}</span>
        {trend ? (
          <Sparkline points={trend} className="h-6 w-16 shrink-0" area />
        ) : icon ? (
          <Icon name={icon} className="size-5 shrink-0" />
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate text-sm text-muted">{label}</span>
        {href && <Icon name="chevron" className="size-4 shrink-0" />}
      </div>
    </>
  );

  const className = `block rounded-2xl p-4 ${TINTS[tint]}`;

  if (href) {
    return (
      <Link href={href} className={`pressable ${className}`}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
