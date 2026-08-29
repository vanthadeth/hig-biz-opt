"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { ScopeCell } from "@/components/ui/ScopeCell";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIONS,
  ACTION_LABELS,
  buildMatrix,
  diffMatrix,
  grantedCount,
  setCell,
  setModule,
  type Matrix,
  type PermissionRow,
} from "@/lib/roleMatrix";
import { NewRoleSheet } from "./NewRoleSheet";
import type { PermissionAction, StoredScope } from "@/lib/access";

export type RoleSummary = { id: string; key: string; name: string; description: string | null };
export type ModuleSummary = { key: string; name: string; icon: string };

type Props = {
  roles: RoleSummary[];
  modules: ModuleSummary[];
  /** Every role's stored permissions, keyed by role id. */
  permissions: Record<string, PermissionRow[]>;
  canEdit: boolean;
};

/**
 * The grid is one row per module, four columns of CRUD.
 *
 * Each cell holds its own scope, so the columns line up down the whole list and
 * a role's shape is legible in one pass — which a stack of per-module cards
 * never was. It fits a 390px phone because a cell is a single control rather
 * than four buttons; see ScopeCell for how it is kept that narrow.
 */
export function RoleMatrix({ roles, modules, permissions, canEdit }: Props) {
  const moduleKeys = useMemo(() => modules.map((m) => m.key), [modules]);

  // Seeded from the server, then appended to when a role is created, so a new
  // role is selectable without a round trip through the router.
  const [roleList, setRoleList] = useState(roles);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [saved, setSaved] = useState<Record<string, Matrix>>(() =>
    Object.fromEntries(
      roles.map((role) => [role.id, buildMatrix(moduleKeys, permissions[role.id] ?? [])]),
    ),
  );
  const [draft, setDraft] = useState<Record<string, Matrix>>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const role = roleList.find((r) => r.id === roleId);
  const current = draft[roleId];
  const changes = useMemo(
    () => (current ? diffMatrix(saved[roleId], current) : []),
    [saved, roleId, current],
  );

  function update(next: Matrix) {
    setDraft((d) => ({ ...d, [roleId]: next }));
    setError(null);
  }

  function addRole(created: RoleSummary) {
    const empty = buildMatrix(moduleKeys, []);
    setRoleList((list) => [...list, created]);
    setSaved((s) => ({ ...s, [created.id]: empty }));
    setDraft((d) => ({ ...d, [created.id]: empty }));
    setRoleId(created.id);
  }

  async function save() {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.from("role_permissions").upsert(
      changes.map((cell) => ({
        role_id: roleId,
        module_key: cell.moduleKey,
        action: cell.action,
        scope: cell.scope,
      })),
      { onConflict: "role_id,module_key,action" },
    );

    if (error) {
      // Row level security refuses the write when the permission is not held,
      // so a failure here is meaningful rather than a glitch to retry.
      haptic("error");
      setError(error.message);
      setBusy(false);
      return;
    }

    haptic("success");
    setSaved((s) => ({ ...s, [roleId]: current }));
    setBusy(false);
  }

  const newRoleButton = canEdit && (
    <button
      type="button"
      onClick={() => {
        haptic("tap");
        setAdding(true);
      }}
      className="pressable flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-brand/50 px-3 text-sm font-medium text-brand"
    >
      <Icon name="plus" className="size-4" />
      New role
    </button>
  );

  const sheet = (
    <NewRoleSheet
      open={adding}
      onClose={() => setAdding(false)}
      onCreated={addRole}
      takenNames={roleList.map((r) => r.name)}
      nextSortOrder={roleList.length + 1}
    />
  );

  if (!role || !current) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {canEdit
            ? "No roles have been created yet."
            : "No roles have been created yet, and you cannot create one."}
        </p>
        {newRoleButton}
        {sheet}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        What a role may do in each module, and over whose records. Green reaches
        every record, blue only some, amber none.
      </p>

      {/* Stacked on a phone: side by side, the button eats the width the tabs
          need and clips a role name mid-word. */}
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <SegmentedTabs
          className="w-full sm:flex-1"
          segments={roleList.map((r) => ({ value: r.id, label: r.name }))}
          value={roleId}
          onChange={setRoleId}
        />
        {newRoleButton}
      </div>

      {role.description && <p className="text-sm text-muted">{role.description}</p>}

      {!canEdit && (
        <Card className="border-line p-4">
          <p className="text-sm text-muted">
            You can see this matrix but not change it. Editing needs the Role &amp;
            Permission module at update level.
          </p>
        </Card>
      )}

      <Card className="p-2 sm:p-3">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              <th className="px-1 pb-2 text-left text-xs font-medium text-muted">
                Module
              </th>
              {ACTIONS.map((action: PermissionAction) => (
                <th
                  key={action}
                  scope="col"
                  className="w-14 px-0.5 pb-2 text-center text-xs font-medium text-muted sm:w-20"
                >
                  {ACTION_LABELS[action]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((module) => (
              <tr key={module.key} className="border-t border-line/70">
                <th scope="row" className="py-1.5 pr-2 text-left align-middle">
                  <button
                    type="button"
                    disabled={!canEdit}
                    title={module.name}
                    // The row heading doubles as the row shortcut: tapping it
                    // sweeps every action to the same scope, which is how most
                    // of a matrix actually gets filled in.
                    onClick={() => {
                      haptic("select");
                      update(
                        setModule(
                          current,
                          module.key,
                          grantedCount(current, module.key) === 4 ? "deny" : "any",
                        ),
                      );
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm font-medium enabled:hover:bg-subtle disabled:cursor-default"
                  >
                    <Icon name={module.icon} className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 truncate">{module.name}</span>
                  </button>
                </th>
                {ACTIONS.map((action: PermissionAction) => (
                  <td key={action} className="px-0.5 py-1.5">
                    <ScopeCell
                      label={`${module.name} — ${ACTION_LABELS[action]}`}
                      value={current[module.key][action]}
                      disabled={!canEdit}
                      onChange={(scope: StoredScope) =>
                        update(setCell(current, module.key, action, scope))
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {canEdit && changes.length > 0 && (
        // Sits above the bottom bar so the count and the action stay reachable
        // however far down the list you have scrolled.
        <div className="sticky bottom-24 z-30 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)] md:bottom-4">
          <span className="flex-1 text-sm">
            {changes.length} change{changes.length === 1 ? "" : "s"} to {role.name}
          </span>
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              update(saved[roleId]);
            }}
            disabled={busy}
            className="pressable min-h-10 rounded-xl border border-line px-3 text-sm font-medium text-muted disabled:opacity-60"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="pressable min-h-10 rounded-xl bg-brand px-4 text-sm font-medium text-brand-fg disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {sheet}
    </div>
  );
}
