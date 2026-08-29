"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { roleKeyFrom } from "@/lib/roleMatrix";
import { createClient } from "@/lib/supabase/client";
import type { RoleSummary } from "./RoleMatrix";

/**
 * Creates a role, and nothing else.
 *
 * A new role starts with no permissions at all — deny on every action of every
 * module — because the alternative is guessing, and a role that quietly arrives
 * holding access nobody granted is the worst kind of default. The matrix opens
 * on it so the next step is the obvious one.
 */
export function NewRoleSheet({
  open,
  onClose,
  onCreated,
  takenNames,
  nextSortOrder,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (role: RoleSummary) => void;
  takenNames: string[];
  nextSortOrder: number;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const key = roleKeyFrom(trimmed);
  // `name` and `key` are both unique in the database. Catching a clash here is a
  // courtesy; the constraint is what actually holds.
  const duplicate = takenNames.some(
    (taken) => taken.toLowerCase() === trimmed.toLowerCase(),
  );
  const valid = trimmed.length > 1 && key.length > 0 && !duplicate;

  function close() {
    setName("");
    setDescription("");
    setError(null);
    onClose();
  }

  async function create() {
    if (!valid) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("roles")
      .insert({
        key,
        name: trimmed,
        description: description.trim() || null,
        sort_order: nextSortOrder,
      })
      .select("id, key, name, description")
      .single();

    if (error || !data) {
      // Row level security refuses the insert without role_permission.edit, so
      // a failure here is a real answer rather than a glitch to retry.
      haptic("error");
      setError(error?.message ?? "The role could not be created.");
      setBusy(false);
      return;
    }

    haptic("success");
    setBusy(false);
    onCreated(data as RoleSummary);
    close();
  }

  return (
    <Sheet open={open} onClose={close} title="New role">
      <div className="space-y-4 px-3 pb-4 pt-1">
        <label className="block">
          <span className="text-xs font-medium text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            placeholder="Sales Supervisor"
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-brand"
          />
          {key && (
            <span className="mt-1 block text-xs text-muted">
              Identifier: <code>{key}</code>
            </span>
          )}
          {duplicate && (
            <span className="mt-1 block text-xs text-danger">
              A role called “{trimmed}” already exists.
            </span>
          )}
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">
            Description <span className="font-normal">(optional)</span>
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoComplete="off"
            placeholder="What this role is for"
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-brand"
          />
        </label>

        <p className="text-xs text-muted">
          The role starts with no access. Set its permissions in the matrix and
          save.
        </p>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium text-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={create}
            disabled={!valid || busy}
            className="pressable min-h-11 flex-1 rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create role"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
