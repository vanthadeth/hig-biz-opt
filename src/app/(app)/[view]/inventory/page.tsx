import { PageTitle } from "@/components/PageTitle";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { CATALOGUE_COLUMNS, type CatalogueEntry } from "@/lib/inventory";
import { ItemList } from "./ItemList";

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const supabase = await createClient();

  // The catalogue view rather than the items table: the list needs a category
  // path, a brand name and a price range per row, and doing those joins here
  // costs one request instead of four.
  const [catalogue, mine] = await Promise.all([
    supabase.from("item_catalogue").select(CATALOGUE_COLUMNS).order("name_en"),
    getMyPermissions(),
  ]);

  return (
    <div className="space-y-5">
      <PageTitle />
      <ItemList
        items={(catalogue.data ?? []) as CatalogueEntry[]}
        canAdd={can(mine, "inventory", "add")}
        viewKey={view}
      />
    </div>
  );
}
