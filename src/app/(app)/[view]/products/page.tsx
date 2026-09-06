import { createClient } from "@/lib/supabase/server";
import {
  CART_COLUMNS,
  CART_CUSTOMER_COLUMNS,
  CART_HEADER_COLUMNS,
  CATALOG_COLUMNS,
  type Cart,
  type CartCustomer,
  type CartLine,
  type CatalogItem,
} from "@/lib/catalog";
import { lockedView } from "@/lib/kiosk.server";
import { primaryCurrency } from "@/lib/money.server";
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
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const supabase = await createClient();
  // Read on the server: the cookie is httpOnly, so the page cannot see it and
  // the shell would otherwise have no idea it is locked.
  const locked = (await lockedView()) !== null;

  const [catalogue, lines, cart, customers, currency] = await Promise.all([
    supabase
      .from("item_catalogue")
      .select(CATALOG_COLUMNS)
      .eq("active", true)
      // The real ordering is done in the browser, where the grouping happens;
      // this only makes the payload arrive in a settled order rather than
      // whatever the scan produced.
      .order("code", { nullsFirst: false }),
    supabase.from("cart_lines").select(CART_COLUMNS),
    // At most one row, and often none: a cart is made when somebody first puts
    // something in it, not when they open the catalogue.
    supabase.from("carts").select(CART_HEADER_COLUMNS).maybeSingle(),
    // Whoever this rep may sell to, which the policy decides rather than this
    // query. Fetched with the page because the picker has to sort them by how
    // far away they are, which cannot be done a page at a time.
    supabase.from("customers").select(CART_CUSTOMER_COLUMNS).order("shop_name"),
    // Which of the two stored prices to show. Chosen once, in Settings, and
    // never a conversion — see money.ts.
    primaryCurrency(),
  ]);

  return (
    <div className="space-y-5">
      {/* The heading, the search and the cart are one sticky block inside the
          catalogue: they have to move together, and the search owns its own
          state, so the page hands the heading down rather than the other way
          round. */}
      <Catalog
        items={(catalogue.data ?? []) as unknown as CatalogItem[]}
        lines={(lines.data ?? []) as unknown as CartLine[]}
        cart={(cart.data ?? null) as unknown as Cart | null}
        customers={(customers.data ?? []) as unknown as CartCustomer[]}
        currency={currency}
        locked={locked}
        viewKey={view}
      />
    </div>
  );
}
