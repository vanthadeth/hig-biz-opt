export type GaugeSegment = { label: string; value: number; color: string };

/**
 * A half-donut split into segments, with the leading share called out in the
 * middle. Half rather than full because it sits at the top of a card and a full
 * ring wastes the width.
 */
export function Gauge({
  segments,
  caption,
  className = "",
}: {
  segments: GaugeSegment[];
  caption?: string;
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = 52;
  const circumference = Math.PI * radius; // half turn only
  const headline = Math.round(((segments[0]?.value ?? 0) / total) * 100);

  // Offsets are accumulated up front rather than mutated inside the render,
  // so drawing the segments stays a pure map over precomputed values.
  const arcs = segments.reduce<
    { label: string; color: string; length: number; offset: number }[]
  >((acc, segment) => {
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    acc.push({
      label: segment.label,
      color: segment.color,
      length: (segment.value / total) * circumference,
      offset,
    });
    return acc;
  }, []);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative">
        <svg viewBox="0 0 128 72" className="w-40" fill="none">
          <path
            d="M 12 64 A 52 52 0 0 1 116 64"
            stroke="var(--subtle)"
            strokeWidth={12}
            strokeLinecap="round"
          />
          {arcs.map((arc) => (
            <path
              key={arc.label}
              d="M 12 64 A 52 52 0 0 1 116 64"
              stroke={arc.color}
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={`${arc.length} ${circumference}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-x-0 bottom-1 text-center">
          <div className="text-2xl font-semibold tracking-tight">{headline}%</div>
          {caption && <div className="text-xs text-muted">{caption}</div>}
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="size-2 rounded-full" style={{ background: segment.color }} />
            {segment.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
