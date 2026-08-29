const SIZES = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-11 text-sm" };

/** Initials on brand, or a photo when one exists. */
export function Avatar({
  name,
  src,
  size = "md",
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${SIZES[size]} shrink-0 rounded-full object-cover ring-2 ring-surface ${className}`}
      />
    );
  }

  return (
    <span
      title={name}
      className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-brand-fg ring-2 ring-surface ${className}`}
    >
      {initials || "?"}
    </span>
  );
}

/** Overlapping avatars, with the remainder counted rather than drawn. */
export function AvatarStack({
  people,
  max = 4,
  size = "sm",
}: {
  people: { id: string; name: string; src?: string | null }[];
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  return (
    <div className="flex items-center -space-x-2">
      {shown.map((person) => (
        <Avatar key={person.id} name={person.name} src={person.src} size={size} />
      ))}
      {extra > 0 && (
        <span
          className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full bg-subtle font-semibold text-muted ring-2 ring-surface`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
