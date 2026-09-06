import type { MenuModule } from "@/lib/nav";

/**
 * Which module sits in which slot of the bottom bar.
 *
 * Held on the device rather than in the database, and deliberately: this is
 * where somebody's thumb expects to find things on the phone they carry, not a
 * fact about their account. A rep with a work phone and a spare wants the two
 * arranged the same way only if they say so.
 *
 * The bar is Home, a slot, the raised centre button, another slot, Menu. Only
 * the two slots are arranged here: Home is the way back from anywhere and Menu
 * is what you reach for when the bar has not got the thing you want, and both
 * stop being reliable the moment they move.
 */
export const SLOT_KEYS = ["left", "right"] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];

export type SlotConfig = Partial<Record<SlotKey, string>>;

export const SLOTS_STORAGE_KEY = "hig.bottomNav.slots";
export const CENTRE_STORAGE_KEY = "hig.bottomNav.centre";

export const SLOT_LABELS: Record<SlotKey, string> = {
  left: "Left button",
  right: "Right button",
};

/**
 * What the raised centre button does when tapped.
 *
 * "sheet" opens the quick actions, which is the default and the only option
 * that reaches everything. The others pin one thing to the tap, for somebody
 * who does the same thing forty times a day. A long press always reopens this
 * choice, so pinning is never a one-way door.
 */
export type CentreAction = { kind: "sheet" } | { kind: "catalog" } | { kind: "module"; key: string };

export function parseCentre(raw: string | null): CentreAction {
  if (raw === "catalog") return { kind: "catalog" };
  if (raw?.startsWith("module:")) {
    const key = raw.slice(7);
    return key ? { kind: "module", key } : { kind: "sheet" };
  }
  return { kind: "sheet" };
}

export function serialiseCentre(action: CentreAction): string {
  if (action.kind === "catalog") return "catalog";
  if (action.kind === "module") return `module:${action.key}`;
  return "sheet";
}

/**
 * The modules a slot may hold: this view's own, in the order the registry put
 * them. A slot pointing at a module in another view would navigate out of the
 * workspace somebody is standing in.
 */
export function slotChoices(modules: MenuModule[], viewKey: string): MenuModule[] {
  return modules.filter((m) => m.view_key === viewKey);
}

/**
 * The three modules to show, given what somebody chose and what they can reach.
 *
 * A chosen module that has since been taken away — a permission changed, a
 * module retired — falls back to the default rather than leaving a hole or a
 * link that 404s. Nothing here trusts what came out of storage.
 */
export function resolveSlots(
  config: SlotConfig,
  available: MenuModule[],
  viewKey: string,
): MenuModule[] {
  const choices = slotChoices(available, viewKey);
  const byKey = new Map(choices.map((m) => [m.module_key, m]));
  const defaults = choices.slice(0, SLOT_KEYS.length);

  const picked: MenuModule[] = [];
  const used = new Set<string>();

  SLOT_KEYS.forEach((slot, i) => {
    const wanted = config[slot];
    // Not the same module twice: two identical buttons is a bar with two dead
    // slots, and it is an easy thing to do by accident.
    const chosen =
      wanted && byKey.has(wanted) && !used.has(wanted) ? byKey.get(wanted) : undefined;
    const fallback = defaults.find((m) => !used.has(m.module_key) && m !== chosen);
    const entry = chosen ?? fallback;
    if (entry) {
      picked[i] = entry;
      used.add(entry.module_key);
    }
  });

  return picked.filter(Boolean);
}

/** Reads a stored config without trusting a word of it. */
export function parseSlots(raw: string | null): SlotConfig {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: SlotConfig = {};
    for (const key of SLOT_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && value !== "") out[key] = value;
    }
    return out;
  } catch {
    // Somebody else's key, a half-written value, a browser that cleared itself.
    // The default bar is always a correct answer.
    return {};
  }
}
