"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { haptic } from "@/lib/haptics";
import {
  scheduleLabel,
  STATUS_LABELS,
  statusTone,
  type SyncDefinition,
  type SyncRun,
  type SyncTarget,
} from "@/lib/sync";

/**
 * Every sync, with the one fact that matters about each: did the last run work.
 *
 * A sync that has been failing for a week is the failure mode this whole
 * feature has — the sheet goes on being right, the app goes on being wrong, and
 * nobody is told. So the status is the loudest thing on the row, and a failure
 * puts its reason on the card rather than one tap away.
 */
export function SyncList({
  syncs,
  targets,
  runs,
  canAdd,
  canRun,
  serviceAccount,
  viewKey,
}: {
  syncs: SyncDefinition[];
  targets: SyncTarget[];
  runs: SyncRun[];
  canAdd: boolean;
  canRun: boolean;
  serviceAccount: string | null;
  viewKey: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetLabel = (table: string) =>
    targets.find((t) => t.table_name === table)?.label ?? table;

  // The runs arrive newest first, so the first one seen for a sync is its last.
  const lastRun = new Map<string, SyncRun>();
  for (const run of runs) {
    if (!lastRun.has(run.sync_id)) lastRun.set(run.sync_id, run);
  }

  async function runNow(sync: SyncDefinition) {
    haptic("tap");
    setBusy(sync.id);
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
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4">
        <p className="text-sm font-medium">Google Sheets → this app, one way</p>
        <p className="text-sm text-muted">
          A sync reads a tab and writes to a table. Nothing here can write back to
          a sheet: the credential this app holds is read-only, so Google would
          refuse it.
        </p>
        {serviceAccount ? (
          <p className="text-xs text-muted">
            Share each sheet as a <strong>Viewer</strong> with{" "}
            <span className="break-all font-medium text-fg">{serviceAccount}</span>
          </p>
        ) : (
          <p className="text-xs text-danger">
            No Google service account is configured yet, so no sync can read
            anything. Set GOOGLE_SERVICE_ACCOUNT_JSON.
          </p>
        )}
      </Card>

      {canAdd && (
        <Link
          href={`/${viewKey}/data-sync/new`}
          className="pressable flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-brand-fg"
        >
          <Icon name="plus" className="size-4" />
          New sync
        </Link>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {syncs.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">
            No syncs yet. One sync moves one tab into one table.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {syncs.map((sync) => {
            const run = lastRun.get(sync.id);
            return (
              <li key={sync.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <Link
                      href={`/${viewKey}/data-sync/${sync.id}`}
                      className="min-w-0 flex-1"
                    >
                      <span className="block truncate text-sm font-medium">
                        {sync.name}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {sync.tab_name} → {targetLabel(sync.target_table)}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {scheduleLabel(sync)}
                      </span>
                    </Link>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {run ? (
                        <Chip tone={statusTone(run.status)}>
                          {STATUS_LABELS[run.status]}
                        </Chip>
                      ) : (
                        <Chip>Never run</Chip>
                      )}
                      {!sync.active && <Chip tone="warn">Off</Chip>}
                    </div>
                  </div>

                  {run?.status === "ok" && (
                    <p className="text-xs text-muted">
                      {run.rows_written} written
                      {run.rows_skipped > 0 && `, ${run.rows_skipped} skipped`}
                      {run.message && ` — ${run.message}`}
                    </p>
                  )}

                  {/* A failure says why here rather than one tap away: a sync
                      failing quietly is the whole risk of this feature. */}
                  {run?.status === "failed" && run.message && (
                    <p className="text-xs text-danger">{run.message}</p>
                  )}

                  {canRun && (
                    <button
                      type="button"
                      onClick={() => runNow(sync)}
                      disabled={busy !== null || !sync.active}
                      className="pressable flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-medium disabled:opacity-50"
                    >
                      <Icon name="refresh" className="size-4" />
                      {busy === sync.id ? "Running…" : "Run now"}
                    </button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
