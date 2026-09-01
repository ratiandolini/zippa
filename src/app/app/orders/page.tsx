"use client";

import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { OrderRow } from "@/components/order-row";
import { CancelOrderButton } from "@/components/order-actions";
import { useOrders } from "@/lib/hooks";
import { Plus } from "lucide-react";

export default function CustomerOrdersPage() {
  const { orders, isLoading, mutate } = useOrders("", 20000);

  return (
    <>
      <PageHeader
        title="ჩემი შეკვეთები"
        action={
          <Link href="/app/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="h-4 w-4" /> ახალი
          </Link>
        }
      />
      {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}
      {!isLoading && orders.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            ჯერ არ გაქვს შეკვეთა.
          </CardContent>
        </Card>
      )}
      {orders.length > 0 && (
        <Card>
          {orders.map((o) => (
            <div key={o.id}>
              <OrderRow order={o} href={`/app/track?id=${o.id}`} showDriver />
              {o.status === "PENDING" && (
                <div className="border-b border-border px-4 pb-3">
                  <CancelOrderButton orderId={o.id} onDone={() => mutate()} />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
