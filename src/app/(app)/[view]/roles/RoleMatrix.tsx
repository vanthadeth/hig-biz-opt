"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { ScopePicker } from "@/components/ui/ScopePicker";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIONS,
  ACTION_LABELS,
  buildMatrix,
  diffMatrix,
  diffViews,
  setCell,
  type Matrix,
  type PermissionRow,
} from "@/lib/roleMatrix";
import { NewRoleSheet } from "./NewRoleSheet";
import { RoleViews, type ViewOption } from "./RoleViews";
import type { PermissionAction, StoredScope } from "@/lib/access";

export type RoleSummary = { id: string; key: string; name: string; description: string | null };
export type ModuleSummary = { key: string; name: string; icon: string };

type Props = {
  roles: RoleSummary[];
  modules: ModuleSummary[];
  /** Every role's stored permissions, keyed by role id. */
  permissions: Record<string, PermissionRow[]>;
  /** The workspaces a role may be given. */
  views: ViewOption[];
  /** Every role's assigned view keys, keyed by role id. */
  roleViews: Record<string, string[]>;
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
export function RoleMatrix({
  roles,
  modules,
  permissions,
  views,
  roleViews,
  canEdit,
}: Props) {
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
  const [savedViews, setSavedViews] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(roles.map((role) => [role.id, roleViews[role.id] ?? []])),
  );
  const [draftViews, setDraftViews] = useState<Record<string, string[]>>(savedViews);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const role = roleList.find((r) => r.id === roleId);
  const current = draft[roleId];
  const currentViews = useMemo(() => draftViews[roleId] ?? [], [draftViews, roleId]);
  const changes = useMemo(
    () => (current ? diffMatrix(saved[roleId], current) : []),
    [saved, roleId, current],
  );
  const viewChanges = useMemo(
    () => diffViews(savedViews[roleId] ?? [], currentViews),
    [savedViews, roleId, currentViews],
  );
  const pending = changes.length + viewChanges.added.length + viewChanges.removed.length;

  function update(next: Matrix) {
    setDraft((d) => ({ ...d, [roleId]: next }));
    setError(null);
  }

  function updateViews(next: string[]) {
    setDraftViews((d) => ({ ...d, [roleId]: next }));
    setError(null);
  }

  function discard() {
    update(saved[roleId]);
    updateViews(savedViews[roleId] ?? []);
  }

  function addRole(created: RoleSummary) {
    const empty = buildMatrix(moduleKeys, []);
    setRoleList((list) => [...list, created]);
    setSaved((s) => ({ ...s, [created.id]: empty }));
    setDraft((d) => ({ ...d, [created.id]: empty }));
    setSavedViews((s) => ({ ...s, [created.id]: [] }));
    setDraftViews((d) => ({ ...d, [created.id]: [] }));
    setRoleId(created.id);
  }

  async function save() {
    setBusy(true);
    setError(null);

    const supabase = createClient();

    try {
      if (changes.length > 0) {
        const { error } = await supabase.from("role_permissions").upsert(
          changes.map((cell) => ({
            role_id: roleId,
            module_key: cell.moduleKey,
            action: cell.action,
            scope: cell.scope,
          })),
          { onConflict: "role_id,module_key,action" },
        );
        // Row level security refuses the write when the permission is not held,
        // so a failure here is meaningful rather than a glitch to retry.
        if (error) throw error;
      }

      if (viewChanges.removed.length > 0) {
        // A delete the policy refuses matches no rows and raises nothing, so
        // the rows actually removed are counted rather than assumed.
        const { data, error } = await supabase
          .from("role_views")
          .delete()
          .eq("role_id", roleId)
          .in("view_key", viewChanges.removed)
          .select("view_key");
        if (error) throw error;
        if ((data?.length ?? 0) < viewChanges.removed.length) {
          throw new Error("Those views could not be withdrawn. Check your permission.");
        }
      }

      if (viewChanges.added.length > 0) {
        const { error } = await supabase.from("role_views").insert(
          viewChanges.added.map((key) => ({
            role_id: roleId,
            view_key: key,
            sort_order: views.findIndex((v) => v.key === key) + 1,
          })),
        );
        if (error) throw error;
      }
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "Those changes could not be saved.");
      setBusy(false);
      return;
    }

    haptic("success");
    setSaved((s) => ({ ...s, [roleId]: current }));
    setSavedViews((s) => ({ ...s, [roleId]: currentViews }));
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
        What a role may do in each module, and over whose records. Tap a cell to
        choose: green reaches every record, blue only some, an empty cell none.
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

      <RoleViews
        views={views}
        selected={currentViews}
        roleName={role.name}
        disabled={!canEdit}
        onChange={updateViews}
      />

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
                <th
                  scope="row"
                  title={module.name}
                  className="py-1.5 pr-2 text-left align-middle"
                >
                  <span className="flex items-center gap-2 px-1 py-1 text-sm font-medium">
                    <Icon name={module.icon} className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 truncate">{module.name}</span>
                  </span>
                </th>
                {ACTIONS.map((action: PermissionAction) => (
                  <td key={action} className="px-0.5 py-1.5">
                    <ScopePicker
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

      {canEdit && pending > 0 && (
        // Sits above the bottom bar so the count and the action stay reachable
        // however far down the list you have scrolled.
        <div className="sticky bottom-24 z-30 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)] md:bottom-4">
          <span className="flex-1 text-sm">
            {pending} change{pending === 1 ? "" : "s"} to {role.name}
          </span>
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              discard();
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
