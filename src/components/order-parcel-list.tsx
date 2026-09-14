"use client";

import { ParcelStatusBadge } from "@/components/parcel-status-badge";
import { GEL, DEFAULT_LIABILITY_LIMIT_GEL, FAILURE_REASON_LABEL } from "@/lib/domain";
import type { OrderDTO } from "@/lib/serialize";

// Phase 1 — read-only ჩვენება. Phase 2 fix — რაოდენობრივი შეჯამება (სულ/აღებული/
// ჩაბარებული/დასაბრუნებელი-მოლოდინში/დაბრუნებული/ვერ-აღებული/ჩამოწერილი) +
// ფინანსური ჩაშლა (საწყისი/შესრულებული/საბოლოო გადასახდელი), თითო ამანათის
// დეტალური სტატუსის გვერდით.
export function OrderParcelList({
  parcels,
  summary,
  finance,
}: {
  parcels: OrderDTO["parcels"];
  summary?: OrderDTO["parcelSummary"];
  finance?: OrderDTO["parcelFinance"];
}) {
  if (!parcels || parcels.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">ამანათები ({parcels.length})</p>
      {summary && (
        <div className="grid grid-cols-4 gap-1.5 rounded-md bg-muted/40 px-2 py-2 text-center text-xs sm:grid-cols-7">
          <div>
            <div className="font-semibold tabular-nums">{summary.total}</div>
            <div className="text-muted-foreground">სულ</div>
          </div>
          <div>
            <div className="font-semibold tabular-nums">{summary.pickedUp}</div>
            <div className="text-muted-foreground">აღებული</div>
          </div>
          <div>
            <div className="font-semibold tabular-nums text-green-700">{summary.delivered}</div>
            <div className="text-muted-foreground">ჩაბარებული</div>
          </div>
          <div>
            <div className="font-semibold tabular-nums text-amber-700">{summary.awaitingReturn}</div>
            <div className="text-muted-foreground">დასაბრუნებელი</div>
          </div>
          <div>
            <div className="font-semibold tabular-nums">{summary.returned}</div>
            <div className="text-muted-foreground">დაბრუნებული</div>
          </div>
          <div>
            <div className="font-semibold tabular-nums">{summary.notPickedUp}</div>
            <div className="text-muted-foreground">ვერ აღებული</div>
          </div>
          <div>
            <div className="font-semibold tabular-nums text-muted-foreground">{summary.cancelled}</div>
            <div className="text-muted-foreground">ჩამოწერილი</div>
          </div>
        </div>
      )}
      {finance && (
        <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">საწყისი ფასი</span>
            <span className="tabular-nums">{GEL(finance.originalTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">შესრულებული ნაწილის ფასი</span>
            <span className="tabular-nums">{GEL(finance.earnedDeliveryPrice)}</span>
          </div>
          {finance.waivedAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>ჩამოწერილი/ვერ-შესრულებული ნაწილი</span>
              <span className="tabular-nums">−{GEL(finance.waivedAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 font-medium">
            <span>საბოლოო გადასახდელი</span>
            <span className="tabular-nums">{GEL(finance.finalPayable)}</span>
          </div>
          {finance.unsettledPayable > 0 ? (
            <div className="flex justify-between text-destructive">
              <span>მათ შორის ჯერ გადაუხდელი</span>
              <span className="tabular-nums">{GEL(finance.unsettledPayable)}</span>
            </div>
          ) : (
            finance.finalPayable > 0 && (
              <div className="text-green-700">✓ ანგარიშსწორებულია</div>
            )
          )}
        </div>
      )}
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
                {p.weightKg != null && <>{p.weightKg} კგ · </>}
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
              {p.returnProofPhotoUrl && (
                <a
                  href={p.returnProofPhotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  📷 დაბრუნების ფოტო{p.returnProofAt ? ` — ${new Date(p.returnProofAt).toLocaleString("ka-GE")}` : ""}
                </a>
              )}
            </div>
            <ParcelStatusBadge status={p.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
