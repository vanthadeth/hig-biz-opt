import { PageTitle } from "@/components/PageTitle";
import { createClient } from "@/lib/supabase/server";
import {
  CART_COLUMNS,
  CATALOG_COLUMNS,
  type CartLine,
  type CatalogItem,
} from "@/lib/catalog";
import { Catalog } from "./Catalog";

/**
 * The catalogue you sell from.
 *
 * Inventory is where an item is a record to correct; this is where it is
 * something on a shelf with a price and a quantity left. Same rows, different
 * question — which is why the Product module finally has a job of its own
 * rather than being a second, worse Inventory.
 *
 * Only active items. An item taken out of the catalogue is out of it here
 * above all: this is the screen somebody sells from.
 */
export default async function Page() {
  const supabase = await createClient();

  const [catalogue, cart] = await Promise.all([
    supabase
      .from("item_catalogue")
      .select(CATALOG_COLUMNS)
      .eq("active", true)
      // The real ordering is done in the browser, where the grouping happens;
      // this only makes the payload arrive in a settled order rather than
      // whatever the scan produced.
      .order("code", { nullsFirst: false }),
    supabase.from("cart_lines").select(CART_COLUMNS),
  ]);

  return (
    <div className="space-y-5">
      <PageTitle />
      <Catalog
        items={(catalogue.data ?? []) as unknown as CatalogItem[]}
        lines={(cart.data ?? []) as unknown as CartLine[]}
      />
    </div>
  );
}
