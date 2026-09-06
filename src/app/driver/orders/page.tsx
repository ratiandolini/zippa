"use client";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { DriverOrderCard } from "@/components/driver-order-card";
import { OrderRow } from "@/components/order-row";
import { useOrders } from "@/lib/hooks";
import { ACTIVE_ORDER_STATUSES as ACTIVE } from "@/lib/domain";

export default function DriverOrdersPage() {
  const { orders, isLoading, mutate } = useOrders("", 12000);
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const past = orders.filter((o) => !ACTIVE.includes(o.status));

  return (
    <>
      <PageHeader title="ჩემი შეკვეთები" />
      {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}

      {active.length > 0 && (
        <div className="mb-6 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">მიმდინარე</h2>
          {active.map((o) => (
            <DriverOrderCard key={o.id} order={o} onChange={mutate} />
          ))}
        </div>
      )}

      <h2 className="mb-2 text-sm font-medium text-muted-foreground">ისტორია</h2>
      {past.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            ჯერ არ გაქვს დასრულებული შეკვეთა.
          </CardContent>
        </Card>
      ) : (
        <Card>
          {past.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </Card>
      )}
    </>
  );
}
