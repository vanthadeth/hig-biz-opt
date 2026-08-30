"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { ScopeSlider } from "@/components/ui/ScopeSlider";
import { SCOPE_CHIP } from "@/components/ui/scopeTone";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIONS,
  ACTION_LABELS,
  buildMatrix,
  diffMatrix,
  setCell,
  SCOPE_LABELS,
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
  // One module open at a time: the sliders need the width, and a page of 32 of
  // them is harder to read than the grid it replaced.
  const [expanded, setExpanded] = useState<string | null>(null);

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
        What a role may do in each module, and over whose records. Open a module
        to set its four permissions; the further right a slider sits, the more
        records that permission reaches.
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
        {/* The four values stay in columns so a role still reads as a grid.
            On a phone they sit under the module name, because four chips and a
            name on one 390px line leaves the name as an initial. From `sm` up
            there is room for one line, and the header follows suit. */}
        <div className="px-2 pb-2 text-xs font-medium text-muted">
          <div className="hidden sm:flex sm:items-center sm:gap-1">
            <span className="flex-1">Module</span>
            {ACTIONS.map((action: PermissionAction) => (
              <span key={action} className="w-20 text-center">
                {ACTION_LABELS[action]}
              </span>
            ))}
            <span className="w-4 shrink-0" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-4 gap-1 sm:hidden">
            {ACTIONS.map((action: PermissionAction) => (
              <span key={action} className="text-center">
                {ACTION_LABELS[action]}
              </span>
            ))}
          </div>
        </div>

        <ul>
          {modules.map((module) => {
            const open = expanded === module.key;
            return (
              <li key={module.key} className="border-t border-line/70">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`scopes-${module.key}`}
                  onClick={() => {
                    haptic("tap");
                    setExpanded(open ? null : module.key);
                  }}
                  className="flex w-full flex-col gap-1.5 rounded-lg px-2 py-2 text-left hover:bg-subtle sm:flex-row sm:items-center sm:gap-1"
                >
                  <span className="flex min-w-0 items-center gap-2 sm:flex-1">
                    <Icon name={module.icon} className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 truncate text-sm font-medium" title={module.name}>
                      {module.name}
                    </span>
                    <Icon
                      name="chevron"
                      className={`ml-auto size-4 shrink-0 text-muted transition-transform sm:hidden ${
                        open ? "rotate-90" : ""
                      }`}
                    />
                  </span>

                  <span className="grid grid-cols-4 gap-1 sm:flex sm:gap-1">
                    {ACTIONS.map((action: PermissionAction) => (
                      <span
                        key={action}
                        className={`rounded-lg border py-1 text-center text-xs font-medium sm:w-20 ${
                          SCOPE_CHIP[current[module.key][action]]
                        }`}
                      >
                        {SCOPE_LABELS[current[module.key][action]]}
                      </span>
                    ))}
                  </span>

                  <Icon
                    name="chevron"
                    className={`hidden size-4 shrink-0 text-muted transition-transform sm:block ${
                      open ? "rotate-90" : ""
                    }`}
                  />
                </button>

                {open && (
                  <div
                    id={`scopes-${module.key}`}
                    // Capped: four stops spread across a 1400px screen is a
                    // slider you have to travel, not one you can read.
                    className="max-w-xl space-y-2 px-2 pb-3 pt-1"
                    style={{ animation: "fade-up 200ms ease-out both" }}
                  >
                    {ACTIONS.map((action: PermissionAction) => (
                      <div
                        key={action}
                        className="grid grid-cols-[4.5rem_1fr] items-center gap-2"
                      >
                        <span className="text-xs text-muted">
                          {ACTION_LABELS[action]}
                        </span>
                        <ScopeSlider
                          label={`${module.name} — ${ACTION_LABELS[action]}`}
                          value={current[module.key][action]}
                          disabled={!canEdit}
                          onChange={(scope: StoredScope) =>
                            update(setCell(current, module.key, action, scope))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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
