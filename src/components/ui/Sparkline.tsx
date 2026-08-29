type SparklineProps = {
  /** Two or more values. Rendered as a normalised trend, not to scale. */
  points: number[];
  className?: string;
  /** Fills the area beneath the line. */
  area?: boolean;
};

/**
 * A trend line with no axes, labels or scale — it shows shape, not magnitude,
 * which is all a stat tile has room to say.
 */
export function Sparkline({ points, className = "", area = false }: SparklineProps) {
  if (points.length < 2) return null;

  const width = 64;
  const height = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;

  const coords = points.map((value, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const filled = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {area && <path d={filled} fill="currentColor" opacity={0.12} />}
      <path
        d={line}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
