"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { OrderTimeline } from "@/components/order-timeline";
import { CancelOrderButton, RatingWidget, ReturnRequest } from "@/components/order-actions";
import { ProofPhoto } from "@/components/proof-photo";
import { LazyMap } from "@/components/map-lazy";
import { useOrder, useOrders } from "@/lib/hooks";
import { GEL, streetOf, FREE_CANCEL_STATUSES, PAID_CANCEL_STATUSES, CANCEL_FEE_GEL, ACTIVE_ORDER_STATUSES, FAILURE_REASON_LABEL } from "@/lib/domain";
import { haversineKm } from "@/lib/geo";
import { ArrowRight } from "lucide-react";

const ACTIVE = ["PENDING", ...ACTIVE_ORDER_STATUSES];

export default function TrackPage() {
  return (
    <Suspense>
      <TrackInner />
    </Suspense>
  );
}

function TrackInner() {
  const id = useSearchParams().get("id");
  return id ? <Detail id={id} /> : <ActiveList />;
}

function ActiveList() {
  const { orders, isLoading } = useOrders("", 15000);
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  return (
    <>
      <PageHeader title="რუკაზე ნახვა" description="აქტიური შეკვეთები" />
      {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}
      {!isLoading && active.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            აქტიური შეკვეთა არ გაქვს.{" "}
            <Link href="/app/new" className="text-accent hover:underline">
              შექმენი ახალი
            </Link>
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {active.map((o) => (
          <Link key={o.id} href={`/app/track?id=${o.id}`}>
            <Card className="transition-colors hover:border-accent/40">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {o.trackingNumber}
                    </span>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-sm">
                    <span>{streetOf(o.pickup.address)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{streetOf(o.delivery.address)}</span>
                  </div>
                </div>
                <span className="text-sm font-medium tabular-nums">{GEL(o.price.total)}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

function Detail({ id }: { id: string }) {
  const { order, isLoading, error, mutate } = useOrder(id, 8000);

  if (isLoading) return <p className="text-sm text-muted-foreground">იტვირთება…</p>;
  if (error || !order)
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          შეკვეთა ვერ მოიძებნა.
        </CardContent>
      </Card>
    );

  const points = [
    { lat: order.pickup.lat, lng: order.pickup.lng, kind: "pickup" as const },
    { lat: order.delivery.lat, lng: order.delivery.lng, kind: "delivery" as const },
    ...(order.driverLocation
      ? [{ lat: order.driverLocation.lat, lng: order.driverLocation.lng, kind: "driver" as const }]
      : []),
  ];

  // სავარაუდო დრო კურიერამდე/კურიერიდან (ცოცხალი GPS-ის მიხედვით)
  const etaMin = (() => {
    if (!order.driverLocation) return null;
    const target =
      order.status === "IN_TRANSIT" || order.status === "PICKED_UP"
        ? order.delivery
        : ["ACCEPTED", "EN_ROUTE_PICKUP"].includes(order.status)
          ? order.pickup
          : null;
    if (!target) return null;
    const km = haversineKm(order.driverLocation, { lat: target.lat, lng: target.lng }) * 1.3;
    return Math.max(1, Math.round((km / 18) * 60)); // ~18 კმ/სთ ქალაქში
  })();

  return (
    <>
      <PageHeader
        title={order.trackingNumber}
        description="შეკვეთის ადგილმდებარეობა"
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/receipt/${order.id}`}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              ქვითარი
            </Link>
            <OrderStatusBadge status={order.status} />
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {etaMin != null && (
            <div className="rounded-lg border border-accent/30 bg-accent/[0.06] px-4 py-2.5 text-sm">
              <span className="font-medium">კურიერი გზაშია</span>
              <span className="ml-1 text-muted-foreground">
                — {order.driverName ? `${order.driverName}, ` : ""}დაახლ. {etaMin} წუთში
                {["ACCEPTED", "EN_ROUTE_PICKUP"].includes(order.status) ? " მიდის ასაღებად" : ""}
              </span>
            </div>
          )}
          <LazyMap points={points} className="h-80 w-full" />
          <Card>
            <CardHeader>
              <CardTitle>მარშრუტი</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">აღება</div>
                <div>{order.pickup.address}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">მიტანა</div>
                <div>{order.delivery.address}</div>
                {order.delivery.note && (
                  <div className="mt-1 text-xs text-muted-foreground">შენიშვნა: {order.delivery.note}</div>
                )}
              </div>
              {order.driverName && (
                <div>
                  <div className="text-xs text-muted-foreground">კურიერი</div>
                  <div>
                    {order.driverName}
                    {order.driverPhone ? ` · ${order.driverPhone}` : ""}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>გადახდა</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ჯამი</span>
                <span className="font-semibold tabular-nums">{GEL(order.price.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">მეთოდი</span>
                <span>{order.paymentMethod === "CASH" ? "ნაღდი" : "ბარათი"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">წონა</span>
                <span>{order.weightKg} კგ</span>
              </div>
              {order.needsManualReview && order.status === "PENDING" && (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  ფასს დისპეჩერი დაადასტურებს — საბოლოო თანხა შესაძლოა შეიცვალოს.
                </div>
              )}
              {order.pricingSource === "MANUAL" && (
                <div className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  ფასი დისპეჩერმა დააზუსტა
                  {order.priceAdjustmentReason ? ` — ${order.priceAdjustmentReason}` : ""}.
                </div>
              )}
              {[...FREE_CANCEL_STATUSES, ...PAID_CANCEL_STATUSES].includes(order.status) && (
                <div className="pt-2">
                  <CancelOrderButton
                    orderId={order.id}
                    onDone={() => mutate()}
                    feeGel={PAID_CANCEL_STATUSES.includes(order.status) ? CANCEL_FEE_GEL : 0}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {PAID_CANCEL_STATUSES.includes(order.status)
                      ? `კურიერი უკვე გზაშია ასაღებად — გაუქმებას ${CANCEL_FEE_GEL} ₾ ერიცხება.`
                      : "გაუქმება უფასოა, სანამ კურიერი გზას დაადგება ასაღებად."}
                  </p>
                </div>
              )}
              {order.status === "FAILED" && (
                <div className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  მიტანა ვერ შესრულდა
                  {order.failureReason ? ` — ${FAILURE_REASON_LABEL[order.failureReason]}` : ""}.
                  {order.returnFee > 0
                    ? ` ამანათი ბრუნდება; დაბრუნების საფასური ${GEL(order.returnFee)}.`
                    : " ამანათი ბრუნდება."}
                </div>
              )}
              {["PICKED_UP", "IN_TRANSIT", "DELIVERED"].includes(order.status) && (
                <div className="pt-2">
                  <ReturnRequest order={order} onDone={() => mutate()} />
                </div>
              )}
            </CardContent>
          </Card>

          {order.proofPhotoUrl && (
            <Card>
              <CardHeader>
                <CardTitle>მიტანის ფოტო</CardTitle>
              </CardHeader>
              <CardContent>
                <ProofPhoto order={order} />
              </CardContent>
            </Card>
          )}

          {order.status === "DELIVERED" && (
            <Card>
              <CardHeader>
                <CardTitle>{order.review ? "შენი შეფასება" : "შეაფასე კურიერი"}</CardTitle>
              </CardHeader>
              <CardContent>
                <RatingWidget order={order} onDone={() => mutate()} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>ისტორია</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderTimeline events={order.events} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
