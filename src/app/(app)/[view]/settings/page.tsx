import { PageTitle } from "@/components/PageTitle";
import { can, getMyPermissions } from "@/lib/access";
import { PRINTER_COLUMNS, type Printer } from "@/lib/printers";
import { createClient } from "@/lib/supabase/server";
import { primaryCurrency } from "@/lib/money.server";
import { CurrencySettings } from "./CurrencySettings";
import { PrinterSettings } from "./PrinterSettings";

export default async function Page() {
  const supabase = await createClient();

  const [printersResult, mine, currency] = await Promise.all([
    supabase.from("printers").select(PRINTER_COLUMNS).eq("active", true).order("sort_order"),
    getMyPermissions(),
    primaryCurrency(),
  ]);

  const canEdit = can(mine, "settings", "edit");

  return (
    <div className="space-y-5">
      <PageTitle />
      <CurrencySettings current={currency} canEdit={canEdit} />
      <PrinterSettings
        printers={(printersResult.data ?? []) as Printer[]}
        canEdit={canEdit}
      />
    </div>
  );
}
