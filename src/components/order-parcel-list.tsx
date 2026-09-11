"use client";

import { ParcelStatusBadge } from "@/components/parcel-status-badge";
import { GEL, DEFAULT_LIABILITY_LIMIT_GEL, FAILURE_REASON_LABEL } from "@/lib/domain";
import type { OrderDTO } from "@/lib/serialize";

// Phase 1 — read-only ჩვენება. არაფერს არ ცვლის, მხოლოდ აჩვენებს, თუ order.parcels
// შევსებულია (Phase 2-მდე ეს მასივი ყოველთვის ცარიელია — კომპონენტი დორმანტულია).
export function OrderParcelList({ parcels }: { parcels: OrderDTO["parcels"] }) {
  if (!parcels || parcels.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">ამანათები ({parcels.length})</p>
      <div className="divide-y divide-border">
        {parcels.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div>
              <span className="font-medium">
                ამანათი {p.sequenceNo}/{parcels.length}
              </span>
              {p.label && <span className="text-muted-foreground"> · {p.label}</span>}
              {p.description && <span className="text-muted-foreground"> · {p.description}</span>}
              <div className="text-xs text-muted-foreground">
                {p.weightKg} კგ ·{" "}
                {p.declaredValue != null ? (
                  <>დეკლარირებული ღირებულება: {GEL(p.declaredValue)}</>
                ) : (
                  <>
                    დეკლარირებული ღირებულება (არჩევითი). მიუთითებლობის შემთხვევაში პასუხისმგებლობის
                    ლიმიტი შეადგენს {GEL(DEFAULT_LIABILITY_LIMIT_GEL)}-ს.
                  </>
                )}
              </div>
              {p.failureReason && (
                <div className="text-xs text-destructive">
                  მიზეზი: {FAILURE_REASON_LABEL[p.failureReason]}
                  {p.failureNote ? ` — ${p.failureNote}` : ""}
                </div>
              )}
            </div>
            <ParcelStatusBadge status={p.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
