"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import type { OrderDTO } from "@/lib/serialize";

// Phase 2 fix — RETURN_REQUESTED ამანათების ფაქტობრივი დაბრუნების დადასტურება.
// მხოლოდ ამის შემდეგ ითვლება დაბრუნება დასრულებულად და ერიცხება დაბრუნების
// საფასური. ხელმისაწვდომია დისპეჩერისთვისაც (თუ ამანათი ოფისში დაბრუნდა).
export function ParcelReturnConfirm({ order, onChange }: { order: OrderDTO; onChange: () => void }) {
  const awaitingReturn = order.parcelSummary.awaitingReturn;
  const [count, setCount] = useState(awaitingReturn);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (awaitingReturn === 0) return null;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/orders/${order.id}/parcels/return-confirm`, "PATCH", {
        returnedCount: count,
        note: note.trim() || undefined,
      });
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2.5">
      <p className="text-sm font-medium text-amber-900">
        დასაბრუნებელი ამანათი გამგზავნთან: {awaitingReturn}
      </p>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">დავაბრუნე:</label>
        <input
          type="number"
          min={0}
          max={awaitingReturn}
          value={count}
          onChange={(e) =>
            setCount(Math.max(0, Math.min(awaitingReturn, parseInt(e.target.value, 10) || 0)))
          }
          className="h-10 w-24 rounded-lg border border-border bg-background px-2 text-center tabular-nums outline-none focus:border-accent"
        />
        <span className="text-xs text-muted-foreground">/ {awaitingReturn}</span>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="შენიშვნა (არასავალდებულო)"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        rows={2}
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="lg" className="h-11 w-full" disabled={busy || count === 0} onClick={submit}>
        {busy ? "…" : "დაბრუნების დადასტურება"}
      </Button>
    </div>
  );
}
