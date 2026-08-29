"use client";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A week of days as tap targets, the selected one filled with brand. */
export function DayStrip({
  days,
  selected,
  onSelect,
  className = "",
}: {
  days: Date[];
  selected: Date;
  onSelect: (day: Date) => void;
  className?: string;
}) {
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const today = new Date();

  return (
    <div className={`no-scrollbar flex gap-2 overflow-x-auto pb-1 ${className}`}>
      {days.map((day) => {
        const active = sameDay(day, selected);
        return (
          <button
            key={day.toISOString()}
            type="button"
            aria-pressed={active}
            aria-label={day.toDateString()}
            onClick={() => onSelect(day)}
            className={`pressable flex min-h-16 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border transition-colors ${
              active ? "border-brand bg-brand text-brand-fg" : "border-line text-muted"
            }`}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide">
              {DAY_NAMES[day.getDay()]}
            </span>
            <span className={`text-lg font-semibold leading-none ${active ? "text-brand-fg" : "text-fg"}`}>
              {day.getDate()}
            </span>
            <span
              className={`size-1 rounded-full ${sameDay(day, today) && !active ? "bg-brand" : "bg-transparent"}`}
            />
          </button>
        );
      })}
    </div>
  );
}
