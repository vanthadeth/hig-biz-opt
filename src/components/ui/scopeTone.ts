import type { StoredScope } from "@/lib/access";

/**
 * How a scope is painted, on the brand scale: green reaches every record, the
 * brand blue reaches some, and Deny carries no fill at all — an absence rather
 * than a colour, which also keeps the grants as the thing that catches the eye
 * in a grid that is mostly denials.
 *
 * One map, used by both the cell and the swatch in its menu, so the two can
 * never disagree about what a scope looks like.
 *
 * Every pair is computed against what actually sits behind it, not eyeballed.
 * The lowest is 4.84:1, white on the light-mode blue. The near miss worth
 * remembering: --muted on --subtle is 4.49:1, which is why Deny has no grey
 * fill — on the card it sits on, muted text clears at 5.05:1.
 */
export const SCOPE_CHIP: Record<StoredScope, string> = {
  deny: "border-line bg-transparent text-muted",
  own: "border-transparent bg-brand/15 text-fg",
  sub: "border-transparent bg-brand text-brand-fg",
  any: "border-transparent bg-accent text-accent-fg",
};
