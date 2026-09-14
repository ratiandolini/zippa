"use client";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { DriverOrderCard } from "@/components/driver-order-card";
import { OrderRow } from "@/components/order-row";
import { useOrders } from "@/lib/hooks";
import { ACTIVE_ORDER_STATUSES as ACTIVE } from "@/lib/domain";

// QA fix — PARTIALLY_COMPLETED მრავალამანათიანი შეკვეთა, რომელსაც ჯერ კიდევ
// აქვს დასაბრუნებელი (awaitingReturn > 0) ამანათი, აქტიურ სიაში რჩება — თორემ
// კურიერს დაბრუნების დადასტურების/ფოტოს ატვირთვის ფორმაზე წვდომა ეკარგება
// (ეს ფორმა მხოლოდ DriverOrderCard-ზეა, არა ისტორიის უბრალო OrderRow-ზე).
function needsDriverAttention(o: { status: string; parcelSummary?: { awaitingReturn: number } }) {
  if (ACTIVE.includes(o.status as never)) return true;
  return o.status === "PARTIALLY_COMPLETED" && (o.parcelSummary?.awaitingReturn ?? 0) > 0;
}

export default function DriverOrdersPage() {
  const { orders, isLoading, mutate } = useOrders("", 12000);
  const active = orders.filter(needsDriverAttention);
  const past = orders.filter((o) => !needsDriverAttention(o));

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
