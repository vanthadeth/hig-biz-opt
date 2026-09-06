import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { createClient } from "@/lib/supabase/server";
import { primaryCurrency } from "@/lib/money.server";
import { totalIn } from "@/lib/money";
import { ORDER_COLUMNS, orderDate, type SaleOrderRow } from "@/lib/saleOrders";

/**
 * What the carts became.
 *
 * Deliberately a list and not much else: an order somebody cannot see is not
 * an order they can act on, and this is the smallest thing that makes the
 * Convert button on the cart mean something. Editing, cancelling and the rest
 * of the order's life belong to this module when it is designed properly.
 *
 * Whose orders appear is the policy's decision, not this query's — a rep with
 * `sale_order.view` at 'own' sees theirs, at 'sub' sees their department's.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const supabase = await createClient();
  const currency = await primaryCurrency();
  const { data } = await supabase
    .from("sale_orders")
    .select(ORDER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);

  const orders = (data ?? []) as unknown as SaleOrderRow[];

  return (
    <div className="space-y-4">
      <PageTitle />

      {orders.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">
            No orders yet. Build a cart in the catalogue, choose a customer, and
            convert it.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/${view}/sale-orders/${order.id}`}
                className="pressable block"
              >
                <Card className="flex items-center gap-3 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium tabular-nums">
                        {order.order_no}
                      </span>
                      {order.status === "cancelled" && (
                        <Chip tone="danger">Cancelled</Chip>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {order.customer?.shop_name ?? "Customer removed"} ·{" "}
                      {orderDate(order.created_at)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums text-brand">
                      {totalIn({ usd: order.total_usd, khr: order.total_khr }, currency)}
                    </span>
                    {(order.discount_usd ?? 0) > 0 && (
                      <span className="block text-xs tabular-nums text-muted">
                        {totalIn(
                          { usd: order.discount_usd, khr: order.discount_khr },
                          currency,
                        )}{" "}
                        off
                      </span>
                    )}
                  </span>
                  <Icon name="chevron" className="size-4 shrink-0 text-muted" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
