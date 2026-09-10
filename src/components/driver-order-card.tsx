"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/order-status-badge";
import {
  DRIVER_NEXT_STATUS,
  ORDER_STATUS_LABEL,
  GEL,
  fmtDate,
  fmtDateTime,
  FAILURE_REASON_LABEL,
} from "@/lib/domain";
import { Clock, Navigation, Phone } from "lucide-react";
import { api } from "@/lib/fetcher";
import { ProofPhoto } from "@/components/proof-photo";
import type { OrderDTO } from "@/lib/serialize";
import type { OrderStatus, OrderFailureReason } from "@prisma/client";

function AddressRow({
  color,
  address,
  lat,
  lng,
}: {
  color: string;
  address: string;
  lat: number | null;
  lng: number | null;
}) {
  const nav =
    lat != null && lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${color}`} />
      <div className="min-w-0 flex-1">
        <span>{address}</span>
        <a
          href={nav}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-medium text-accent"
        >
          <Navigation className="h-3 w-3" /> ნავიგაცია
        </a>
      </div>
    </div>
  );
}

const FAILURE_REASONS = Object.keys(FAILURE_REASON_LABEL) as OrderFailureReason[];

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "შეკვეთის მიღება",
  EN_ROUTE_PICKUP: "მივდივარ ასაღებად",
  PICKED_UP: "ამანათი ავიღე",
  IN_TRANSIT: "გზაში ვარ",
  DELIVERED: "ჩავაბარე",
  FAILED: "ვერ ჩავაბარე",
};

const PROOF_HINT: Record<string, string> = {
  PHOTO: "ჩასაბარებლად ატვირთე მიტანის ფოტო.",
  PIN: "ჩასაბარებლად შეიყვანე მიმღების 4-ნიშნა კოდი.",
};

export function DriverOrderCard({ order, onChange }: { order: OrderDTO; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [failPick, setFailPick] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [pin, setPin] = useState("");
  const next = DRIVER_NEXT_STATUS[order.status] ?? [];

  const acceptedAt = [...order.events].reverse().find((e) => e.status === "ACCEPTED")?.createdAt;
  const pickedUpAt = [...order.events].reverse().find((e) => e.status === "PICKED_UP")?.createdAt;

  // ჩაბარების ღილაკამდე რა უნდა შესრულდეს (deliveryProof-ის მიხედვით)
  const deliverBlocked =
    next.includes("DELIVERED" as OrderStatus) &&
    ((order.deliveryProof === "PHOTO" && !order.proofPhotoUrl) ||
      (order.deliveryProof === "PIN" && pin.replace(/\D/g, "").length !== 4));

  async function reject() {
    setBusy("REJECT");
    setErr(null);
    try {
      await api(`/api/orders/${order.id}/reject`, "POST", {});
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
      setConfirmReject(false);
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
      const pinArg =
        status === "DELIVERED" && order.deliveryProof === "PIN" ? { pin } : {};
      await api(`/api/orders/${order.id}/status`, "PATCH", { status, failureReason, ...pinArg, ...coords });
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

      {order.estimatedDeliveryAt && order.status !== "DELIVERED" && order.status !== "FAILED" && (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
          <Clock className="h-3 w-3" /> ჩაბარების ვადა: {fmtDate(order.estimatedDeliveryAt)}
        </div>
      )}

      <div className="mt-2 space-y-1.5 text-sm">
        <AddressRow
          color="bg-blue-500"
          address={order.pickup.address}
          lat={order.pickup.lat}
          lng={order.pickup.lng}
        />
        <AddressRow
          color="bg-accent"
          address={order.delivery.address}
          lat={order.delivery.lat}
          lng={order.delivery.lng}
        />
      </div>

      {order.delivery.note && (
        <div className="mt-1.5 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs text-blue-900">
          <span className="font-medium">შენიშვნა:</span> {order.delivery.note}
        </div>
      )}

      {/* საკონტაქტო პირი — ეტაპის მიხედვით: აღებამდე გამგზავნი, აღების შემდეგ მიმღები */}
      {(() => {
        const beforePickup = ["ASSIGNED", "ACCEPTED", "EN_ROUTE_PICKUP"].includes(order.status);
        const person = beforePickup ? order.sender : order.recipient;
        const label = beforePickup ? "გამგზავნი" : "მიმღები";
        return (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {label}: {person.name}
            </span>
            <a
              href={`tel:${person.phone}`}
              className="inline-flex items-center gap-1 text-accent"
            >
              <Phone className="h-3 w-3" /> {person.phone}
            </a>
            <span>{order.weightKg} კგ</span>
          </div>
        );
      })()}

      {order.price.driverFee > 0 && (
        <div className="mt-2 flex items-center justify-between rounded-md bg-accent/10 px-2.5 py-1.5 text-sm">
          <span className="font-medium text-accent">
            {order.status === "ASSIGNED" ? "მიღების შემთხვევაში მიიღებ" : "შენ ერიცხება"}
          </span>
          <span className="font-semibold tabular-nums text-accent">{GEL(order.price.driverFee)}</span>
        </div>
      )}

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

      {["PICKED_UP", "IN_TRANSIT"].includes(order.status) && order.deliveryProof === "PHOTO" && (
        <div className="mt-3">
          <ProofPhoto order={order} canUpload onChange={onChange} />
        </div>
      )}
      {order.status === "DELIVERED" && order.proofPhotoUrl && (
        <div className="mt-3">
          <ProofPhoto order={order} />
        </div>
      )}

      {/* ჩაბარების დადასტურება — PIN */}
      {["PICKED_UP", "IN_TRANSIT"].includes(order.status) && order.deliveryProof === "PIN" && (
        <div className="mt-3">
          <label className="text-xs font-medium text-muted-foreground">
            მიმღების კოდი (გკითხე მიმღებს)
          </label>
          <input
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="1234"
            className="mt-1 h-12 w-full rounded-lg border border-border bg-background px-3 text-center text-xl tracking-[0.4em] tabular-nums outline-none focus:border-accent"
          />
        </div>
      )}
      {["PICKED_UP", "IN_TRANSIT"].includes(order.status) &&
        deliverBlocked &&
        PROOF_HINT[order.deliveryProof] && (
          <p className="mt-2 text-xs text-amber-700">{PROOF_HINT[order.deliveryProof]}</p>
        )}

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

      {next.length > 0 && !failPick && !confirmReject && (
        <div className="mt-3 space-y-2">
          {next
            .filter((s) => s !== "FAILED")
            .map((s) => (
              <Button
                key={s}
                size="lg"
                className="h-12 w-full text-base"
                disabled={busy != null || (s === "DELIVERED" && deliverBlocked)}
                onClick={() => move(s)}
              >
                {busy === s ? "…" : NEXT_LABEL[s] ?? ORDER_STATUS_LABEL[s]}
              </Button>
            ))}
          {next.includes("FAILED" as OrderStatus) && (
            <Button
              size="lg"
              variant="outline"
              className="h-11 w-full"
              disabled={busy != null}
              onClick={() => setFailPick(true)}
            >
              {NEXT_LABEL.FAILED}
            </Button>
          )}
          {order.status === "ASSIGNED" && (
            <Button
              size="lg"
              variant="ghost"
              className="h-11 w-full text-muted-foreground"
              disabled={busy != null}
              onClick={() => setConfirmReject(true)}
            >
              უარი შეკვეთაზე
            </Button>
          )}
        </div>
      )}

      {confirmReject && (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="mb-2 text-sm">უარს ამბობ ამ შეკვეთაზე? დაუბრუნდება დისპეჩერს.</p>
          <div className="flex gap-2">
            <Button
              size="lg"
              variant="destructive"
              className="h-11 flex-1"
              disabled={busy != null}
              onClick={reject}
            >
              {busy === "REJECT" ? "…" : "დიახ, უარი"}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-11 flex-1"
              onClick={() => setConfirmReject(false)}
            >
              დავტოვო
            </Button>
          </div>
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
