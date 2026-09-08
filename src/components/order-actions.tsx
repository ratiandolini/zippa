"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/domain";
import type { OrderDTO } from "@/lib/serialize";
import { Star, RotateCcw } from "lucide-react";

export function ReturnRequest({ order, onDone }: { order: OrderDTO; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (order.returnRequestedAt) {
    return (
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
        დაბრუნების მოთხოვნა გაგზავნილია ({fmtDateTime(order.returnRequestedAt)}). დისპეჩერი
        დაგიკავშირდებათ.
        {order.returnResolvedAt && (
          <div className="mt-1 font-medium">დამუშავებულია — {fmtDateTime(order.returnResolvedAt)}</div>
        )}
      </div>
    );
  }

  async function submit() {
    if (reason.trim().length < 3) {
      setErr("მიუთითე მიზეზი");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/orders/${order.id}/return-request`, "POST", { reason: reason.trim() });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
      >
        <RotateCcw className="h-3.5 w-3.5" /> დაბრუნების მოთხოვნა
      </button>
    );

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        ამანათი უკვე კურიერთანაა და გაუქმება აღარ შეიძლება. აღწერე რატომ გინდა დაბრუნება —
        დისპეჩერი მოაწესრიგებს.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="მაგ. მიმღები აღარ იღებს, არასწორი მისამართი…"
        rows={2}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={submit}>
          {busy ? "იგზავნება…" : "გაგზავნა"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          გაუქმება
        </Button>
      </div>
    </div>
  );
}

export function CancelOrderButton({
  orderId,
  onDone,
  size = "sm",
  feeGel = 0,
}: {
  orderId: string;
  onDone: () => void;
  size?: "sm" | "default";
  /** მომხმარებლის გაუქმების საფასური (₾) — >0 როცა კურიერი უკვე გზაშია ასაღებად */
  feeGel?: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/orders/${orderId}/status`, "PATCH", {
        status: "CANCELLED",
        note: "მომხმარებელმა გააუქმა",
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
      setBusy(false);
    }
  }

  if (!confirming)
    return (
      <Button size={size} variant="outline" onClick={() => setConfirming(true)}>
        {feeGel > 0 ? `გაუქმება — ${feeGel} ₾` : "უფასო გაუქმება"}
      </Button>
    );

  return (
    <div className="flex flex-col gap-1">
      {feeGel > 0 && (
        <p className="text-xs text-muted-foreground">
          კურიერი უკვე გზაშია ასაღებად — გაუქმებას {feeGel} ₾ ერიცხება.
        </p>
      )}
      <div className="flex gap-2">
        <Button size={size} variant="destructive" disabled={busy} onClick={cancel}>
          {busy ? "…" : "დიახ, გავაუქმოთ"}
        </Button>
        <Button size={size} variant="ghost" onClick={() => setConfirming(false)}>
          არა
        </Button>
      </div>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}

export function RatingWidget({
  order,
  onDone,
}: {
  order: OrderDTO;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (order.review) {
    return (
      <div className="text-sm">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className={cn(
                "h-4 w-4",
                i <= order.review!.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
              )}
            />
          ))}
        </div>
        {order.review.comment && (
          <p className="mt-1 text-muted-foreground">{order.review.comment}</p>
        )}
      </div>
    );
  }

  async function submit() {
    if (!rating) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/orders/${order.id}/review`, "POST", { rating, comment: comment || undefined });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(i)}
          >
            <Star
              className={cn(
                "h-7 w-7 transition-colors",
                i <= (hover || rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
              )}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="კომენტარი (არჩევითი)"
        rows={2}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="sm" disabled={!rating || busy} onClick={submit}>
        {busy ? "იგზავნება…" : "შეფასების გაგზავნა"}
      </Button>
    </div>
  );
}
