import type { PermissionAction, StoredScope } from "@/lib/access";

/** CRUD, in the order the matrix shows them. */
export const ACTIONS: PermissionAction[] = ["view", "add", "edit", "delete"];

/** Least to most reach, which is the order the selector offers. */
export const SCOPES: StoredScope[] = ["deny", "own", "sub", "any"];

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Read",
  add: "Create",
  edit: "Update",
  delete: "Delete",
};

export const SCOPE_LABELS: Record<StoredScope, string> = {
  deny: "Deny",
  own: "Own",
  sub: "Sub",
  any: "Any",
};

export const SCOPE_HELP: Record<StoredScope, string> = {
  deny: "No access",
  own: "Own records only",
  sub: "Own and subordinates' records",
  any: "All records",
};

/**
 * A role key derived from its name, matching the snake_case of the seeded roles.
 *
 * `key` is what any future code would reference a role by, so it is generated
 * rather than asked for: nobody creating "Sales Supervisor" should have to
 * decide what its identifier looks like.
 */
export function roleKeyFrom(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export type PermissionRow = {
  module_key: string;
  action: PermissionAction;
  scope: StoredScope;
};

/** module key -> action -> scope. Every cell is filled. */
export type Matrix = Record<string, Record<PermissionAction, StoredScope>>;

export type Cell = { moduleKey: string; action: PermissionAction; scope: StoredScope };

/**
 * A complete grid for the given modules.
 *
 * An absent row means no access, so it reads as `deny` — which is why the
 * screen can show a definite value in every cell rather than a blank that could
 * mean either "denied" or "nobody has decided".
 */
export function buildMatrix(moduleKeys: string[], rows: PermissionRow[]): Matrix {
  const matrix: Matrix = {};

  for (const key of moduleKeys) {
    matrix[key] = { view: "deny", add: "deny", edit: "deny", delete: "deny" };
  }

  for (const row of rows) {
    // Ignore rows for modules this grid does not cover, rather than growing it.
    if (!matrix[row.module_key]) continue;
    matrix[row.module_key][row.action] = row.scope;
  }

  return matrix;
}

/** The cells that differ, so a save writes only what someone actually changed. */
export function diffMatrix(before: Matrix, after: Matrix): Cell[] {
  const changed: Cell[] = [];

  for (const moduleKey of Object.keys(after)) {
    for (const action of ACTIONS) {
      const next = after[moduleKey][action];
      if (before[moduleKey]?.[action] !== next) {
        changed.push({ moduleKey, action, scope: next });
      }
    }
  }

  return changed;
}

/** A copy with one cell replaced. */
export function setCell(
  matrix: Matrix,
  moduleKey: string,
  action: PermissionAction,
  scope: StoredScope,
): Matrix {
  return {
    ...matrix,
    [moduleKey]: { ...matrix[moduleKey], [action]: scope },
  };
}
