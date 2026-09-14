"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OrderDTO } from "@/lib/serialize";

const MAX_BYTES = 4 * 1024 * 1024;

// Phase 2 fix (safeguard) — RETURN_REQUESTED ამანათების ფაქტობრივი დაბრუნების
// დადასტურება. ორი რეჟიმი:
//  - driver: ფოტო სავალდებულოა (დაბრუნების მტკიცებულება).
//  - dispatcher (override): წერილობითი მიზეზი სავალდებულოა, ფოტო არჩევითი —
//    გამოსაყენებელია მხოლოდ მაშინ, როცა კურიერს არ შეუძლია თავად დაადასტუროს.
export function ParcelReturnConfirm({
  order,
  mode,
  onChange,
}: {
  order: OrderDTO;
  mode: "driver" | "dispatcher";
  onChange: () => void;
}) {
  const awaitingReturn = order.parcelSummary.awaitingReturn;
  const [count, setCount] = useState(awaitingReturn);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (awaitingReturn === 0) return null;

  const canSubmit = mode === "driver" ? !!file && count > 0 : reason.trim().length > 0 && count > 0;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("returnedCount", String(count));
      if (mode === "driver") {
        if (file) fd.append("file", file);
        if (note.trim()) fd.append("note", note.trim());
      } else {
        fd.append("reason", reason.trim());
        if (file) fd.append("file", file);
      }
      const res = await fetch(`/api/orders/${order.id}/parcels/return-confirm`, {
        method: "PATCH",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      onChange();
      setNote("");
      setReason("");
      setFile(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        mode === "driver"
          ? "mt-3 space-y-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3"
          : "mt-2 space-y-2 rounded-md border border-border bg-muted/40 p-2 text-xs"
      }
    >
      <p className={mode === "driver" ? "text-sm font-medium text-amber-900" : "text-[11px] font-medium"}>
        {mode === "driver"
          ? `დასაბრუნებელი ამანათი გამგზავნთან: ${awaitingReturn}`
          : `დისპეჩერის override — დასაბრუნებელი: ${awaitingReturn}`}
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
          className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-center text-sm tabular-nums outline-none focus:border-accent"
        />
        <span className="text-xs text-muted-foreground">/ {awaitingReturn}</span>
      </div>

      {mode === "driver" ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.size > MAX_BYTES) {
                setErr("ფოტო 4 MB-ზე დიდია");
                return;
              }
              setFile(f ?? null);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-amber-400 text-sm font-medium text-amber-900"
          >
            <Camera className="h-4 w-4" />
            {file ? "ფოტო შერჩეულია — შესცვალე" : "დაბრუნების ფოტოს გადაღება (სავალდებულო)"}
          </button>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="შენიშვნა (არასავალდებულო)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            rows={2}
          />
        </>
      ) : (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="მიზეზი — რატომ ადასტურებ ხელით, ფოტოს გარეშე (სავალდებულო)"
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
          rows={2}
        />
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button
        size={mode === "driver" ? "lg" : "sm"}
        className={mode === "driver" ? "h-11 w-full" : ""}
        disabled={busy || !canSubmit}
        onClick={submit}
      >
        {busy ? "…" : "დაბრუნების დადასტურება"}
      </Button>
    </div>
  );
}
