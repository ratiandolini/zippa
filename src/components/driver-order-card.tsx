"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/order-status-badge";
import {
  DRIVER_NEXT_STATUS,
  ORDER_STATUS_LABEL,
  GEL,
  fmtDateTime,
  FAILURE_REASON_LABEL,
} from "@/lib/domain";
import { api } from "@/lib/fetcher";
import { ProofPhoto } from "@/components/proof-photo";
import type { OrderDTO } from "@/lib/serialize";
import type { OrderStatus, OrderFailureReason } from "@prisma/client";
import { Phone } from "lucide-react";

const FAILURE_REASONS = Object.keys(FAILURE_REASON_LABEL) as OrderFailureReason[];

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "შეკვეთის მიღება",
  EN_ROUTE_PICKUP: "მივდივარ ასაღებად",
  PICKED_UP: "ამანათი ავიღე",
  IN_TRANSIT: "გზაში ვარ",
  DELIVERED: "ჩავაბარე",
  FAILED: "ვერ ჩავაბარე",
};

export function DriverOrderCard({ order, onChange }: { order: OrderDTO; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [failPick, setFailPick] = useState(false);
  const next = DRIVER_NEXT_STATUS[order.status] ?? [];

  const acceptedAt = [...order.events].reverse().find((e) => e.status === "ACCEPTED")?.createdAt;
  const pickedUpAt = [...order.events].reverse().find((e) => e.status === "PICKED_UP")?.createdAt;

  async function reject() {
    if (!confirm("დარწმუნებული ხარ, რომ უარს ამბობ ამ შეკვეთაზე?")) return;
    setBusy("REJECT");
    setErr(null);
    try {
      await api(`/api/orders/${order.id}/reject`, "POST", {});
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
    }
  }

  async function move(status: OrderStatus, failureReason?: OrderFailureReason) {
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
      await api(`/api/orders/${order.id}/status`, "PATCH", { status, failureReason, ...coords });
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
      setFailPick(false);
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
      </div>

      {order.codAmount > 0 ? (
        <div className="mt-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px]">
          {order.payerSide === "SENDER" && order.price.total > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">აღებისას გამგზავნისგან</span>
              <span className="font-medium tabular-nums">{GEL(order.price.total)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">ჩაბარებისას მიმღებისგან</span>
            <span className="font-medium tabular-nums">
              {GEL(
                order.payerSide === "SENDER"
                  ? order.codAmount - order.price.total
                  : order.codAmount,
              )}
            </span>
          </div>
          {order.collectAmount > 0 && (
            <div className="mt-0.5 text-accent">მათ შორის ნივთის ღირებულება {GEL(order.collectAmount)}</div>
          )}
        </div>
      ) : (
        <div className="mt-1.5 text-[11px] text-muted-foreground">გადახდილია</div>
      )}

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {order.assignedAt && <span>მოგენიჭა: {fmtDateTime(order.assignedAt)}</span>}
        {acceptedAt && <span>დაადასტურე: {fmtDateTime(acceptedAt)}</span>}
        {pickedUpAt && <span>აიღე: {fmtDateTime(pickedUpAt)}</span>}
      </div>

      {["PICKED_UP", "IN_TRANSIT", "DELIVERED"].includes(order.status) && (
        <div className="mt-3">
          <ProofPhoto order={order} canUpload onChange={onChange} />
        </div>
      )}

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

      {next.length > 0 && !failPick && (
        <div className="mt-3 flex flex-wrap gap-2">
          {next.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === "FAILED" ? "outline" : "default"}
              disabled={busy != null}
              onClick={() => (s === "FAILED" ? setFailPick(true) : move(s))}
            >
              {busy === s ? "…" : NEXT_LABEL[s] ?? ORDER_STATUS_LABEL[s]}
            </Button>
          ))}
          {order.status === "ASSIGNED" && (
            <Button size="sm" variant="ghost" disabled={busy != null} onClick={reject}>
              {busy === "REJECT" ? "…" : "უარი"}
            </Button>
          )}
        </div>
      )}

      {failPick && (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-medium">რატომ ჩაიშალა მიტანა?</p>
          <div className="flex flex-col gap-1.5">
            {FAILURE_REASONS.map((r) => (
              <Button
                key={r}
                size="sm"
                variant="outline"
                className="justify-start"
                disabled={busy != null}
                onClick={() => move("FAILED", r)}
              >
                {busy === "FAILED" ? "…" : FAILURE_REASON_LABEL[r]}
              </Button>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 text-xs text-muted-foreground hover:underline"
            onClick={() => setFailPick(false)}
          >
            გაუქმება
          </button>
        </div>
      )}
    </div>
  );
}
