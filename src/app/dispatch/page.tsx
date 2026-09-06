"use client";

import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/stat";
import { OrderRow } from "@/components/order-row";
import { useOrders, useDrivers } from "@/lib/hooks";
import { GEL, DRIVER_STATUS_LABEL, ACTIVE_ORDER_STATUSES } from "@/lib/domain";
import { Package, Clock, Wallet, Users } from "lucide-react";

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.toDateString() === n.toDateString();
}

export default function DispatchHome() {
  const { orders } = useOrders("", 12000);
  const { drivers } = useDrivers("", 15000);

  const pending = orders.filter((o) => o.status === "PENDING");
  const activeCount = orders.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status)).length;
  const doneToday = orders.filter((o) => o.status === "DELIVERED" && o.deliveredAt && isToday(o.deliveredAt));
  const revenueToday = doneToday.reduce((s, o) => s + o.price.total, 0);
  const online = drivers.filter((d) => d.status !== "OFFLINE");
  const available = drivers.filter((d) => d.status === "AVAILABLE");

  return (
    <>
      <PageHeader title="მიმოხილვა" description="დღევანდელი ოპერაცია ერთ ეკრანზე" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="აქტიური შეკვეთა" value={String(activeCount)} icon={<Package className="h-4 w-4" />} />
        <Stat label="მოლოდინში" value={String(pending.length)} sub="საჭიროებს მინიჭებას" icon={<Clock className="h-4 w-4" />} />
        <Stat label="დღის შემოსავალი" value={GEL(revenueToday)} sub={`${doneToday.length} ჩაბარება`} icon={<Wallet className="h-4 w-4" />} />
        <Stat label="ხაზზე კურიერი" value={String(online.length)} sub={`${available.length} თავისუფალი`} icon={<Users className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>მინიჭების მოლოდინში ({pending.length})</CardTitle>
            <Link href="/dispatch/orders" className="text-sm text-accent hover:underline">
              დაფა
            </Link>
          </CardHeader>
          {pending.length === 0 ? (
            <CardContent className="text-sm text-muted-foreground">ყველა შეკვეთა განაწილებულია 👍</CardContent>
          ) : (
            <div>
              {pending.slice(0, 6).map((o) => (
                <OrderRow key={o.id} order={o} href="/dispatch/orders" />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>თავისუფალი კურიერები ({available.length})</CardTitle>
            <Link href="/dispatch/drivers" className="text-sm text-accent hover:underline">
              ყველა
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {available.length === 0 && (
              <p className="text-sm text-muted-foreground">ამჟამად თავისუფალი კურიერი არ არის.</p>
            )}
            {available.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.city ?? "—"} · ★ {d.rating.toFixed(1)} · {d.totalDeliveries} მიტანა
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{DRIVER_STATUS_LABEL[d.status]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
