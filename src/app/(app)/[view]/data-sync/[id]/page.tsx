import { notFound } from "next/navigation";
import { PageTitle } from "@/components/PageTitle";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  SYNC_COLUMN_MAP_COLUMNS,
  SYNC_DEFINITION_COLUMNS,
  SYNC_RUN_COLUMNS,
  type SyncColumnMap,
  type SyncDefinition,
  type SyncRun,
  type SyncTarget,
} from "@/lib/sync";
import { SyncForm } from "../SyncForm";
import { SyncSidecar } from "../SyncSidecar";

export default async function Page({
  params,
}: {
  params: Promise<{ view: string; id: string }>;
}) {
  const { view, id } = await params;
  const supabase = await createClient();

  const [{ data: sync }, { data: maps }, { data: targets }, { data: runs }, mine] =
    await Promise.all([
      supabase
        .from("sync_definitions")
        .select(SYNC_DEFINITION_COLUMNS)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("sync_column_maps")
        .select(SYNC_COLUMN_MAP_COLUMNS)
        .eq("sync_id", id)
        .order("sort_order"),
      supabase
        .from("sync_targets")
        .select("table_name, label, key_column, sort_order")
        .order("sort_order"),
      supabase
        .from("sync_runs")
        .select(SYNC_RUN_COLUMNS)
        .eq("sync_id", id)
        .order("started_at", { ascending: false })
        .limit(20),
      getMyPermissions(),
    ]);

  if (!sync) notFound();

  const definition = sync as unknown as SyncDefinition;

  return (
    <div className="space-y-5">
      <PageTitle />
      <SyncSidecar
        sync={definition}
        runs={(runs ?? []) as unknown as SyncRun[]}
        canDelete={can(mine, "data_sync", "delete")}
        viewKey={view}
      />
      {can(mine, "data_sync", "edit") && (
        <SyncForm
          sync={definition}
          maps={(maps ?? []) as unknown as SyncColumnMap[]}
          targets={(targets ?? []) as unknown as SyncTarget[]}
          viewKey={view}
        />
      )}
    </div>
  );
}
