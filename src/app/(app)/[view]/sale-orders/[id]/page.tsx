import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { createClient } from "@/lib/supabase/server";
import { quantityLine } from "@/lib/catalog";
import { primaryCurrency } from "@/lib/money.server";
import { totalIn } from "@/lib/money";
import {
  ORDER_DETAIL_COLUMNS,
  orderCustomerWhere,
  orderDate,
  orderedLines,
  orderLineDiscount,
  type SaleOrderDetail,
} from "@/lib/saleOrders";

/**
 * One order, as it was agreed.
 *
 * Everything here is the copy taken when the cart was confirmed — the names,
 * the codes, the prices. Nothing is read from the item, which is the point: the
 * catalogue has moved on and this has not.
 *
 * Not found and not allowed look the same on purpose. The policy decides which
 * orders exist for the person asking, and telling somebody an order exists but
 * is not theirs is telling them something about it.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ view: string; id: string }>;
}) {
  const { view, id } = await params;
  const supabase = await createClient();
  const currency = await primaryCurrency();

  const { data } = await supabase
    .from("sale_orders")
    .select(ORDER_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const order = data as unknown as SaleOrderDetail;
  const lines = orderedLines(order.lines ?? []);
  const where = orderCustomerWhere(order.customer);
  const freeTotal = lines.reduce((n, line) => n + line.free_quantity, 0);

  return (
    <div className="space-y-4">
      <Link
        href={`/${view}/sale-orders`}
        className="pressable inline-flex min-h-9 items-center gap-1 text-sm text-muted"
      >
        <Icon name="chevron" className="size-4 rotate-180" />
        All orders
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tabular-nums tracking-tight">
            {order.order_no}
          </h1>
          <p className="text-sm text-muted">
            {orderDate(order.created_at)}
            {order.seller?.full_name && ` · ${order.seller.full_name}`}
          </p>
        </div>
        {order.status === "cancelled" && <Chip tone="danger">Cancelled</Chip>}
      </div>

      <Card className="p-4">
        <p className="text-xs text-muted">Customer</p>
        <p className="text-base font-medium">
          {order.customer?.shop_name ?? "Customer removed"}
        </p>
        {where && <p className="text-sm text-muted">{where}</p>}
      </Card>

      <Card className="divide-y divide-line">
        {lines.map((line) => {
          const discount = orderLineDiscount(line);
          return (
            <div key={line.id} className="space-y-1 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{line.item_name}</span>
                  {line.item_code && (
                    <span className="block text-xs tabular-nums text-muted">
                      {line.item_code}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {totalIn({ usd: line.line_total_usd, khr: line.line_total_khr }, currency)}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
                <span className="tabular-nums">
                  {quantityLine(line.quantity, line.free_quantity)}
                  {" × "}
                  {totalIn(
                    { usd: line.unit_price_usd, khr: line.unit_price_khr },
                    currency,
                  )}
                </span>
                {discount && <span className="shrink-0">{discount}</span>}
              </div>
            </div>
          );
        })}
      </Card>

      <Card className="space-y-1 p-4">
        {(order.discount_usd ?? 0) > 0 || (order.discount_khr ?? 0) > 0 ? (
          <div className="flex items-baseline justify-between gap-3 text-sm text-muted">
            <span>Discount</span>
            <span className="tabular-nums">
              {totalIn({ usd: order.discount_usd, khr: order.discount_khr }, currency)}
            </span>
          </div>
        ) : null}
        {freeTotal > 0 && (
          <div className="flex items-baseline justify-between gap-3 text-sm text-muted">
            <span>Given free</span>
            <span className="tabular-nums">{freeTotal}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3 pt-1">
          <span className="text-sm text-muted">Total</span>
          <span className="text-2xl font-semibold tabular-nums">
            {totalIn({ usd: order.total_usd, khr: order.total_khr }, currency)}
          </span>
        </div>
      </Card>

      {order.note && (
        <Card className="p-4">
          <p className="text-xs text-muted">Note</p>
          <p className="whitespace-pre-wrap text-sm">{order.note}</p>
        </Card>
      )}
    </div>
  );
}
