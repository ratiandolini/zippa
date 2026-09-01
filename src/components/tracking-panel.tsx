"use client";

import { LazyMap } from "@/components/map-lazy";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { OrderTimeline } from "@/components/order-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrackingDTO } from "@/lib/hooks";

export function TrackingPanel({ t }: { t: TrackingDTO }) {
  const points = [
    { lat: t.pickup.lat, lng: t.pickup.lng, kind: "pickup" as const },
    { lat: t.delivery.lat, lng: t.delivery.lng, kind: "delivery" as const },
    ...(t.driverLocation
      ? [{ lat: t.driverLocation.lat, lng: t.driverLocation.lng, kind: "driver" as const }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-sm text-muted-foreground">{t.trackingNumber}</div>
          <h1 className="text-xl font-semibold">შეკვეთის ადგილმდებარეობა</h1>
        </div>
        <OrderStatusBadge status={t.status} />
      </div>

      <LazyMap points={points} className="h-80 w-full" />

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>მარშრუტი</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">აღება</div>
              <div>{t.pickup.address}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">მიტანა</div>
              <div>{t.delivery.address}</div>
            </div>
            {t.driverName && (
              <div>
                <div className="text-xs text-muted-foreground">კურიერი</div>
                <div>{t.driverName}</div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>ისტორია</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderTimeline events={t.events} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
