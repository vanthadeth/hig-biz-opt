import Link from "next/link";
import { Icon } from "@/components/Icon";

/** A section title, with an optional caption and a link out to the full list. */
export function SectionHeader({
  title,
  caption,
  actionLabel,
  actionHref,
  className = "",
}: {
  title: string;
  caption?: string;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {caption && <p className="mt-0.5 truncate text-xs text-muted">{caption}</p>}
      </div>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-brand transition-opacity hover:opacity-70"
        >
          {actionLabel}
          <Icon name="chevron" className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
