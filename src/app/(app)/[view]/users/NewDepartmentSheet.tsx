"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import type { Department } from "@/lib/users";

/**
 * Creates a department, so a new one does not need a trip to the database.
 *
 * The department list is organisation configuration, and the policy on
 * public.departments asks for `role_permission.edit` — the same permission that
 * governs roles. So the caller only offers this to someone holding it, and the
 * insert is refused for anyone else regardless.
 */
export function NewDepartmentSheet({
  open,
  onClose,
  onCreated,
  existing,
  nextSortOrder,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (department: Department) => void;
  existing: Department[];
  nextSortOrder: number;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  // `name` is unique in the database. Catching it here is a courtesy; the
  // constraint is what actually holds.
  const duplicate = existing.some(
    (d) => d.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const valid = trimmed.length > 1 && !duplicate;

  function close() {
    setName("");
    setError(null);
    onClose();
  }

  async function create() {
    if (!valid) return;
    setBusy(true);
    setError(null);

    const { data, error } = await createClient()
      .from("departments")
      .insert({ name: trimmed, sort_order: nextSortOrder })
      .select("id, name, sort_order")
      .single();

    setBusy(false);
    if (error || !data) {
      haptic("error");
      setError(error?.message ?? "The department could not be created.");
      return;
    }

    haptic("success");
    onCreated(data as Department);
    close();
  }

  return (
    <Sheet open={open} onClose={close} title="New department">
      <div className="space-y-4 px-3 pb-4 pt-1">
        <Field
          label="Name"
          value={name}
          onChange={setName}
          placeholder="Marketing"
          error={
            duplicate ? `A department called “${trimmed}” already exists.` : null
          }
        />

        <p className="text-xs text-muted">
          Departments group people on the staff list. The new one is selected for
          this person once created.
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
            {busy ? "Creating…" : "Create department"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
