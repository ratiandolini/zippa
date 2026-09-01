"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { DRIVER_NEXT_STATUS, ORDER_STATUS_LABEL, GEL } from "@/lib/domain";
import { api } from "@/lib/fetcher";
import type { OrderDTO } from "@/lib/serialize";
import type { OrderStatus } from "@prisma/client";
import { ArrowRight, Phone } from "lucide-react";

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "შეკვეთის მიღება",
  PICKED_UP: "ამანათი ავიღე",
  IN_TRANSIT: "გზაში ვარ",
  DELIVERED: "ჩავაბარე",
  FAILED: "ვერ ჩავაბარე",
};

export function DriverOrderCard({ order, onChange }: { order: OrderDTO; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const next = DRIVER_NEXT_STATUS[order.status] ?? [];

  async function move(status: OrderStatus) {
    setBusy(status);
    setErr(null);
    try {
      let coords: { lat?: number; lng?: number } = {};
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        coords = await new Promise((resolve) =>
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve({}),
            { timeout: 4000 },
          ),
        );
      }
      await api(`/api/orders/${order.id}/status`, "PATCH", { status, ...coords });
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{order.trackingNumber}</span>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-2 space-y-1 text-sm">
        <div className="flex items-start gap-2">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          <span>{order.pickup.address}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
          <span>{order.delivery.address}</span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>მიმღები: {order.recipient.name}</span>
        <a href={`tel:${order.recipient.phone}`} className="inline-flex items-center gap-1 text-accent">
          <Phone className="h-3 w-3" /> {order.recipient.phone}
        </a>
        <span>{order.weightKg} კგ</span>
        <span>
          {order.paymentMethod === "CASH"
            ? `ნაღდად ${GEL(order.codAmount)}`
            : "გადახდილია"}
        </span>
      </div>

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

      {next.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {next.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === "FAILED" ? "outline" : "default"}
              disabled={busy != null}
              onClick={() => move(s)}
            >
              {busy === s ? "…" : NEXT_LABEL[s] ?? ORDER_STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
