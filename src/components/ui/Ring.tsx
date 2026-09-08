/**
 * One figure against the target it is measured by.
 *
 * A ring rather than a bar because three of them fit across a phone and read as
 * one snapshot, where three stacked bars read as a list you have to work down.
 * The percentage sits in the middle and the real figures sit under it: the ring
 * is the shape, the numbers are the record.
 *
 * The arc stops at full and the numbers do not, so nine calls against a target
 * of eight is a complete ring reading "9 / 8". Clipping the ninth would hide
 * the best thing that happened today.
 */
export function Ring({
  percent,
  met,
  label,
  done,
  target,
}: {
  percent: number;
  met: boolean;
  label: string;
  done: string;
  target: string;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(100, Math.round(percent)));
  const stroke = met ? "var(--accent)" : "var(--brand)";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--subtle)" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(shown / 100) * circumference} ${circumference}`}
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-xs font-semibold tabular-nums">
          {shown}%
        </span>
      </div>

      <span className="text-[11px] leading-none text-muted">{label}</span>
      <span className="text-[11px] font-medium leading-none tabular-nums">
        {done}
        <span className="text-muted"> / {target}</span>
      </span>
    </div>
  );
}
