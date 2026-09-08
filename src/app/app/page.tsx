"use client";

import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { OrderRow } from "@/components/order-row";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { useOrders, useMyCod } from "@/lib/hooks";
import { GEL, streetOf, ACTIVE_ORDER_STATUSES as ACTIVE } from "@/lib/domain";
import { Plus, MapPin, Wallet } from "lucide-react";

export default function CustomerHome() {
  const { orders, isLoading } = useOrders("", 15000);
  const { cod } = useMyCod();
  const active = [...orders]
    .filter((o) => ACTIVE.includes(o.status))
    .sort((a, b) => ACTIVE.indexOf(b.status) - ACTIVE.indexOf(a.status))[0];
  const recent = orders.slice(0, 5);
  const monthSpend = orders
    .filter((o) => o.status === "DELIVERED")
    .reduce((s, o) => s + o.price.total, 0);

  return (
    <>
      <PageHeader
        title="მთავარი"
        description="შენი შეკვეთების მიმოხილვა"
        action={
          <Link href="/app/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="h-4 w-4" /> ახალი შეკვეთა
          </Link>
        }
      />

      {cod && cod.outstandingNet > 0 && (
        <Card className="mb-6 border-accent/30 bg-accent/[0.04]">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-accent" />
              <span className="font-medium">მისაღები COD: {GEL(cod.outstandingNet)}</span>
              <span className="text-sm text-muted-foreground">
                {cod.outstandingCount} ჩაბარებული შეკვეთა · გადმოგერიცხებათ
              </span>
            </div>
            <Link href="/app/cod" className={buttonVariants({ variant: "outline", size: "sm" })}>
              დეტალები
            </Link>
          </CardContent>
        </Card>
      )}

      {active && (
        <Card className="mb-6 border-accent/30 bg-accent/[0.04]">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-accent" />
                <span className="font-medium">აქტიური მიტანა</span>
                <OrderStatusBadge status={active.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {streetOf(active.pickup.address)} → {streetOf(active.delivery.address)}
                {active.driverName ? ` · ${active.driverName}` : ""}
              </p>
            </div>
            <Link
              href={`/app/track?id=${active.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              რუკაზე ნახვა
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>ბოლო შეკვეთები</CardTitle>
            <Link href="/app/orders" className="text-sm text-accent hover:underline">
              ყველა
            </Link>
          </CardHeader>
          {isLoading && (
            <CardContent className="text-sm text-muted-foreground">იტვირთება…</CardContent>
          )}
          {!isLoading && recent.length === 0 && (
            <CardContent className="text-sm text-muted-foreground">
              ჯერ არ გაქვს შეკვეთა.{" "}
              <Link href="/app/new" className="text-accent hover:underline">
                შექმენი პირველი
              </Link>
            </CardContent>
          )}
          <div>
            {recent.map((o) => (
              <OrderRow key={o.id} order={o} href={`/app/track?id=${o.id}`} showDriver />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>სულ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Line label="შეკვეთები" value={String(orders.length)} />
            <Line label="ჩაბარებული" value={String(orders.filter((o) => o.status === "DELIVERED").length)} />
            <Line label="დახარჯული" value={GEL(monthSpend)} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
