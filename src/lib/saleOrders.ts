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

// One order, opened -----------------------------------------------------------------

export type SaleOrderLineRow = {
  id: string;
  item_id: string | null;
  item_code: string | null;
  item_name: string;
  unit_price_usd: number | null;
  unit_price_khr: number | null;
  discount_mode: "percent" | "amount";
  discount_percent: number;
  discount_amount: number;
  quantity: number;
  free_quantity: number;
  line_total_usd: number | null;
  line_total_khr: number | null;
  sort_order: number;
};

export type SaleOrderDetail = SaleOrderRow & {
  note: string | null;
  customer:
    | {
        id: string;
        shop_name: string;
        street_address: string | null;
        district_text: string | null;
        province_text: string | null;
      }
    | null;
  seller: { full_name: string | null } | null;
  lines: SaleOrderLineRow[];
};

// One literal, not a concatenation: supabase-js reads this string in the type
// system to work out the row shape.
export const ORDER_DETAIL_COLUMNS =
  "id, order_no, status, total_usd, total_khr, discount_usd, discount_khr, created_at, note, customer:customers (id, shop_name, street_address, district_text, province_text), seller:users (full_name), lines:sale_order_lines (id, item_id, item_code, item_name, unit_price_usd, unit_price_khr, discount_mode, discount_percent, discount_amount, quantity, free_quantity, line_total_usd, line_total_khr, sort_order)";

/**
 * How the discount on a line was agreed, said the way it was said.
 *
 * A discount given as money is shown as money, with what it worked out to
 * beside it. Rewriting "two dollars off" as "2%" is telling somebody they said
 * something they did not.
 */
export function orderLineDiscount(line: {
  discount_mode: "percent" | "amount";
  discount_percent: number;
  discount_amount: number;
}): string | null {
  if (line.discount_mode === "amount") {
    if (line.discount_amount <= 0) return null;
    return `$${line.discount_amount.toFixed(2)} off · ${Number(line.discount_percent)}%`;
  }
  if (line.discount_percent <= 0) return null;
  return `${Number(line.discount_percent)}% off`;
}

/** The address under the shop name, or nothing when nobody filled one in. */
export function orderCustomerWhere(customer: {
  street_address: string | null;
  district_text: string | null;
  province_text: string | null;
} | null): string | null {
  if (!customer) return null;
  const parts = [customer.street_address, customer.district_text, customer.province_text]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);
  return parts.length ? parts.join(", ") : null;
}

/** The lines in the order they were written, whatever order they came back in. */
export function orderedLines(lines: SaleOrderLineRow[]): SaleOrderLineRow[] {
  return [...lines].sort((a, b) => a.sort_order - b.sort_order);
}
