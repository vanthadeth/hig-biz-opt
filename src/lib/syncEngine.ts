import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleSheetsError, readSheet } from "@/lib/google/sheets";
import {
  a1Range,
  buildRows,
  isDue,
  nextRunAt,
  skipMessage,
  SYNC_COLUMN_MAP_COLUMNS,
  SYNC_DEFINITION_COLUMNS,
  syncProblems,
  type SyncColumnMap,
  type SyncDefinition,
  type SyncSource,
} from "@/lib/sync";

/**
 * Running a sync: fetch the tab, map it, hand it to the database.
 *
 * Server-only, and deliberately the thinnest part of this feature. The reading
 * is one function in `google/sheets.ts`, the mapping is pure code in `sync.ts`,
 * and the writing is one `security definer` function in the database that
 * re-validates everything. What is left here is the order those happen in and
 * the record of having done it.
 *
 * Every run writes a `sync_runs` row before it starts and finishes it whatever
 * happens, including on the way out of a throw. A sync that fails silently is
 * worse than one that fails, because the sheet goes on being right and the app
 * goes on being wrong and nobody is told.
 */
export type SyncOutcome = {
  syncId: string;
  status: "ok" | "failed";
  rowsRead: number;
  rowsWritten: number;
  rowsSkipped: number;
  message: string | null;
};

export async function runSync(
  syncId: string,
  source: SyncSource,
  actorId: string | null = null,
): Promise<SyncOutcome> {
  const supabase = createAdminClient();

  const { data: sync } = await supabase
    .from("sync_definitions")
    .select(SYNC_DEFINITION_COLUMNS)
    .eq("id", syncId)
    .maybeSingle<SyncDefinition>();

  if (!sync) throw new Error("That sync no longer exists.");
  if (!sync.active) throw new Error("That sync is switched off.");

  const { data: run } = await supabase
    .from("sync_runs")
    .insert({ sync_id: syncId, source, actor_id: actorId })
    .select("id")
    .single();

  const finish = async (outcome: Omit<SyncOutcome, "syncId">) => {
    const finishedAt = new Date();
    await supabase
      .from("sync_runs")
      .update({
        status: outcome.status,
        finished_at: finishedAt.toISOString(),
        rows_read: outcome.rowsRead,
        rows_written: outcome.rowsWritten,
        rows_skipped: outcome.rowsSkipped,
        message: outcome.message,
      })
      .eq("id", run?.id);

    // The clock only moves on a run that happened. A failing sync that pushed
    // its next run forward would go quiet for an hour at exactly the moment
    // somebody needs it to keep trying.
    await supabase
      .from("sync_definitions")
      .update({
        last_run_at: finishedAt.toISOString(),
        next_run_at: nextRunAt(finishedAt, sync.interval_minutes),
      })
      .eq("id", syncId);

    return { syncId, ...outcome };
  };

  try {
    const [{ data: maps }, { data: target }] = await Promise.all([
      supabase
        .from("sync_column_maps")
        .select(SYNC_COLUMN_MAP_COLUMNS)
        .eq("sync_id", syncId)
        .order("sort_order"),
      supabase
        .from("sync_targets")
        .select("key_column")
        .eq("table_name", sync.target_table)
        .single(),
    ]);

    const mapping = (maps ?? []) as SyncColumnMap[];
    const keyColumn = target?.key_column as string;

    // Checked here as well as in the screen that saved it, because a mapping
    // can be broken after it was saved — a column dropped, a target blocked.
    const problems = syncProblems(sync, mapping, keyColumn);
    if (problems.length > 0) throw new Error(problems.join(" "));

    const { headers, rows } = await readSheet(
      sync.spreadsheet_id,
      a1Range(sync.tab_name, sync.header_row),
    );

    if (headers.length === 0) {
      return await finish({
        status: "ok",
        rowsRead: 0,
        rowsWritten: 0,
        rowsSkipped: 0,
        message: "The tab is empty.",
      });
    }

    const built = buildRows(headers, rows, mapping, keyColumn);

    if (built.records.length === 0) {
      return await finish({
        status: "ok",
        rowsRead: built.read,
        rowsWritten: 0,
        rowsSkipped: built.skipped,
        message: skipMessage(built) ?? "Nothing to write.",
      });
    }

    // One statement, so a sheet that is wrong halfway down leaves the table as
    // it was rather than half-updated.
    const { data: written, error } = await supabase.rpc("sync_apply", {
      p_sync: syncId,
      p_rows: built.records,
    });
    if (error) throw new Error(error.message);

    return await finish({
      status: "ok",
      rowsRead: built.read,
      rowsWritten: (written as number) ?? built.records.length,
      rowsSkipped: built.skipped,
      message: skipMessage(built),
    });
  } catch (e) {
    const message =
      e instanceof GoogleSheetsError || e instanceof Error
        ? e.message
        : "The sync failed for a reason it did not report.";
    return await finish({
      status: "failed",
      rowsRead: 0,
      rowsWritten: 0,
      rowsSkipped: 0,
      message,
    });
  }
}

/**
 * Every interval sync that is due.
 *
 * One at a time rather than in parallel: these write to the same few tables,
 * and a scheduler that fires ten syncs at once turns a slow sheet into a lock
 * queue. Nothing here is urgent enough to be worth that.
 */
export async function runDueSyncs(now = new Date()): Promise<SyncOutcome[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sync_definitions")
    .select(SYNC_DEFINITION_COLUMNS)
    .eq("active", true)
    .eq("trigger_kind", "interval");

  const due = ((data ?? []) as SyncDefinition[]).filter((s) => isDue(s, now));

  const outcomes: SyncOutcome[] = [];
  for (const sync of due) {
    try {
      outcomes.push(await runSync(sync.id, "schedule"));
    } catch (e) {
      // runSync records its own failures; this only catches one that could not
      // even open a run row, which must not stop the syncs behind it.
      outcomes.push({
        syncId: sync.id,
        status: "failed",
        rowsRead: 0,
        rowsWritten: 0,
        rowsSkipped: 0,
        message: e instanceof Error ? e.message : "Could not start.",
      });
    }
  }

  return outcomes;
}
