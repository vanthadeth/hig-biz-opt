/**
 * Orders, as the list reads them.
 *
 * Thin on purpose. The order's own module — editing, cancelling, fulfilment —
 * is not designed yet, and this is what the cart's Convert button needs to
 * point at: a place the order can be seen.
 */

export type SaleOrderRow = {
  id: string;
  order_no: string;
  status: "new" | "cancelled";
  total_usd: number | null;
  total_khr: number | null;
  discount_usd: number | null;
  discount_khr: number | null;
  created_at: string;
  /** Embedded rather than joined by hand; null once a customer is removed. */
  customer: { shop_name: string } | null;
};

// One literal, not a concatenation: supabase-js reads this string in the type
// system to work out the row shape.
export const ORDER_COLUMNS =
  "id, order_no, status, total_usd, total_khr, discount_usd, discount_khr, created_at, customer:customers (shop_name)";

/**
 * The day an order was placed.
 *
 * Day, not minute: nobody looking down a list of orders is choosing between
 * two placed eleven minutes apart, and a timestamp that precise reads as
 * machinery rather than as a date.
 */
export function orderDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
