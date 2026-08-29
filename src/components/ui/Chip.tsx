export type ChipTone = "neutral" | "brand" | "accent" | "warn" | "danger";

const TONES: Record<ChipTone, string> = {
  neutral: "bg-subtle text-muted",
  brand: "bg-brand/10 text-brand",
  accent: "bg-accent/12 text-tint-3-fg",
  warn: "bg-warn text-warn-fg",
  danger: "bg-danger/10 text-danger",
};

/** A small label: a category, a status, a priority. */
export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium leading-5 ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
