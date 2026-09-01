"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type { OrderDTO } from "@/lib/serialize";
import { Star } from "lucide-react";

export function CancelOrderButton({
  orderId,
  onDone,
  size = "sm",
}: {
  orderId: string;
  onDone: () => void;
  size?: "sm" | "default";
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
        გაუქმება
      </Button>
    );

  return (
    <div className="flex flex-col gap-1">
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
