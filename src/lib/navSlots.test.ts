import { describe, expect, it } from "vitest";
import {
  parseCentre,
  parseSlots,
  serialiseCentre,
  resolveSlots,
  slotChoices,
  SLOT_KEYS,
  type SlotConfig,
} from "./navSlots";
import type { MenuModule } from "./nav";

const mod = (key: string, view_key = "sales"): MenuModule => ({
  module_key: key,
  name: key,
  icon: "square",
  href: key,
  view_key,
  view_name: view_key,
  group_name: "Group",
  sort_order: 0,
});

const available = [
  mod("customer"),
  mod("product"),
  mod("sale_order"),
  mod("invoice"),
  mod("audit_log", "admin"),
];

describe("slotChoices", () => {
  it("offers only the view somebody is standing in", () => {
    // A slot pointing elsewhere would navigate out of the workspace.
    expect(slotChoices(available, "sales").map((m) => m.module_key)).toEqual([
      "customer",
      "product",
      "sale_order",
      "invoice",
    ]);
  });
});

describe("resolveSlots", () => {
  it("falls back to the view's first modules when nothing is chosen", () => {
    expect(resolveSlots({}, available, "sales").map((m) => m.module_key)).toEqual([
      "customer",
      "product",
    ]);
  });

  it("honours what somebody chose", () => {
    const config: SlotConfig = { left: "invoice", right: "product" };
    expect(resolveSlots(config, available, "sales").map((m) => m.module_key)).toEqual([
      "invoice",
      "product",
    ]);
  });

  it("fills the slot left unset", () => {
    const filled = resolveSlots({ right: "invoice" }, available, "sales");
    expect(filled.map((m) => m.module_key)).toContain("invoice");
    expect(filled).toHaveLength(2);
  });

  it("never puts the same module in two slots", () => {
    // Two identical buttons is a bar with two dead slots, and an easy thing to
    // do by accident.
    const keys = resolveSlots(
      { left: "product", right: "product" },
      available,
      "sales",
    ).map((m) => m.module_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("drops a choice the person can no longer reach", () => {
    // A permission changed, or the module was retired. Better the default than
    // a hole or a link that 404s.
    const keys = resolveSlots({ left: "gone_away" }, available, "sales")
      .map((m) => m.module_key);
    expect(keys).toHaveLength(2);
    expect(keys).not.toContain("gone_away");
  });

  it("drops a choice belonging to another view", () => {
    const keys = resolveSlots({ left: "audit_log" }, available, "sales")
      .map((m) => m.module_key);
    expect(keys).not.toContain("audit_log");
  });

  it("gives back what there is when a view has fewer modules than slots", () => {
    expect(resolveSlots({}, [mod("customer")], "sales")).toHaveLength(1);
    expect(resolveSlots({}, [], "sales")).toEqual([]);
  });
});

describe("parseSlots", () => {
  it("reads a config back", () => {
    expect(parseSlots('{"left":"invoice"}')).toEqual({ left: "invoice" });
  });

  it("treats anything unreadable as no config at all", () => {
    // Somebody else's key, a half-written value, a browser that cleared itself.
    // The default bar is always a correct answer.
    expect(parseSlots(null)).toEqual({});
    expect(parseSlots("not json")).toEqual({});
    expect(parseSlots("[1,2,3]")).toEqual({});
    expect(parseSlots('"a string"')).toEqual({});
  });

  it("ignores keys that are not slots, and values that are not names", () => {
    expect(parseSlots('{"left":"invoice","nonsense":"x","right":42}')).toEqual({
      left: "invoice",
    });
  });

  it("names two slots, which is what the bar has room for beside Home and Menu", () => {
    expect(SLOT_KEYS).toHaveLength(2);
  });
});

describe("the centre button", () => {
  it("opens the quick actions unless told otherwise", () => {
    expect(parseCentre(null)).toEqual({ kind: "sheet" });
    expect(parseCentre("sheet")).toEqual({ kind: "sheet" });
  });

  it("can be pinned to the catalogue", () => {
    expect(parseCentre("catalog")).toEqual({ kind: "catalog" });
  });

  it("or to one module", () => {
    expect(parseCentre("module:customer")).toEqual({ kind: "module", key: "customer" });
  });

  it("falls back to the sheet on anything it cannot read", () => {
    // The sheet reaches everything, so it is the safe answer to a value that
    // came out of storage wrong.
    expect(parseCentre("module:")).toEqual({ kind: "sheet" });
    expect(parseCentre("nonsense")).toEqual({ kind: "sheet" });
  });

  it("round-trips", () => {
    for (const action of [
      { kind: "sheet" } as const,
      { kind: "catalog" } as const,
      { kind: "module", key: "invoice" } as const,
    ]) {
      expect(parseCentre(serialiseCentre(action))).toEqual(action);
    }
  });
});
