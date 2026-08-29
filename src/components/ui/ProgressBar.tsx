/** A labelled completion bar. `value` is a percentage and is clamped. */
export function ProgressBar({
  value,
  label,
  className = "",
  tone = "brand",
}: {
  value: number;
  label?: string;
  className?: string;
  tone?: "brand" | "accent";
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const fill = tone === "accent" ? "bg-accent" : "bg-brand";

  return (
    <div className={className}>
      {(label || label === "") && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">{label}</span>
          <span className="font-medium text-fg">{pct}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className="h-1.5 w-full overflow-hidden rounded-full bg-subtle"
      >
        <div
          className={`h-full rounded-full ${fill} transition-[width] duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
