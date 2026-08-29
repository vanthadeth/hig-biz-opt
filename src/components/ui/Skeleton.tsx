/** A shimmering placeholder, sized by the caller. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-lg bg-subtle ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--line) 60%, transparent) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.4s linear infinite",
      }}
    />
  );
}
