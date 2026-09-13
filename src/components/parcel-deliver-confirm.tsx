"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { DELIVERY_SHORTFALL_REASONS, FAILURE_REASON_LABEL } from "@/lib/domain";
import type { OrderDTO } from "@/lib/serialize";
import type { OrderFailureReason } from "@prisma/client";

// Phase 2 — მრავალამანათიანი შეკვეთის ჩაბარების რაოდენობრივი დადასტურება.
// "წასაღები: N" / "ჩაბარებული: [რიცხვი]" — თუ ნაკლებია, მიზეზი სავალდებულოა
// (მიმღებმა უარი თქვა / ვერ დაუკავშირდნენ / დაბრუნება / სხვა). ერთჯერადი,
// საბოლოო ნაბიჯია — ამის შემდეგ Order.status DELIVERED/FAILED-ზე გადადის.
export function ParcelDeliverConfirm({
  order,
  onChange,
  deliverBlocked,
  pin,
}: {
  order: OrderDTO;
  onChange: () => void;
  deliverBlocked: boolean;
  pin: string;
}) {
  const eligible = order.parcels.filter((p) => p.status === "PICKED_UP").length;
  const [count, setCount] = useState(eligible);
  const [reason, setReason] = useState<OrderFailureReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const shortfall = count < eligible;

  async function submit() {
    setBusy(true);
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
      await api(`/api/orders/${order.id}/parcels/deliver`, "PATCH", {
        deliveredCount: count,
        reason: shortfall ? reason : undefined,
        note: shortfall ? note.trim() || undefined : undefined,
        ...(order.deliveryProof === "PIN" ? { pin } : {}),
        ...coords,
      });
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  const blocked = count > 0 && deliverBlocked;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">წასაღები (თან წაღებული)</span>
        <span className="font-semibold tabular-nums">{eligible}</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">ჩაბარებული:</label>
        <input
          type="number"
          min={0}
          max={eligible}
          value={count}
          onChange={(e) =>
            setCount(Math.max(0, Math.min(eligible, parseInt(e.target.value, 10) || 0)))
          }
          className="h-10 w-24 rounded-lg border border-border bg-background px-2 text-center tabular-nums outline-none focus:border-accent"
        />
        <span className="text-xs text-muted-foreground">/ {eligible}</span>
      </div>
      {shortfall && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            რატომ ვერ ჩააბარე დანარჩენი {eligible - count}?
          </label>
          <div className="flex flex-col gap-1.5">
            {DELIVERY_SHORTFALL_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  reason === r
                    ? "border-accent bg-accent/10 font-medium"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {FAILURE_REASON_LABEL[r]}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="დამატებითი შენიშვნა (არასავალდებულო)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            rows={2}
          />
        </div>
      )}
      {blocked && (
        <p className="text-xs text-amber-700">
          {order.deliveryProof === "PHOTO" ? "ჩასაბარებლად ატვირთე მიტანის ფოტო." : "ჩასაბარებლად შეიყვანე მიმღების კოდი."}
        </p>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button
        size="lg"
        className="h-11 w-full"
        disabled={busy || blocked || (shortfall && !reason)}
        onClick={submit}
      >
        {busy ? "…" : "დადასტურება"}
      </Button>
    </div>
  );
}
