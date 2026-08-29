import { PageTitle } from "@/components/PageTitle";
import { can, getMyPermissions } from "@/lib/access";
import { PRINTER_COLUMNS, type Printer } from "@/lib/printers";
import { createClient } from "@/lib/supabase/server";
import { PrinterSettings } from "./PrinterSettings";

export default async function Page() {
  const supabase = await createClient();

  const [printersResult, mine] = await Promise.all([
    supabase.from("printers").select(PRINTER_COLUMNS).eq("active", true).order("sort_order"),
    getMyPermissions(),
  ]);

  return (
    <div className="space-y-5">
      <PageTitle />
      <PrinterSettings
        printers={(printersResult.data ?? []) as Printer[]}
        canEdit={can(mine, "settings", "edit")}
      />
    </div>
  );
}
