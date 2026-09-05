import { redirect } from "next/navigation";
import { PageTitle } from "@/components/PageTitle";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { SyncTarget } from "@/lib/sync";
import { SyncForm } from "../SyncForm";

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;

  const mine = await getMyPermissions();
  if (!can(mine, "data_sync", "add")) redirect(`/${view}/data-sync`);

  const supabase = await createClient();
  const { data } = await supabase
    .from("sync_targets")
    .select("table_name, label, key_column, sort_order")
    .order("sort_order");

  return (
    <div className="space-y-5">
      <PageTitle />
      <SyncForm
        sync={null}
        maps={[]}
        targets={(data ?? []) as unknown as SyncTarget[]}
        viewKey={view}
      />
    </div>
  );
}
