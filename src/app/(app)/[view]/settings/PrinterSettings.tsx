"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import {
  sortPrinters,
  validatePrinter,
  type Printer,
  type PrinterDraft,
} from "@/lib/printers";
import { createClient } from "@/lib/supabase/client";

const EMPTY: PrinterDraft = { label: "", eprint_address: "", location: "" };

/**
 * The printers a job can be sent to.
 *
 * HIG prints over email, so a printer here is an address plus enough labelling
 * to tell one from another in a list — which branch, which counter. One of them
 * is the default, which is where anything prints when nobody picks.
 */
export function PrinterSettings({
  printers,
  canEdit,
}: {
  printers: Printer[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Printer | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<PrinterDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = sortPrinters(printers);
  const problems = validatePrinter(draft, printers, editing?.id ?? null);
  const valid = Object.keys(problems).length === 0;
  const open = adding || editing !== null;

  function openAdd() {
    haptic("tap");
    setDraft(EMPTY);
    setError(null);
    setAdding(true);
  }

  function openEdit(printer: Printer) {
    haptic("tap");
    setDraft({
      label: printer.label,
      eprint_address: printer.eprint_address,
      location: printer.location ?? "",
    });
    setError(null);
    setEditing(printer);
  }

  function close() {
    setAdding(false);
    setEditing(null);
    setDraft(EMPTY);
    setError(null);
  }

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const row = {
      label: draft.label.trim(),
      eprint_address: draft.eprint_address.trim(),
      location: draft.location.trim() || null,
    };

    // `.select()` on both branches for a reason: an insert the policy refuses
    // raises, but an update it refuses simply matches no rows and reports no
    // error at all — the USING clause hides the row rather than rejecting the
    // statement. Without asking for the affected rows back, a refused edit
    // would look exactly like a successful one.
    const { data, error } = editing
      ? await supabase.from("printers").update(row).eq("id", editing.id).select("id")
      : await supabase
          .from("printers")
          .insert({ ...row, sort_order: printers.length + 1 })
          .select("id");

    setBusy(false);
    if (error || !data?.length) {
      haptic("error");
      setError(
        error?.message ?? "That printer could not be changed. You may not have permission.",
      );
      return;
    }

    haptic("success");
    close();
    router.refresh();
  }

  async function makeDefault(printer: Printer) {
    if (printer.is_default) return;
    setBusy(true);
    setError(null);

    // One statement, not two: the partial unique index means clearing the old
    // default and setting the new one cannot be separate round trips.
    const { error } = await createClient().rpc("set_default_printer", {
      p_printer: printer.id,
    });

    setBusy(false);
    if (error) {
      haptic("error");
      setError(error.message);
      return;
    }

    haptic("success");
    router.refresh();
  }

  async function remove(printer: Printer) {
    setBusy(true);
    setError(null);

    // Deactivated rather than deleted: an address that printed something last
    // month should still be identifiable next month.
    const { data, error } = await createClient()
      .from("printers")
      .update({ active: false, is_default: false })
      .eq("id", printer.id)
      .select("id");

    setBusy(false);
    if (error || !data?.length) {
      haptic("error");
      setError(
        error?.message ?? "That printer could not be removed. You may not have permission.",
      );
      return;
    }

    haptic("success");
    close();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Printer addresses"
        caption="Documents are sent to these by email. One is the default."
      />

      {ordered.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-muted">
            {canEdit
              ? "No printers yet. Add the e-print address of one to get started."
              : "No printers have been set up yet."}
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-line p-0">
          {ordered.map((printer) => (
            <div key={printer.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Icon name="file" className="size-5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{printer.label}</span>
                  {printer.is_default && <Chip tone="accent">Default</Chip>}
                </div>
                <p className="truncate text-xs text-muted">{printer.eprint_address}</p>
                {printer.location && (
                  <p className="truncate text-xs text-muted">{printer.location}</p>
                )}
              </div>

              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  {!printer.is_default && (
                    <button
                      type="button"
                      onClick={() => makeDefault(printer)}
                      disabled={busy}
                      className="pressable min-h-9 rounded-lg border border-line px-2 text-xs font-medium text-muted hover:text-fg disabled:opacity-60"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(printer)}
                    aria-label={`Edit ${printer.label}`}
                    className="pressable flex size-9 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-fg"
                  >
                    <Icon name="dots" className="size-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {error && !open && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={openAdd}
          className="pressable flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand/50 text-sm font-medium text-brand"
        >
          <Icon name="plus" className="size-4" />
          Add printer
        </button>
      )}

      <Sheet
        open={open}
        onClose={close}
        title={editing ? "Edit printer" : "Add printer"}
      >
        <div className="space-y-4 px-3 pb-4 pt-1">
          <Field
            label="Label"
            value={draft.label}
            onChange={(label) => setDraft((d) => ({ ...d, label }))}
            placeholder="Front counter"
            error={draft.label ? problems.label : null}
          />
          <Field
            label="E-print address"
            type="email"
            inputMode="email"
            value={draft.eprint_address}
            onChange={(eprint_address) => setDraft((d) => ({ ...d, eprint_address }))}
            placeholder="hig-counter@print.epsonconnect.com"
            hint="The address the printer accepts documents at."
            error={draft.eprint_address ? problems.eprint_address : null}
          />
          <Field
            label="Location"
            optional
            value={draft.location}
            onChange={(location) => setDraft((d) => ({ ...d, location }))}
            placeholder="Phnom Penh head office, ground floor"
          />

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            {editing ? (
              <button
                type="button"
                onClick={() => remove(editing)}
                disabled={busy}
                className="pressable min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-danger disabled:opacity-60"
              >
                Remove
              </button>
            ) : (
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium text-muted disabled:opacity-60"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!valid || busy}
              className="pressable min-h-11 flex-1 rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
            >
              {busy ? "Saving…" : editing ? "Save" : "Add printer"}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
