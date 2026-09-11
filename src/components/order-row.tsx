import Link from "next/link";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { GEL, streetOf } from "@/lib/domain";
import { MULTI_PARCEL_ORDERS_ENABLED } from "@/lib/flags";
import type { OrderDTO } from "@/lib/serialize";
import { ArrowRight } from "lucide-react";

export function OrderRow({
  order,
  href,
  showDriver,
}: {
  order: OrderDTO;
  href?: string;
  showDriver?: boolean;
}) {
  const body = (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{order.trackingNumber}</span>
          <OrderStatusBadge status={order.status} />
          {MULTI_PARCEL_ORDERS_ENABLED && order.parcelCount > 1 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {order.parcelCount} ამანათი
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5 truncate text-sm">
          <span className="truncate">{streetOf(order.pickup.address)}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{streetOf(order.delivery.address)}</span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {order.weightKg} კგ · {order.distanceKm} კმ
          {showDriver && order.driverName ? ` · ${order.driverName}` : ""}
        </div>
      </div>
      <div className="text-right">
        <div className="font-medium tabular-nums">{GEL(order.price.total)}</div>
        <div className="text-xs text-muted-foreground">
          ნაღდი
        </div>
      </div>
    </div>
  );

  return (
    <div className="border-b border-border last:border-0">
      {href ? (
        <Link href={href} className="block transition-colors hover:bg-muted/50">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}
