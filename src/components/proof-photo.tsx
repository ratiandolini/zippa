"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import type { OrderDTO } from "@/lib/serialize";

const CAN_UPLOAD_STATUS = ["PICKED_UP", "IN_TRANSIT"];
const MAX_MB = 4;
const MAX_BYTES = MAX_MB * 1024 * 1024;

export function ProofPhoto({
  order,
  canUpload = false,
  onChange,
}: {
  order: Pick<OrderDTO, "id" | "proofPhotoUrl" | "status">;
  canUpload?: boolean;
  onChange?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const showUpload = canUpload && CAN_UPLOAD_STATUS.includes(order.status);

  async function upload(file: File) {
    setErr(null);
    // ── ატვირთვამდე ვამოწმებთ ზომას ──
    if (file.size > MAX_BYTES) {
      setErr(`ფოტო ${MAX_MB} MB-ზე დიდია — გადაიღე ხელახლა ან აირჩიე პატარა ფაილი`);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/orders/${order.id}/photo`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ატვირთვა ვერ მოხერხდა");
      onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  if (!order.proofPhotoUrl && !showUpload) return null;

  return (
    <div className="space-y-2">
      {order.proofPhotoUrl && (
        <a href={order.proofPhotoUrl} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={order.proofPhotoUrl}
            alt="მიტანის ფოტო"
            className="max-h-56 w-full rounded-lg border border-border object-cover"
          />
        </a>
      )}

      {showUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {busy ? "იტვირთება…" : order.proofPhotoUrl ? "ფოტოს შეცვლა" : "მიტანის ფოტოს ატვირთვა"}
          </button>
          <p className="text-xs text-muted-foreground">მაქს. {MAX_MB} MB</p>
        </>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
