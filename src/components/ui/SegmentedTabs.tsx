"use client";

export type Segment = { value: string; label: string; count?: number };

/**
 * A filter row. The active segment is a solid pill so it reads at a glance on a
 * phone, where a subtle underline would not.
 */
export function SegmentedTabs({
  segments,
  value,
  onChange,
  className = "",
}: {
  segments: Segment[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`no-scrollbar flex gap-2 overflow-x-auto pb-1 ${className}`}
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(segment.value)}
            className="pressable flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-medium text-muted aria-selected:border-brand aria-selected:bg-brand aria-selected:text-brand-fg"
          >
            {segment.label}
            {segment.count !== undefined && (
              <span className="text-xs opacity-70">{segment.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
