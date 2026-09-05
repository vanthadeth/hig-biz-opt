"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  statusTone,
  type SyncDefinition,
  type SyncRun,
} from "@/lib/sync";

/**
 * What this sync has done, how to make the sheet notify it, and how to be rid
 * of it.
 *
 * Separate from the form because none of it is a setting: the run log is
 * history, the notifier is an instruction for a different application, and
 * deleting is not editing.
 */
export function SyncSidecar({
  sync,
  runs,
  canDelete,
  isSuperAdmin,
  viewKey,
}: {
  sync: SyncDefinition;
  runs: SyncRun[];
  canDelete: boolean;
  isSuperAdmin: boolean;
  viewKey: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Clearing is counted before it is done, and the number somebody confirms is
  // the number that goes: the same predicate produces both.
  const [clearCount, setClearCount] = useState<number | null>(null);
  const [clearTyped, setClearTyped] = useState("");
  const [cleared, setCleared] = useState<number | null>(null);

  async function countClearable() {
    haptic("tap");
    setError(null);
    setCleared(null);
    const { data, error: e } = await createClient()
      .rpc("sync_clear", { p_table: sync.target_table, p_commit: false });
    if (e) {
      setError(e.message);
      return;
    }
    setClearCount((data as number) ?? 0);
  }

  async function clearNow() {
    setBusy(true);
    setError(null);
    try {
      const { data, error: e } = await createClient()
        .rpc("sync_clear", { p_table: sync.target_table, p_commit: true });
      if (e) throw new Error(e.message);
      haptic("success");
      setCleared((data as number) ?? 0);
      setClearCount(null);
      setClearTyped("");
      router.refresh();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "Nothing was cleared.");
    } finally {
      setBusy(false);
    }
  }

  // Read at render rather than stored: the app can be moved to another domain
  // and an instruction carrying the old one would send the sheet nowhere.
  const hookUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/api/sync/hook/${sync.hook_token}`;

  const script = `// Paste into Extensions → Apps Script in this spreadsheet,
// then add an installable trigger: onSheetChange, From spreadsheet, On change.
// It sends no data — only word that something changed.
function onSheetChange() {
  UrlFetchApp.fetch(${JSON.stringify(hookUrl)}, {
    method: 'post',
    muteHttpExceptions: true,
  });
}`;

  async function run() {
    haptic("tap");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/sync/${sync.id}/run`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The sync could not be run.");
      haptic(body.status === "ok" ? "success" : "error");
      router.refresh();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The sync could not be run.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      // `.select()` because a delete the policy refuses matches no rows and
      // raises nothing at all.
      const { data, error: e } = await createClient()
        .from("sync_definitions")
        .delete()
        .eq("id", sync.id)
        .select("id");
      if (e) throw e;
      if (!data?.length) throw new Error("You may not delete this sync.");
      haptic("success");
      router.push(`/${viewKey}/data-sync`);
      router.refresh();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The sync could not be deleted.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={run}
        disabled={busy || !sync.active}
        className="pressable flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
      >
        <Icon name="refresh" className="size-4" />
        {busy ? "Running…" : "Run now"}
      </button>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {sync.trigger_kind === "change" && (
        <Card className="space-y-2 p-4">
          <SectionHeader
            title="Tell the sheet to notify us"
            caption="A one-time step inside the spreadsheet. It sends no data, only word that something changed."
          />
          <pre className="overflow-x-auto rounded-xl bg-subtle p-3 text-[11px] leading-relaxed">
            {script}
          </pre>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(script);
              setCopied(true);
              haptic("tap");
            }}
            className="pressable min-h-11 w-full rounded-xl border border-line text-sm font-medium"
          >
            {copied ? "Copied" : "Copy the script"}
          </button>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <SectionHeader title="Runs" caption="The last twenty." />
        {runs.length === 0 ? (
          <p className="text-sm text-muted">This sync has not run yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((run) => (
              <li key={run.id} className="flex items-start gap-3 py-3">
                <Chip tone={statusTone(run.status)}>{STATUS_LABELS[run.status]}</Chip>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">
                    {new Date(run.started_at).toLocaleString()} · {SOURCE_LABELS[run.source]}
                  </p>
                  <p className="text-sm">
                    {run.rows_written} written
                    {run.rows_skipped > 0 && `, ${run.rows_skipped} skipped`}
                    {run.rows_read > 0 && ` of ${run.rows_read} read`}
                  </p>
                  {run.message && (
                    <p
                      className={`text-xs ${run.status === "failed" ? "text-danger" : "text-muted"}`}
                    >
                      {run.message}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Super admin only, and the database says so too: a destructive action
          guarded by a button that happens not to be rendered is not guarded. */}
      {isSuperAdmin && (
        <Card className="space-y-3 p-4">
          <SectionHeader
            title="Clear imported data"
            caption="Everything a sync put into this table, so a mapping got wrong the first time can be undone."
          />

          <p className="text-sm text-muted">
            Deletes rows in <strong>{sync.target_table}</strong> that came from a
            sheet. Rows entered in this app are left alone. This is the table,
            not this sync — anything else writing into {sync.target_table} is
            cleared too.
          </p>

          {cleared !== null && (
            <p className="text-sm">
              {cleared} {cleared === 1 ? "row" : "rows"} cleared. Run the sync
              again to bring them back from the sheet.
            </p>
          )}

          {clearCount === null ? (
            <button
              type="button"
              onClick={countClearable}
              disabled={busy}
              className="pressable flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-medium text-danger disabled:opacity-60"
            >
              <Icon name="trash" className="size-4" />
              Clear imported data
            </button>
          ) : clearCount === 0 ? (
            <p className="text-sm text-muted">
              Nothing here came from a sheet, so there is nothing to clear.
              {sync.match_on === "natural" &&
                " This sync matches on a natural key and does not fill sheet_id, so what it wrote cannot be told apart from what people entered."}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                This will delete <strong>{clearCount}</strong>{" "}
                {clearCount === 1 ? "row" : "rows"} from {sync.target_table}, and
                whatever hangs off them. It cannot be undone from here.
              </p>
              {/* Typing the name is the friction. A second button is not: the
                  hand that pressed the first one is already moving. */}
              <Field
                label={`Type ${sync.target_table} to confirm`}
                value={clearTyped}
                onChange={setClearTyped}
                placeholder={sync.target_table}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setClearCount(null);
                    setClearTyped("");
                  }}
                  className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={clearNow}
                  disabled={busy || clearTyped.trim() !== sync.target_table}
                  className="pressable min-h-11 flex-1 rounded-xl bg-danger text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy ? "Clearing…" : `Delete ${clearCount}`}
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {canDelete && (
        <Card className="space-y-2 p-4">
          {confirming ? (
            <>
              <p className="text-sm">
                Delete this sync? Its run history goes with it. Nothing already
                written to {sync.target_table} is touched.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="pressable min-h-11 flex-1 rounded-xl bg-danger text-sm font-medium text-white disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="pressable flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-medium text-danger"
            >
              <Icon name="trash" className="size-4" />
              Delete this sync
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
