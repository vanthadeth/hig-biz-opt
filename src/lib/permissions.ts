/**
 * The permission vocabulary, and the one question asked of it.
 *
 * Split out of `access.ts` because that module reads `next/headers` to find the
 * signed-in person, and a client component that imports a *value* from it drags
 * the whole server module into the browser bundle — which does not fail at
 * runtime, it fails the build. Types are erased and safe to import from
 * anywhere; functions are not. This file has no imports at all, so it is safe
 * on both sides.
 */

export type PermissionAction = "view" | "add" | "edit" | "delete";

/** A reach that has actually been granted. `my_permissions()` returns only these. */
export type PermissionScope = "own" | "sub" | "any";

/**
 * What a matrix cell holds. `deny` is a decision somebody made, which is not
 * the same as a permission nobody has configured — the difference is invisible
 * once resolved, but the editing screen needs both.
 */
export type StoredScope = PermissionScope | "deny";

export type Permission = {
  module_key: string;
  action: PermissionAction;
  scope: PermissionScope;
};

export function can(
  permissions: Permission[],
  moduleKey: string,
  action: PermissionAction,
): boolean {
  return permissions.some((p) => p.module_key === moduleKey && p.action === action);
}
