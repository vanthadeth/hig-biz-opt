import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  SCOPES,
  buildMatrix,
  diffMatrix,
  diffViews,
  roleKeyFrom,
  setCell,
  toggleView,
  type Matrix,
  type PermissionRow,
} from "./roleMatrix";

const MODULES = ["customer", "invoice", "user"];

const row = (
  module_key: string,
  action: PermissionRow["action"],
  scope: PermissionRow["scope"],
): PermissionRow => ({ module_key, action, scope });

describe("buildMatrix", () => {
  it("fills every cell so none is ambiguous", () => {
    const matrix = buildMatrix(MODULES, []);
    expect(Object.keys(matrix)).toEqual(MODULES);
    for (const key of MODULES) {
      for (const action of ACTIONS) {
        expect(matrix[key][action]).toBe("deny");
      }
    }
  });

  it("reads a missing row as denied", () => {
    // No row has always meant no access; the grid says so out loud.
    const matrix = buildMatrix(MODULES, [row("customer", "view", "any")]);
    expect(matrix.customer.view).toBe("any");
    expect(matrix.customer.delete).toBe("deny");
  });

  it("keeps a stored deny distinct from an absent row in the source data", () => {
    const stored = buildMatrix(MODULES, [row("invoice", "view", "deny")]);
    expect(stored.invoice.view).toBe("deny");
  });

  it("ignores rows for modules outside the grid", () => {
    // A module could be deactivated while its permission rows remain.
    const matrix = buildMatrix(MODULES, [row("retired_module", "view", "any")]);
    expect(matrix.retired_module).toBeUndefined();
    expect(Object.keys(matrix)).toHaveLength(3);
  });

  it("takes every action of a module", () => {
    const matrix = buildMatrix(MODULES, [
      row("user", "view", "any"),
      row("user", "add", "own"),
      row("user", "edit", "sub"),
      row("user", "delete", "deny"),
    ]);
    expect(matrix.user).toEqual({ view: "any", add: "own", edit: "sub", delete: "deny" });
  });
});

describe("diffMatrix", () => {
  const before = buildMatrix(MODULES, [row("customer", "view", "any")]);

  it("finds nothing when nothing moved", () => {
    expect(diffMatrix(before, before)).toEqual([]);
  });

  it("reports only the cell that changed", () => {
    const after = setCell(before, "customer", "add", "own");
    expect(diffMatrix(before, after)).toEqual([
      { moduleKey: "customer", action: "add", scope: "own" },
    ]);
  });

  it("reports a revocation as well as a grant", () => {
    // Narrowing to deny has to be written, not dropped as "no change".
    const after = setCell(before, "customer", "view", "deny");
    expect(diffMatrix(before, after)).toEqual([
      { moduleKey: "customer", action: "view", scope: "deny" },
    ]);
  });

  it("reports every cell that moved", () => {
    const after = ACTIONS.reduce(
      (matrix, action) => setCell(matrix, "invoice", action, "any"),
      before,
    );
    expect(diffMatrix(before, after)).toHaveLength(4);
  });

  it("does not report a cell that was changed and changed back", () => {
    const after = setCell(setCell(before, "invoice", "view", "any"), "invoice", "view", "deny");
    expect(diffMatrix(before, after)).toEqual([]);
  });

  it("survives a module the earlier grid did not have", () => {
    const narrower: Matrix = { customer: before.customer };
    const changes = diffMatrix(narrower, before);
    expect(changes.every((c) => c.moduleKey !== "customer")).toBe(true);
    expect(changes).toHaveLength(8);
  });
});

describe("setCell", () => {
  const matrix = buildMatrix(MODULES, []);

  it("leaves the original untouched", () => {
    setCell(matrix, "customer", "view", "any");
    expect(matrix.customer.view).toBe("deny");
  });

  it("does not disturb its neighbours", () => {
    const next = setCell(matrix, "customer", "view", "any");
    expect(next.customer.add).toBe("deny");
    expect(next.invoice).toBe(matrix.invoice);
  });
});

describe("the option lists", () => {
  it("offers exactly the four CRUD actions", () => {
    expect(ACTIONS).toEqual(["view", "add", "edit", "delete"]);
  });

  it("orders scopes from least to most reach", () => {
    // The dropdown lists them in this order, least reach first, so it is part
    // of the design rather than an accident of how the enum was declared.
    expect(SCOPES).toEqual(["deny", "own", "sub", "any"]);
  });
});

describe("roleKeyFrom", () => {
  it("matches the snake_case of the seeded roles", () => {
    expect(roleKeyFrom("Sales Supervisor")).toBe("sales_supervisor");
    expect(roleKeyFrom("HR")).toBe("hr");
  });

  it("collapses punctuation and runs of separators", () => {
    expect(roleKeyFrom("Warehouse & Logistics")).toBe("warehouse_logistics");
    expect(roleKeyFrom("  Field   Sales  ")).toBe("field_sales");
  });

  it("strips accents rather than dropping the letters", () => {
    expect(roleKeyFrom("Contrôleur")).toBe("controleur");
  });

  it("is empty when a name carries nothing usable", () => {
    // The form treats an empty key as invalid, which is what stops a role
    // being created with a key the unique index would reject anyway.
    expect(roleKeyFrom("!!!")).toBe("");
    expect(roleKeyFrom("   ")).toBe("");
  });
});

describe("diffViews", () => {
  it("reports nothing when the same views are held, whatever their order", () => {
    // role_views is a set; the order rows came back in is not a change.
    expect(diffViews(["admin", "sales"], ["sales", "admin"])).toEqual({
      added: [],
      removed: [],
    });
  });

  it("separates the views to grant from the views to withdraw", () => {
    expect(diffViews(["admin", "sales"], ["admin", "warehouse"])).toEqual({
      added: ["warehouse"],
      removed: ["sales"],
    });
  });

  it("reports every view as added when a role had none", () => {
    expect(diffViews([], ["sales", "admin"])).toEqual({
      added: ["admin", "sales"],
      removed: [],
    });
  });

  it("reports every view as removed when the last one is unticked", () => {
    // Allowed, and the card says what it costs: nobody holding the role can
    // enter the app. The screen warns rather than the model refusing.
    expect(diffViews(["admin"], [])).toEqual({ added: [], removed: ["admin"] });
  });
});

describe("toggleView", () => {
  it("adds a view that is not held", () => {
    expect(toggleView(["admin"], "sales")).toEqual(["admin", "sales"]);
  });

  it("removes one that is", () => {
    expect(toggleView(["admin", "sales"], "admin")).toEqual(["sales"]);
  });

  it("leaves the original alone", () => {
    const before = ["admin"];
    toggleView(before, "sales");
    expect(before).toEqual(["admin"]);
  });
});
