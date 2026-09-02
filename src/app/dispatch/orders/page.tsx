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

const columns: { key: OrderDTO["status"][]; title: string }[] = [
  { key: ["PENDING"], title: "მოლოდინში" },
  { key: ["ASSIGNED", "ACCEPTED"], title: "მინიჭებული" },
  { key: ["PICKED_UP", "IN_TRANSIT"], title: "გზაშია" },
  { key: ["DELIVERED", "FAILED", "CANCELLED"], title: "დასრულებული" },
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

  const filtered = orders.filter(
    (o) => matches(o, q) && (!unassignedOnly || !o.driverId),
  );

  return (
    <>
      <PageHeader title="შეკვეთები" description="სტატუსების დაფა · კურიერის მინიჭება" />

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

      {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => {
          const items = filtered.filter((o) => col.key.includes(o.status));
          return (
            <div key={col.title} className="rounded-xl bg-muted/50 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="text-sm font-medium">{col.title}</span>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((o) => (
                  <OrderCard key={o.id} order={o} onChange={mutate} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

const TERMINAL = ["DELIVERED", "CANCELLED"];

function OrderCard({ order, onChange }: { order: OrderDTO; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canAssign =
    order.status === "PENDING" || order.status === "ASSIGNED" || order.status === "FAILED";
  const canCancel = !TERMINAL.includes(order.status);
  const canEdit = ["PENDING", "ASSIGNED", "ACCEPTED"].includes(order.status);
  const canDelete = order.status === "CANCELLED" || order.status === "DRAFT";

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
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{order.driverName ?? "კურიერი არ ჰყავს"}</span>
        <span>{GEL(order.price.total)}</span>
      </div>

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

      <div className="mt-1.5 flex items-center gap-3">
        {canEdit && (
          <Link
            href={`/dispatch/orders/${order.id}/edit`}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            რედაქტირება
          </Link>
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
    jsonFetcher<{ drivers: DriverListItem[] }>(
      `/api/drivers?working=1&lat=${order.pickup.lat}&lng=${order.pickup.lng}`,
    )
      .then((d) =>
        setDrivers(
          [...d.drivers].sort(
            (a, b) =>
              a.activeOrders - b.activeOrders ||
              (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9),
          ),
        ),
      )
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
      <p className="mt-2 text-[11px] text-muted-foreground">ხაზზე მყოფი კურიერი არ არის.</p>
    );

  return (
    <div className="mt-2 space-y-1">
      {err && <p className="text-[11px] text-destructive">{err}</p>}
      {drivers.slice(0, 5).map((d) => (
        <button
          key={d.id}
          disabled={busy != null}
          onClick={() => assign(d.id)}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-left text-[11px] hover:bg-muted disabled:opacity-50"
        >
          <span className="font-medium">
            {d.name}
            <span
              className={
                d.activeOrders >= 3
                  ? "ml-1.5 font-normal text-destructive"
                  : "ml-1.5 font-normal text-muted-foreground"
              }
            >
              {d.activeOrders} აქტიური
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
