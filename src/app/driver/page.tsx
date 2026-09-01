"use client";

import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/stat";
import { DriverOrderCard } from "@/components/driver-order-card";
import { useDriverMe, useOrders } from "@/lib/hooks";
import { api } from "@/lib/fetcher";
import { GEL } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Wallet, Package, Banknote } from "lucide-react";

const ACTIVE = ["ASSIGNED", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"];

export default function DriverHome() {
  const { driver, mutate: mutateDriver } = useDriverMe(15000);
  const { orders, mutate: mutateOrders } = useOrders("", 10000);
  const [toggling, setToggling] = useState(false);

  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const deliveredToday = orders.filter(
    (o) => o.status === "DELIVERED" && o.deliveredAt && new Date(o.deliveredAt).toDateString() === new Date().toDateString(),
  );
  const online = driver?.status !== "OFFLINE";

  async function toggleOnline() {
    if (!driver || driver.status === "BUSY") return;
    setToggling(true);
    const nextStatus = online ? "OFFLINE" : "AVAILABLE";
    try {
      let coords: { lat?: number; lng?: number } = {};
      if (nextStatus === "AVAILABLE" && navigator.geolocation) {
        coords = await new Promise((resolve) =>
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve({}),
            { timeout: 4000 },
          ),
        );
      }
      await api("/api/driver/me", "PATCH", { status: nextStatus, ...coords });
      mutateDriver();
    } finally {
      setToggling(false);
    }
  }

  if (driver && !driver.isApproved) {
    return (
      <>
        <PageHeader title="დღეს" />
        <Card>
          <CardContent className="p-10 text-center">
            <p className="font-medium">ანგარიში განიხილება</p>
            <p className="mt-1 text-sm text-muted-foreground">
              დისპეჩერი დაგიმტკიცებს პროფილს — ამის შემდეგ შეძლებ შეკვეთების მიღებას.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="დღეს"
        description="მიმდინარე შეკვეთები და შემოსავალი"
        action={
          <button
            onClick={toggleOnline}
            disabled={toggling || driver?.status === "BUSY"}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
              online ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", online ? "bg-accent" : "bg-muted-foreground")} />
            {driver?.status === "BUSY" ? "დაკავებული" : online ? "ხაზზე" : "ხაზგარეშე"}
          </button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="დღეს ჩაბარებული" value={String(deliveredToday.length)} icon={<Package className="h-4 w-4" />} />
        <Stat label="გადასახდელი ანაზღაურება" value={GEL(driver?.unpaidEarnings ?? 0)} icon={<Wallet className="h-4 w-4" />} />
        <Stat label="ნაღდი ხელზე" value={GEL(driver?.cashOnHand ?? 0)} sub="კომპანიას ჩასაბარებელი" icon={<Banknote className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>მიმდინარე შეკვეთები ({active.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {active.length === 0 && (
            <p className="text-sm text-muted-foreground">
              აქტიური შეკვეთა არ გაქვს. {online ? "დაელოდე ახალ მინიჭებას." : "ჩაირთე ხაზზე შეკვეთების მისაღებად."}
            </p>
          )}
          {active.map((o) => (
            <DriverOrderCard key={o.id} order={o} onChange={() => { mutateOrders(); mutateDriver(); }} />
          ))}
        </CardContent>
      </Card>
    </>
  );
}
