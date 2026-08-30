import type { StoredScope } from "@/lib/access";

/**
 * How a scope is painted, on the brand scale: green reaches every record, the
 * brand blue reaches some, and Deny carries no fill at all — an absence rather
 * than a colour, which also keeps the grants as the thing that catches the eye
 * in a grid that is mostly denials.
 *
 * Fill and text are separate maps because the slider needs them apart: the
 * thumb takes the fill, and the label under it takes the text colour.
 *
 * Every pair is computed against what actually sits behind it, not eyeballed.
 * The lowest is 4.84:1, white on the light-mode blue. The near miss worth
 * remembering: --muted on --subtle is 4.49:1, which is why neither a grey fill
 * nor a --subtle track is used here.
 */
export const SCOPE_FILL: Record<StoredScope, string> = {
  deny: "bg-surface",
  own: "bg-brand/15",
  sub: "bg-brand",
  any: "bg-accent",
};

export const SCOPE_TEXT: Record<StoredScope, string> = {
  deny: "text-fg",
  own: "text-fg",
  sub: "text-brand-fg",
  any: "text-accent-fg",
};

/** The same scale as a read-only chip, for the collapsed rows of the matrix. */
export const SCOPE_CHIP: Record<StoredScope, string> = {
  deny: "border-line bg-transparent text-muted",
  own: "border-transparent bg-brand/15 text-fg",
  sub: "border-transparent bg-brand text-brand-fg",
  any: "border-transparent bg-accent text-accent-fg",
};
