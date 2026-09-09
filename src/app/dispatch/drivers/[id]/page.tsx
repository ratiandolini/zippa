"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useCities } from "@/lib/hooks";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/stat";
import { jsonFetcher, api } from "@/lib/fetcher";
import { GEL, VEHICLE_LABEL, DRIVER_STATUS_LABEL, fmtDate, SETTLEMENT_STATUS_LABEL, EARNING_KIND_LABEL } from "@/lib/domain";
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
    cityId: string | null;
    isActive: boolean;
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
    earnings: {
      id: string;
      kind: string;
      trackingNumber: string | null;
      orderStatus: string | null;
      driverAmount: number;
      collectedInCash: boolean;
      isSettled: boolean;
      createdAt: string;
    }[];
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
  const { cities } = useCities();
  const router = useRouter();
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

  async function setCity(cityId: string) {
    await api(`/api/drivers/${d.id}`, "PATCH", { cityId: cityId || null });
    mutate();
  }

  async function deactivate() {
    if (!confirm(`ნამდვილად გსურს ${d.name}-ის ანგარიშის გაუქმება? კურიერი ვეღარ შევა სისტემაში.`))
      return;
    let payout = false;
    if (d.unpaidEarnings > 0) {
      const yes = confirm(
        `კურიერს ერგება ${GEL(d.unpaidEarnings)} ანაზღაურება. გადავუხადოთ ახლავე? (გაუქმება → OK, დატოვება → Cancel და ჯერ გადაუხადე ცალკე)`,
      );
      if (!yes) return;
      payout = true;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/drivers/${d.id}${payout ? "?payout=1" : ""}`, "DELETE");
      router.push("/dispatch/drivers");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "შეცდომა");
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
        <Stat label="მიტანა" value={String(d.totalDeliveries)} />
        <Stat label="რეიტინგი" value={`★ ${d.rating.toFixed(1)}`} sub={`${d.ratingCount} შეფასება`} />
        <Stat label="გადასახდელი ანაზღაურება" value={GEL(d.unpaidEarnings)} sub="კურიერისთვის" />
        <Stat label="მისაღები ნაღდი" value={GEL(d.cashOnHand)} sub="კურიერს აქვს ხელზე" />
      </div>
      {(() => {
        const net = d.unpaidEarnings - d.cashOnHand;
        return (
          <div className="mb-6 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
            {net >= 0 ? (
              <>
                ანგარიშსწორებისას კურიერს გადაუხდი:{" "}
                <span className="font-semibold tabular-nums">{GEL(net)}</span>
              </>
            ) : (
              <>
                ანგარიშსწორებისას კურიერი ჩააბარებს:{" "}
                <span className="font-semibold tabular-nums">{GEL(-net)}</span>
              </>
            )}
            <span className="ml-1 text-muted-foreground">(ანაზღაურება მინუს მისაღები ნაღდი)</span>
          </div>
        );
      })()}

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">ქალაქი</span>
            <select
              value={d.cityId ?? ""}
              onChange={(e) => setCity(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">— არჩეული არ არის —</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            disabled={busy}
            onClick={deactivate}
          >
            ანგარიშის გაუქმება
          </Button>
        </CardContent>
      </Card>
      {msg && <p className="mb-4 text-sm text-destructive">{msg}</p>}

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
          <CardTitle>დარიცხვები მიტანებზე</CardTitle>
        </CardHeader>
        {d.earnings.length === 0 ? (
          <CardContent className="text-sm text-muted-foreground">ჯერ არაფერი.</CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">თარიღი</th>
                  <th className="px-5 py-2 font-medium">ტრეკინგი</th>
                  <th className="px-5 py-2 font-medium">დაერიცხა</th>
                  <th className="px-5 py-2 font-medium">გადახდილი</th>
                </tr>
              </thead>
              <tbody>
                {d.earnings.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5">{fmtDate(e.createdAt)}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">
                      {e.trackingNumber ?? "—"}
                      {EARNING_KIND_LABEL[e.kind] && (
                        <span className="ml-1.5 rounded bg-muted px-1 py-0.5 font-sans text-[10px] text-foreground">
                          {EARNING_KIND_LABEL[e.kind]}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 font-medium tabular-nums">{GEL(e.driverAmount)}</td>
                    <td className="px-5 py-2.5">
                      {e.isSettled ? (
                        <span className="text-xs text-muted-foreground">გადახდილი</span>
                      ) : (
                        <span className="text-xs text-amber-600">გადასახდელი</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
