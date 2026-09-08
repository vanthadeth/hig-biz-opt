import { createAdminClient } from "@/lib/supabase/admin";
import { INVENTORY_BUCKET } from "@/lib/inventory";
import { GoogleSheetsError, readSheet } from "@/lib/google/sheets";
import { driveFileIdFrom, fetchDriveFile } from "@/lib/google/drive";
import {
  a1Range,
  buildRows,
  driveImagePrefix,
  extensionFor,
  isDue,
  matchColumn,
  nextRunAt,
  skipMessage,
  splitDriveReferences,
  SYNC_COLUMN_MAP_COLUMNS,
  SYNC_DEFINITION_COLUMNS,
  syncProblems,
  withReferenceNamePrefix,
  type DriveReference,
  type SyncColumnMap,
  type SyncDefinition,
  type SyncSource,
  type TargetColumn,
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
    const [{ data: maps }, { data: target }, { data: columns }] = await Promise.all([
      supabase
        .from("sync_column_maps")
        .select(SYNC_COLUMN_MAP_COLUMNS)
        .eq("sync_id", syncId)
        .order("sort_order"),
      supabase
        .from("sync_targets")
        .select("key_column, pk_column")
        .eq("table_name", sync.target_table)
        .single(),
      supabase.rpc("sync_columns_for_engine", { p_table: sync.target_table }),
    ]);

    const mapping = (maps ?? []) as SyncColumnMap[];
    // What a row is matched on: the sheet's own ID, or the target's natural key
    // for a sheet that has none.
    const keyColumn = matchColumn(sync, {
      key_column: (target?.key_column as string) ?? "",
    });

    // Checked here as well as in the screen that saved it, because a mapping
    // can be broken after it was saved — a column dropped, a target blocked,
    // or a uuid column left pointed straight at a sheet's own id scheme with
    // no reference to resolve it through.
    const problems = syncProblems(sync, mapping, keyColumn, (columns ?? []) as TargetColumn[]);
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

    const built = buildRows(headers, rows, mapping, keyColumn, sync.require_column);

    if (built.records.length === 0) {
      return await finish({
        status: "ok",
        rowsRead: built.read,
        rowsWritten: 0,
        rowsSkipped: built.skipped,
        message: skipMessage(built) ?? "Nothing to write.",
      });
    }

    // A column mapped to prefix with a referenced row's name needs that
    // name looked up before the row reaches `sync_apply` — the same reason
    // `drive_image` is resolved out here rather than inside it. The lookup
    // itself is one query against whichever table this sync's own reference
    // mapping points at, only made when some column actually asks for it.
    let prefixed = built.records;
    if (mapping.some((m) => m.transform === "reference_name_prefix")) {
      const referenceTable = mapping.find((m) => m.reference_table !== null)?.reference_table;
      if (referenceTable) {
        const { data: referenced } = await supabase
          .from(referenceTable)
          .select("sheet_id, name")
          .not("sheet_id", "is", null);
        const referenceNames = new Map(
          ((referenced ?? []) as { sheet_id: string; name: string }[]).map((r) => [
            r.sheet_id,
            r.name,
          ]),
        );
        prefixed = withReferenceNamePrefix(built.records, mapping, referenceNames);
      }
    }

    // A `drive_image` column names a file, not the value it will hold — that
    // takes a fetch `sync_apply` never does (see `sync.ts`). Pulled out here
    // so the one statement below still writes every ordinary column in a
    // single all-or-nothing pass.
    const { rows: toWrite, references } = splitDriveReferences(prefixed, mapping, keyColumn);

    // One statement, so a sheet that is wrong halfway down leaves the table as
    // it was rather than half-updated.
    const { data: written, error } = await supabase.rpc("sync_apply", {
      p_sync: syncId,
      p_rows: toWrite,
    });
    if (error) throw new Error(error.message);

    // The pictures are a second, best-effort pass on top of a write that has
    // already succeeded: one shop's bad Drive link should not undo a table
    // full of correctly written rows, so a failure here is counted and
    // reported, never thrown.
    const driveMessage =
      references.length > 0
        ? await applyDriveImages(supabase, sync.target_table, target?.pk_column as string, keyColumn, references)
        : null;

    return await finish({
      status: "ok",
      rowsRead: built.read,
      rowsWritten: (written as number) ?? built.records.length,
      rowsSkipped: built.skipped,
      message: [skipMessage(built), driveMessage].filter((m) => m).join(" "),
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

/**
 * The second phase of a sync with a `drive_image` column: find the row
 * `sync_apply` just wrote, fetch its picture from Drive, put it in the
 * `inventory` bucket, and point the row at it.
 *
 * One reference at a time and each wrapped in its own `try`, because these
 * are independent network calls to a service outside HIG's control — a shop
 * whose picture Drive refuses, or whose link is simply wrong, must not cost
 * the sheet's other ninety-nine rows their picture too. What comes back is a
 * short count for the run's message, not a throw.
 */
async function applyDriveImages(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  pkColumn: string,
  keyColumn: string,
  references: DriveReference[],
): Promise<string | null> {
  let ok = 0;
  let failed = 0;

  for (const ref of references) {
    try {
      const { data: row } = await supabase
        .from(table)
        .select(pkColumn)
        .eq(keyColumn, ref.key as string | number | boolean)
        .maybeSingle();
      const id = (row as Record<string, unknown> | null)?.[pkColumn];
      if (!id) {
        failed += 1;
        continue;
      }

      const fileId = driveFileIdFrom(ref.reference);
      if (!fileId) {
        failed += 1;
        continue;
      }

      const { bytes, contentType } = await fetchDriveFile(fileId);
      const path = `${driveImagePrefix(table)}/${id}/${Date.now()}.${extensionFor(contentType)}`;

      const { error: uploadError } = await supabase.storage
        .from(INVENTORY_BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (uploadError) {
        failed += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from(table)
        .update({ [ref.column]: path })
        .eq(pkColumn, id as string);
      if (updateError) {
        failed += 1;
        continue;
      }

      ok += 1;
    } catch {
      failed += 1;
    }
  }

  const parts: string[] = [];
  if (ok > 0) parts.push(`${ok} picture${ok === 1 ? "" : "s"} fetched from Drive`);
  if (failed > 0) parts.push(`${failed} Drive picture${failed === 1 ? "" : "s"} could not be fetched`);
  return parts.length > 0 ? parts.join(", ") : null;
}
