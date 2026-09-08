"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/stat";
import { jsonFetcher, api } from "@/lib/fetcher";
import { GEL, VEHICLE_LABEL, DRIVER_STATUS_LABEL, fmtDate, SETTLEMENT_STATUS_LABEL } from "@/lib/domain";
import type { SettlementStatus } from "@prisma/client";
import type { VehicleType } from "@prisma/client";
import { ArrowLeft } from "lucide-react";

interface DriverDetail {
  driver: {
    id: string;
    name: string;
    phone: string;
    email: string;
    city: string | null;
    vehicleType: string;
    vehicleNumber: string | null;
    isApproved: boolean;
    status: "AVAILABLE" | "BUSY" | "OFFLINE";
    rating: number;
    ratingCount: number;
    totalDeliveries: number;
    cashOnHand: number;
    unpaidEarnings: number;
    unsettledEarningsSum: number;
    unsettledEarningsCount: number;
    payouts: { id: string; amount: number; note: string | null; createdAt: string }[];
    settlements: { id: string; amount: number; note: string | null; status: SettlementStatus; createdAt: string }[];
    reviews: {
      id: string;
      rating: number;
      comment: string | null;
      trackingNumber: string | null;
      createdAt: string;
    }[];
  };
}

function Stars({ n }: { n: number }) {
  return (
    <span className="tabular-nums text-amber-500">
      {"★".repeat(n)}
      <span className="text-muted-foreground">{"★".repeat(5 - n)}</span>
    </span>
  );
}

export default function DriverDetailPage({ params }: { params: { id: string } }) {
  const { data, isLoading, mutate } = useSWR<DriverDetail>(
    `/api/drivers/${params.id}`,
    jsonFetcher,
    { refreshInterval: 20000 },
  );
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="კურიერი" />
        <p className="text-sm text-muted-foreground">იტვირთება…</p>
      </>
    );
  }

  const d = data.driver;

  async function payout() {
    const a = parseFloat(amount || String(d.unpaidEarnings));
    if (!a || a <= 0) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/drivers/${d.id}/payout`, "POST", { amount: a });
      setMsg("გადახდა დაფიქსირდა");
      setAmount("");
      mutate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link
        href="/dispatch/drivers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> კურიერები
      </Link>
      <PageHeader
        title={d.name}
        description={`${d.phone} · ${VEHICLE_LABEL[d.vehicleType as VehicleType]}${d.vehicleNumber ? ` · ${d.vehicleNumber}` : ""}`}
        action={<Badge tone={d.status === "AVAILABLE" ? "green" : d.status === "BUSY" ? "accent" : "neutral"}>{DRIVER_STATUS_LABEL[d.status]}</Badge>}
      />

      <div className="mb-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="მიტანები" value={String(d.totalDeliveries)} />
        <Stat label="რეიტინგი" value={`★ ${d.rating.toFixed(1)}`} sub={`${d.ratingCount} შეფასება`} />
        <Stat label="კურიერს ვუხდით" value={GEL(d.unpaidEarnings)} sub="დარიცხული ანაზღაურება" />
        <Stat label="კურიერი გვაბარებს" value={GEL(d.cashOnHand)} sub="შეგროვილი ნაღდი" />
      </div>
      <div className="mb-6 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        წმინდა:{" "}
        <span className="font-semibold tabular-nums">{GEL(d.unpaidEarnings - d.cashOnHand)}</span>{" "}
        <span className="text-muted-foreground">
          — დადებითი: კურიერს ამდენი უნდა გადავურიცხოთ. უარყოფითი: კურიერმა ამდენი ნაღდი უნდა ჩააბაროს.
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ანაზღაურების გადახდა</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              დაუფარავი: <span className="font-medium text-foreground">{GEL(d.unpaidEarnings)}</span>{" "}
              ({d.unsettledEarningsCount} შეკვეთა)
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                placeholder={String(d.unpaidEarnings)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button onClick={payout} disabled={busy || d.unpaidEarnings <= 0} className="shrink-0">
                {busy ? "…" : "გადახდა"}
              </Button>
            </div>
            {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ისტორია</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">გადახდები</div>
              {d.payouts.length === 0 ? (
                <p className="text-muted-foreground">—</p>
              ) : (
                d.payouts.map((p) => (
                  <div key={p.id} className="flex justify-between border-b border-border py-1.5 last:border-0">
                    <span>{fmtDate(p.createdAt)}</span>
                    <span className="font-medium tabular-nums">{GEL(p.amount)}</span>
                  </div>
                ))
              )}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">ნაღდის ჩაბარებები</div>
              {d.settlements.length === 0 ? (
                <p className="text-muted-foreground">—</p>
              ) : (
                d.settlements.map((s) => (
                  <div key={s.id} className="flex justify-between border-b border-border py-1.5 last:border-0">
                    <span>
                      {fmtDate(s.createdAt)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {SETTLEMENT_STATUS_LABEL[s.status]}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">{GEL(s.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>შეფასებები ({d.ratingCount})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {d.reviews.length === 0 ? (
            <p className="text-muted-foreground">ჯერ არ არის შეფასება.</p>
          ) : (
            d.reviews.map((r) => (
              <div key={r.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <Stars n={r.rating} />
                  <span className="text-xs text-muted-foreground">
                    {r.trackingNumber ? `${r.trackingNumber} · ` : ""}
                    {fmtDate(r.createdAt)}
                  </span>
                </div>
                {r.comment && <p className="mt-1 text-muted-foreground">{r.comment}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
