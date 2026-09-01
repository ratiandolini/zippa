"use client";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LazyMap } from "@/components/map-lazy";
import { useDrivers, useOrders } from "@/lib/hooks";
import { ORDER_STATUS_LABEL, streetOf } from "@/lib/domain";
import type { MapPoint } from "@/components/map";

const ACTIVE = ["ASSIGNED", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"];

export default function DispatchMapPage() {
  const { drivers } = useDrivers("", 10000);
  const { orders } = useOrders("", 10000);

  const active = orders.filter((o) => ACTIVE.includes(o.status));

  const points: MapPoint[] = [
    ...drivers
      .filter((d) => d.location)
      .map((d) => ({
        lat: d.location!.lat,
        lng: d.location!.lng,
        kind: "driver" as const,
        label: `${d.name} · ${d.status === "BUSY" ? "დაკავებული" : "თავისუფალი"}`,
      })),
    ...active.flatMap((o) => [
      {
        lat: o.pickup.lat,
        lng: o.pickup.lng,
        kind: "pickup" as const,
        label: `${o.trackingNumber} · აღება · ${streetOf(o.pickup.address)}`,
      },
      {
        lat: o.delivery.lat,
        lng: o.delivery.lng,
        kind: "delivery" as const,
        label: `${o.trackingNumber} · მიტანა · ${ORDER_STATUS_LABEL[o.status]}`,
      },
    ]),
  ];

  return (
    <>
      <PageHeader
        title="რუკა"
        description={`${drivers.filter((d) => d.location).length} კურიერი · ${active.length} აქტიური შეკვეთა`}
      />
      <LazyMap points={points} className="h-[70vh] w-full" />
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <Legend color="#f59e0b" label="კურიერი" />
        <Legend color="#2563eb" label="აღების წერტილი" />
        <Legend color="#178f68" label="მიტანის წერტილი" />
      </div>
      {points.length === 0 && (
        <Card className="mt-4">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            ამჟამად ცოცხალი მონაცემი არ არის — არცერთი კურიერი არ არის ხაზზე ლოკაციით.
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
