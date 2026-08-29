"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ScopeSelector } from "@/components/ui/ScopeSelector";
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
  SCOPES,
  SCOPE_LABELS,
  type Matrix,
  type PermissionRow,
} from "@/lib/roleMatrix";
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

export function RoleMatrix({ roles, modules, permissions, canEdit }: Props) {
  const moduleKeys = useMemo(() => modules.map((m) => m.key), [modules]);

  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [saved, setSaved] = useState<Record<string, Matrix>>(() =>
    Object.fromEntries(
      roles.map((role) => [role.id, buildMatrix(moduleKeys, permissions[role.id] ?? [])]),
    ),
  );
  const [draft, setDraft] = useState<Record<string, Matrix>>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = roles.find((r) => r.id === roleId);
  const current = draft[roleId];
  const changes = useMemo(
    () => (current ? diffMatrix(saved[roleId], current) : []),
    [saved, roleId, current],
  );

  if (!role || !current) {
    return <p className="text-sm text-muted">No roles have been created yet.</p>;
  }

  function update(next: Matrix) {
    setDraft((d) => ({ ...d, [roleId]: next }));
    setError(null);
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

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        What a role may do in each module, and over whose records.
      </p>

      <SegmentedTabs
        segments={roles.map((r) => ({ value: r.id, label: r.name }))}
        value={roleId}
        onChange={setRoleId}
      />

      {role.description && <p className="text-sm text-muted">{role.description}</p>}

      {!canEdit && (
        <Card className="border-line p-4">
          <p className="text-sm text-muted">
            You can see this matrix but not change it. Editing needs the Role &amp;
            Permission module at update level.
          </p>
        </Card>
      )}

      <ul className="space-y-3">
        {modules.map((module) => {
          const granted = grantedCount(current, module.key);
          return (
            <li key={module.key}>
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{module.name}</h3>
                  <Chip tone={granted === 0 ? "neutral" : "brand"}>
                    {granted === 0 ? "No access" : `${granted} of 4`}
                  </Chip>
                </div>

                {canEdit && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="self-center text-xs text-muted">Set all:</span>
                    {SCOPES.map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => {
                          haptic("select");
                          update(setModule(current, module.key, scope));
                        }}
                        className="pressable rounded-md border border-line px-2 py-1 text-xs font-medium text-muted hover:text-fg"
                      >
                        {SCOPE_LABELS[scope]}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {ACTIONS.map((action: PermissionAction) => (
                    <div key={action} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
                      <span className="text-xs text-muted">{ACTION_LABELS[action]}</span>
                      <ScopeSelector
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
              </Card>
            </li>
          );
        })}
      </ul>

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
    </div>
  );
}
