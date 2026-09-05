import { PageTitle } from "@/components/PageTitle";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { serviceAccountStatus } from "@/lib/google/sheets";
import {
  SYNC_DEFINITION_COLUMNS,
  SYNC_RUN_COLUMNS,
  type SyncDefinition,
  type SyncRun,
  type SyncTarget,
} from "@/lib/sync";
import { SyncList } from "./SyncList";

/**
 * The syncs, and how each of them last got on.
 *
 * The service account's address is shown here rather than buried in a setup
 * page, because "share the sheet with this address" is the one step that must
 * happen outside the app and the one people forget.
 */
export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const supabase = await createClient();

  const [syncs, targets, runs, mine] = await Promise.all([
    supabase
      .from("sync_definitions")
      .select(SYNC_DEFINITION_COLUMNS)
      .order("name"),
    supabase.from("sync_targets").select("table_name, label, key_column, sort_order").order("sort_order"),
    // The most recent runs across every sync; the list picks the newest per
    // sync from these rather than making one request each.
    supabase
      .from("sync_runs")
      .select(SYNC_RUN_COLUMNS)
      .order("started_at", { ascending: false })
      .limit(100),
    getMyPermissions(),
  ]);

  return (
    <div className="space-y-5">
      <PageTitle />
      <SyncList
        syncs={(syncs.data ?? []) as unknown as SyncDefinition[]}
        targets={(targets.data ?? []) as unknown as SyncTarget[]}
        runs={(runs.data ?? []) as unknown as SyncRun[]}
        canAdd={can(mine, "data_sync", "add")}
        canRun={can(mine, "data_sync", "edit")}
        google={serviceAccountStatus()}
        viewKey={view}
      />
    </div>
  );
}
