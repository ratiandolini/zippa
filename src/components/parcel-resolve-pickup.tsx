"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import type { OrderDTO } from "@/lib/serialize";

// Phase 2 fix — დისპეჩერის მარტივი ქმედება დარჩენილ (PENDING/NOT_PICKED_UP)
// რაოდენობაზე: „ხელახლა მინიჭება“ ან „ჩამოწერა“ + მიზეზი. არასდროს ეხება
// უკვე PICKED_UP/DELIVERED ამანათს — endpoint-ი თავად უზრუნველყოფს ამას.
export function ParcelResolvePickup({ order, onChange }: { order: OrderDTO; onChange: () => void }) {
  const [action, setAction] = useState<"REASSIGN" | "WRITE_OFF" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canReassign = order.status === "PICKED_UP";

  async function submit() {
    if (!action) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/orders/${order.id}/parcels/resolve-pickup`, "PATCH", {
        action,
        reason: reason.trim(),
      });
      onChange();
      setAction(null);
      setReason("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  if (!action) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px]">
        <span className="text-amber-900">
          დარჩენილი {order.parcelSummary.notPickedUp} ამანათი — ვერ აიღეს
        </span>
        <div className="ml-auto flex gap-1.5">
          {canReassign && (
            <button
              type="button"
              className="rounded border border-accent px-2 py-0.5 font-medium text-accent"
              onClick={() => setAction("REASSIGN")}
            >
              ხელახლა მინიჭება
            </button>
          )}
          <button
            type="button"
            className="rounded border border-destructive px-2 py-0.5 font-medium text-destructive"
            onClick={() => setAction("WRITE_OFF")}
          >
            ჩამოწერა
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/40 p-2">
      <p className="text-[11px] font-medium">
        {action === "REASSIGN" ? "ხელახლა მინიჭება" : "ჩამოწერა"} — {order.parcelSummary.notPickedUp} ამანათი
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="მიზეზი (სავალდებულო)"
        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
        rows={2}
      />
      {err && <p className="mt-1 text-[11px] text-destructive">{err}</p>}
      <div className="mt-1.5 flex gap-1.5">
        <Button size="sm" disabled={busy || !reason.trim()} onClick={submit}>
          {busy ? "…" : "დადასტურება"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAction(null)}>
          გაუქმება
        </Button>
      </div>
    </div>
  );
}
