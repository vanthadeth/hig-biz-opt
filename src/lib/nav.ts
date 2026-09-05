/**
 * The shapes navigation is made of, and the one function that arranges them.
 *
 * Separate from `access.ts` on purpose. That module reaches for the server-side
 * Supabase client, which imports `next/headers` and cannot exist in a browser
 * bundle. These are pure values that both sides need — the bottom bar and the
 * menu sheet are client components — so importing them must not drag the server
 * along. Types alone would have been safe, since those are erased; `groupNav`
 * is a value, and a value is what pulls a module graph behind it.
 */

export type NavItem = {
  module_key: string;
  name: string;
  icon: string;
  href: string;
  sort_order: number;
  /** Which heading this module sits under on the menu. From the registry, so a
      module cannot be filed one way in the database and another on screen. */
  group_name: string;
};

/**
 * Everything one person can reach, wherever it is filed.
 *
 * Distinct from NavItem, which is what one *view* offers. The bars belong to
 * the view you are standing in; the menu belongs to you, so it carries the view
 * to enter each module through — the current one where it holds the module, and
 * otherwise the first one you hold that does.
 */
export type MenuModule = NavItem & {
  view_key: string;
  view_name: string;
};

/** One heading, and what sits under it. */
export type Group<T> = { name: string; items: T[] };

/**
 * The navigation under its headings, in the order the registry gives.
 *
 * Group order is not stored anywhere: a group sits where its first module sits,
 * which is the sort order somebody already curated. That means a new module
 * cannot put its group somewhere surprising without sorting there itself, and
 * there is no second ordering to keep consistent with the first.
 */
export function groupNav<T extends { group_name: string }>(nav: T[]): Group<T>[] {
  const groups: Group<T>[] = [];

  for (const item of nav) {
    const existing = groups.find((g) => g.name === item.group_name);
    if (existing) existing.items.push(item);
    else groups.push({ name: item.group_name, items: [item] });
  }

  return groups;
}
