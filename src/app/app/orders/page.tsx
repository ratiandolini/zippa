"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { OrderRow } from "@/components/order-row";
import { CancelOrderButton } from "@/components/order-actions";
import { useOrders } from "@/lib/hooks";
import type { OrderDTO } from "@/lib/serialize";
import { Plus, RotateCcw } from "lucide-react";

export default function CustomerOrdersPage() {
  const { orders, isLoading, mutate } = useOrders("", 20000);
  const router = useRouter();

  function repeat(o: OrderDTO) {
    try {
      sessionStorage.setItem(
        "zippa_repeat_order",
        JSON.stringify({
          sender: o.sender,
          recipient: o.recipient,
          pickup: o.pickup,
          delivery: o.delivery,
          weightKg: o.weightKg,
          description: o.description,
          parcelValue: o.parcelValue,
        }),
      );
    } catch {
      /* ignore */
    }
    router.push("/app/new");
  }

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
              <div className="flex items-center gap-4 border-b border-border px-4 pb-3">
                {o.status === "PENDING" && (
                  <CancelOrderButton orderId={o.id} onDone={() => mutate()} />
                )}
                <button
                  onClick={() => repeat(o)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> გამეორება
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
