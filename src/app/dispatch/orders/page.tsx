"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { useOrders, type DriverListItem } from "@/lib/hooks";
import { jsonFetcher, api } from "@/lib/fetcher";
import { GEL, streetOf } from "@/lib/domain";
import type { OrderDTO } from "@/lib/serialize";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ProofPhoto } from "@/components/proof-photo";
import { cn } from "@/lib/utils";

const columns: { key: OrderDTO["status"][]; title: string; done?: boolean }[] = [
  { key: ["PENDING"], title: "მოლოდინში" },
  { key: ["ASSIGNED", "ACCEPTED", "EN_ROUTE_PICKUP"], title: "მინიჭებული" },
  { key: ["PICKED_UP", "IN_TRANSIT"], title: "გზაშია" },
  { key: ["DELIVERED", "FAILED", "CANCELLED"], title: "დასრულებული", done: true },
];

function matches(o: OrderDTO, q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [
    o.trackingNumber,
    o.pickup.address,
    o.delivery.address,
    o.driverName,
    o.sender.name,
    o.sender.phone,
    o.recipient.name,
    o.recipient.phone,
    o.customerName,
  ]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(t));
}

export default function OrdersBoard() {
  const { orders, isLoading, mutate } = useOrders("", 10000);
  const [q, setQ] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [routeMode, setRouteMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const filtered = orders.filter(
    (o) => matches(o, q) && (!unassignedOnly || !o.driverId),
  );

  function togglePick(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function exitRouteMode() {
    setRouteMode(false);
    setPicked(new Set());
  }

  return (
    <>
      <PageHeader
        title="შეკვეთები"
        description="სტატუსების დაფა · კურიერის მინიჭება"
        action={
          <button
            onClick={() => (routeMode ? exitRouteMode() : setRouteMode(true))}
            className={
              "rounded-lg border px-3 py-1.5 text-sm font-medium " +
              (routeMode
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground")
            }
          >
            {routeMode ? "მარშრუტის დახურვა" : "მარშრუტად მინიჭება"}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ძებნა — ნომერი, მისამართი, კურიერი, ტელეფონი…"
          className="h-9 w-full max-w-sm rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
          />
          მხოლოდ უკურიერო
        </label>
        {(q || unassignedOnly) && (
          <span className="text-xs text-muted-foreground">
            ნაპოვნია {filtered.length} / {orders.length}
          </span>
        )}
      </div>

      {routeMode && (
        <p className="mb-4 rounded-lg bg-accent/[0.06] px-4 py-2 text-sm text-muted-foreground">
          მონიშნე „მოლოდინში" სვეტში შეკვეთები რომლებიც ერთ კურიერს უნდა მიანიჭო — ერთად, ერთ მარშრუტად.
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => {
          const all = filtered.filter((o) => col.key.includes(o.status));
          const capped = col.done && !q ? all.slice(0, 20) : all;
          const selectable = routeMode && col.key.includes("PENDING");
          return (
            <div key={col.title} className="rounded-xl bg-muted/50 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="text-sm font-medium">{col.title}</span>
                <span className="text-xs text-muted-foreground">{all.length}</span>
              </div>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto">
                {capped.map((o) =>
                  selectable ? (
                    <label
                      key={o.id}
                      className={
                        "flex cursor-pointer gap-2 rounded-lg border p-2 " +
                        (picked.has(o.id) ? "border-accent bg-accent/5" : "border-border bg-card")
                      }
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={picked.has(o.id)}
                        onChange={() => togglePick(o.id)}
                      />
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {o.trackingNumber}
                        </div>
                        <div className="truncate">
                          {streetOf(o.pickup.address)} → {streetOf(o.delivery.address)}
                        </div>
                      </div>
                    </label>
                  ) : (
                    <OrderCard key={o.id} order={o} onChange={mutate} />
                  ),
                )}
                {capped.length < all.length && (
                  <p className="px-1 pt-1 text-[11px] text-muted-foreground">
                    +{all.length - capped.length} ძველი — მოძებნე ნომრით ან მისამართით
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {routeMode && picked.size > 0 && (
        <RouteAssignBar
          count={picked.size}
          orderIds={[...picked]}
          onDone={() => {
            exitRouteMode();
            mutate();
          }}
        />
      )}
    </>
  );
}

function RouteAssignBar({
  count,
  orderIds,
  onDone,
}: {
  count: number;
  orderIds: string[];
  onDone: () => void;
}) {
  const [drivers, setDrivers] = useState<DriverListItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    jsonFetcher<{ drivers: DriverListItem[] }>("/api/drivers")
      .then((d) => {
        const rank = (s: string) => (s === "AVAILABLE" ? 0 : s === "BUSY" ? 1 : 2);
        setDrivers([...d.drivers].sort((a, b) => rank(a.status) - rank(b.status) || a.activeOrders - b.activeOrders));
      })
      .catch(() => setDrivers([]));
  }, []);

  async function assign(driverId: string) {
    setBusy(driverId);
    setErr(null);
    try {
      await api("/api/orders/assign-batch", "POST", { orderIds, driverId });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{count} შეკვეთა არჩეული</span>
        {!open ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            მიანიჭე კურიერს
          </Button>
        ) : (
          <div className="flex flex-1 flex-wrap gap-1.5">
            {drivers === null && <span className="text-xs text-muted-foreground">იტვირთება…</span>}
            {drivers?.map((d) => (
              <button
                key={d.id}
                disabled={busy != null}
                onClick={() => assign(d.id)}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
              >
                {busy === d.id ? "…" : `${d.name} · ${d.activeOrders} აქტ.`}
              </button>
            ))}
          </div>
        )}
        {err && <span className="text-xs text-destructive">{err}</span>}
      </div>
    </div>
  );
}

const TERMINAL = ["DELIVERED", "CANCELLED"];

function OrderCard({ order, onChange }: { order: OrderDTO; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const canAssign =
    order.status === "PENDING" || order.status === "ASSIGNED" || order.status === "FAILED";
  const canCancel = !TERMINAL.includes(order.status);
  const canEdit = ["PENDING", "ASSIGNED", "ACCEPTED", "EN_ROUTE_PICKUP"].includes(order.status);
  const canDelete = order.status === "CANCELLED" || order.status === "DRAFT";
  const canAdjust =
    order.status === "FAILED" || order.status === "CANCELLED" || !!order.returnRequestedAt;
  const canFixPrice = order.status === "PENDING" || order.status === "ASSIGNED";
  const [fixingPrice, setFixingPrice] = useState(false);

  async function adjust() {
    const amtStr = prompt(
      `${order.trackingNumber} — ანაზღაურება მომხმარებელს (₾).\nჩაირიცხება „მიღებულ თანხებში".`,
      order.returnFee > 0 ? String(order.price.delivery) : "",
    );
    if (amtStr === null) return;
    const amount = parseFloat(amtStr);
    if (!(amount > 0)) return;
    const reason = prompt("მიზეზი (მაგ. კურიერის ბრალით დაზიანდა, Zippa-ს დაგვიანება):", "");
    if (!reason) return;
    setAdjusting(true);
    try {
      await api(`/api/orders/${order.id}/adjust`, "POST", {
        amount,
        kind: "COMPENSATION",
        reason,
        waiveReturnFee: order.returnFee > 0,
      });
      onChange();
    } finally {
      setAdjusting(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      await api(`/api/orders/${order.id}/status`, "PATCH", {
        status: "CANCELLED",
        note: "დისპეჩერმა გააუქმა",
      });
      onChange();
    } finally {
      setCancelling(false);
    }
  }

  async function remove() {
    if (!confirm("წავშალო ეს გაუქმებული შეკვეთა სამუდამოდ?")) return;
    setDeleting(true);
    try {
      await api(`/api/orders/${order.id}`, "DELETE");
      onChange();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-card">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-muted-foreground">{order.trackingNumber}</span>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs">
        <span className="truncate">{streetOf(order.pickup.address)}</span>
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{streetOf(order.delivery.address)}</span>
      </div>
      {order.delivery.note && (
        <div className="mt-1 text-[11px] text-blue-700">📝 {order.delivery.note}</div>
      )}
      <div className="mt-1.5 text-[11px] text-muted-foreground">
        {order.driverName ?? "კურიერი არ ჰყავს"}
      </div>
      <div className="mt-1 space-y-0.5 rounded-md bg-muted/40 px-2 py-1.5 text-[11px] tabular-nums">
        <div className="flex justify-between">
          <span className="text-muted-foreground">კლიენტი იხდის</span>
          <span>{GEL(order.price.total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">კურიერს ერიცხება</span>
          <span>{GEL(order.price.driverFee)}</span>
        </div>
        {order.price.partnerCost > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">პარტნიორი</span>
            <span>−{GEL(order.price.partnerCost)}</span>
          </div>
        )}
        <div className="flex justify-between font-medium">
          <span className="text-muted-foreground">Zippa-ს მარჟა</span>
          <span>{GEL(order.price.companyMargin)}</span>
        </div>
        {order.pricingSource === "MANUAL" && (
          <div className="text-amber-700">✎ ხელით შესწორდა{order.priceAdjustmentReason ? ` · ${order.priceAdjustmentReason}` : ""}</div>
        )}
      </div>

      {order.needsManualReview && !fixingPrice && (
        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900">
          ⚠ ფასი ხელით უნდა დაადასტურო — მინიჭება დაბლოკილია
        </div>
      )}

      {fixingPrice && (
        <PriceFixForm
          order={order}
          onClose={() => setFixingPrice(false)}
          onDone={() => {
            setFixingPrice(false);
            onChange();
          }}
        />
      )}

      {order.returnRequestedAt && !order.returnResolvedAt && (
        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          <div className="font-medium">↩ დაბრუნების მოთხოვნა</div>
          {order.returnReason && <div className="mt-0.5">{order.returnReason}</div>}
          <button
            className="mt-1 font-medium text-accent hover:underline disabled:opacity-50"
            disabled={resolving}
            onClick={async () => {
              setResolving(true);
              try {
                await api(`/api/orders/${order.id}/return-request`, "PATCH", {});
                onChange();
              } finally {
                setResolving(false);
              }
            }}
          >
            {resolving ? "…" : "დამუშავებულად მონიშვნა"}
          </button>
        </div>
      )}

      {order.proofPhotoUrl && (
        <div className="mt-2">
          <ProofPhoto order={order} />
        </div>
      )}

      {canAssign && (
        <div className="mt-2">
          <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={() => setOpen((v) => !v)}>
            {order.status === "FAILED"
              ? "ხელახლა მინიჭება"
              : order.driverName
                ? "კურიერის შეცვლა"
                : "კურიერის მინიჭება"}
          </Button>
          {open && (
            <AssignList
              order={order}
              onDone={() => {
                setOpen(false);
                onChange();
              }}
            />
          )}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <Link
          href={`/receipt/${order.id}`}
          target="_blank"
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          ქვითარი
        </Link>
        {canEdit && (
          <Link
            href={`/dispatch/orders/${order.id}/edit`}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            რედაქტირება
          </Link>
        )}
        {canFixPrice && (
          <button
            onClick={() => setFixingPrice((v) => !v)}
            className="text-[11px] font-medium text-accent hover:underline"
          >
            ფასის შესწორება
          </button>
        )}
        {canAdjust && (
          <button
            onClick={adjust}
            disabled={adjusting}
            className="text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
          >
            {adjusting ? "…" : "ანაზღაურება მომხმარებელს"}
          </button>
        )}
        {canCancel && (
          <button
            onClick={cancel}
            disabled={cancelling}
            className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            {cancelling ? "…" : "გაუქმება"}
          </button>
        )}
        {canDelete && (
          <button
            onClick={remove}
            disabled={deleting}
            className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            {deleting ? "…" : "წაშლა"}
          </button>
        )}
      </div>
    </div>
  );
}

function AssignList({ order, onDone }: { order: OrderDTO; onDone: () => void }) {
  const [drivers, setDrivers] = useState<DriverListItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // ყველა დამტკიცებული კურიერი (ოფლაინიც) — დისპეჩერი თვითონ წყვეტს
    jsonFetcher<{ drivers: DriverListItem[] }>(
      `/api/drivers?lat=${order.pickup.lat}&lng=${order.pickup.lng}`,
    )
      .then((d) => {
        const rank = (s: string) => (s === "AVAILABLE" ? 0 : s === "BUSY" ? 1 : 2);
        setDrivers(
          [...d.drivers].sort(
            (a, b) =>
              rank(a.status) - rank(b.status) ||
              a.activeOrders - b.activeOrders ||
              (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9),
          ),
        );
      })
      .catch(() => setDrivers([]));
  }, [order.id, order.pickup.lat, order.pickup.lng]);

  if (drivers === null)
    return <p className="mt-2 text-[11px] text-muted-foreground">იტვირთება…</p>;

  async function assign(driverId: string) {
    setBusy(driverId);
    setErr(null);
    try {
      await api(`/api/orders/${order.id}/assign`, "PATCH", { driverId });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
      setBusy(null);
    }
  }

  if (drivers.length === 0)
    return (
      <p className="mt-2 text-[11px] text-muted-foreground">
        დამტკიცებული კურიერი არ არის. ჯერ დაამტკიცე „კურიერები" გვერდზე.
      </p>
    );

  const statusLabel = (s: string) =>
    s === "AVAILABLE" ? "თავისუფალი" : s === "BUSY" ? "დაკავებული" : "ოფლაინ";

  return (
    <div className="mt-2 space-y-1">
      {err && <p className="text-[11px] text-destructive">{err}</p>}
      {drivers.slice(0, 6).map((d) => (
        <button
          key={d.id}
          disabled={busy != null}
          onClick={() => assign(d.id)}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-left text-[11px] hover:bg-muted disabled:opacity-50",
            d.status === "OFFLINE" && "opacity-60",
          )}
        >
          <span className="min-w-0">
            <span className="font-medium">{d.name} </span>
            <span
              className={cn(
                "ml-1.5 font-normal",
                d.activeOrders >= 3 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {statusLabel(d.status)} · {d.activeOrders} აქტ.
            </span>
          </span>
          <span className="shrink-0 text-muted-foreground">
            <span className="text-amber-500">★</span> {d.rating.toFixed(1)}
            {d.distanceKm != null ? ` · ${d.distanceKm} კმ` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

const PRICE_FIX_REASONS = [
  "არასწორად მითითებული წონა",
  "დიდი გაბარიტი",
  "შორეული/რთული მისამართი",
  "განმეორებითი მიტანა",
  "მომხმარებელთან შეთანხმებული ფასი",
  "კურიერის დამატებითი სვლა",
];

function PriceFixForm({
  order,
  onClose,
  onDone,
}: {
  order: OrderDTO;
  onClose: () => void;
  onDone: () => void;
}) {
  const [delivery, setDelivery] = useState(String(order.price.delivery));
  const [driverFee, setDriverFee] = useState(String(order.price.driverFee));
  const [reason, setReason] = useState(PRICE_FIX_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dp = parseFloat(delivery);
  const df = parseFloat(driverFee);
  const codFee = order.price.codFee;
  const total = Number.isFinite(dp) ? Math.round((dp + codFee) * 100) / 100 : null;
  const margin =
    total != null && Number.isFinite(df)
      ? Math.round((total + order.codCommission - df - order.price.partnerCost) * 100) / 100
      : null;

  async function save() {
    if (!Number.isFinite(dp) || !Number.isFinite(df)) {
      setErr("შეავსე ორივე ფასი");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/orders/${order.id}/price`, "PATCH", {
        deliveryPrice: dp,
        driverFee: df,
        reason,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
      setBusy(false);
    }
  }

  const field =
    "mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-xs tabular-nums";

  return (
    <div className="mt-2 space-y-2 rounded-md border border-accent/40 bg-accent/[0.05] p-2.5">
      <div className="text-[11px] font-medium">ფასის შესწორება</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-muted-foreground">
          კლიენტი იხდის (მიტანა) ₾
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            className={field}
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          კურიერს ერიცხება ₾
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            className={field}
            value={driverFee}
            onChange={(e) => setDriverFee(e.target.value)}
          />
        </label>
      </div>
      <label className="block text-[11px] text-muted-foreground">
        მიზეზი
        <select
          className={field}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {PRICE_FIX_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>სულ: {total != null ? GEL(total) : "—"}</span>
        <span>Zippa მარჟა: {margin != null ? GEL(margin) : "—"}</span>
      </div>
      {err && <div className="text-[11px] text-destructive">{err}</div>}
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={save}>
          {busy ? "ინახება…" : "შენახვა"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
          გაუქმება
        </Button>
      </div>
    </div>
  );
}
