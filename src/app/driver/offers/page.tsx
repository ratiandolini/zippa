"use client";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { DriverOrderCard } from "@/components/driver-order-card";
import { useOrders } from "@/lib/hooks";

export default function OffersPage() {
  const { orders, isLoading, mutate } = useOrders("?status=ASSIGNED", 8000);

  return (
    <>
      <PageHeader title="შემოთავაზებები" description="მოგინიჭა დისპეჩერმა — დაადასტურე მიღება" />
      {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}
      {!isLoading && orders.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            ახალი შემოთავაზება არ არის.
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {orders.map((o) => (
          <DriverOrderCard key={o.id} order={o} onChange={mutate} />
        ))}
      </div>
    </>
  );
}
