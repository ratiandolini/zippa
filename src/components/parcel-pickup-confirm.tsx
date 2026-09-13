"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import type { OrderDTO } from "@/lib/serialize";

// Phase 2 — მრავალამანათიანი შეკვეთის აღების რაოდენობრივი დადასტურება.
// "სულ: N" / "ავიღე: [რიცხვი]" — თუ ნაკლებია, მიზეზი სავალდებულოა.
// დანარჩენი (NOT_PICKED_UP) დარჩება ხელახლა-საცდელად, არ უქმდება ავტომატურად.
export function ParcelPickupConfirm({ order, onChange }: { order: OrderDTO; onChange: () => void }) {
  const remaining = order.parcels.filter(
    (p) => p.status === "PENDING" || p.status === "NOT_PICKED_UP",
  ).length;
  const [count, setCount] = useState(remaining);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const shortfall = count < remaining;

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
      await api(`/api/orders/${order.id}/parcels/pickup`, "PATCH", {
        pickedUpCount: count,
        reason: shortfall ? reason.trim() : undefined,
        ...coords,
      });
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">სულ ამანათი</span>
        <span className="font-semibold tabular-nums">{order.parcelCount}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">დარჩენილი ასაღები</span>
        <span className="font-semibold tabular-nums">{remaining}</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">ავიღე:</label>
        <input
          type="number"
          min={0}
          max={remaining}
          value={count}
          onChange={(e) =>
            setCount(Math.max(0, Math.min(remaining, parseInt(e.target.value, 10) || 0)))
          }
          className="h-10 w-24 rounded-lg border border-border bg-background px-2 text-center tabular-nums outline-none focus:border-accent"
        />
        <span className="text-xs text-muted-foreground">/ {remaining}</span>
      </div>
      {shortfall && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            რატომ ვერ აიღე დანარჩენი {remaining - count}?
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="მაგ. მისამართზე არავინ დამხვდა"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            rows={2}
          />
        </div>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button
        size="lg"
        className="h-11 w-full"
        disabled={busy || (shortfall && !reason.trim())}
        onClick={submit}
      >
        {busy ? "…" : "დადასტურება"}
      </Button>
    </div>
  );
}
