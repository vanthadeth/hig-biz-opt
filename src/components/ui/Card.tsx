import Link from "next/link";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  /** Turns the card into a link and gives it a press response. */
  href?: string;
};

/** The surface everything else sits on: rounded, softly raised, theme-aware. */
export function Card({ children, className = "", href }: CardProps) {
  const base = `rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)] ${className}`;

  if (href) {
    return (
      <Link href={href} className={`pressable block hover:border-brand/30 ${base}`}>
        {children}
      </Link>
    );
  }

  return <div className={base}>{children}</div>;
}
