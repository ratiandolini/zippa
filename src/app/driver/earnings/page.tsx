"use client";

import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/stat";
import { useDriverMe, useOrders, useMySettlements } from "@/lib/hooks";
import { api } from "@/lib/fetcher";
import { GEL, fmtDate, fmtDateTime, SETTLEMENT_STATUS_LABEL } from "@/lib/domain";

export default function EarningsPage() {
  const { driver, mutate, isLoading } = useDriverMe(15000);
  const { orders } = useOrders("", 20000);
  const { settlements, mutate: mutateSettlements } = useMySettlements();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pendingSettlement = settlements.find((s) => s.status === "PENDING");

  const delivered = orders
    .filter((o) => o.status === "DELIVERED")
    .sort((a, b) => (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""));

  async function settle() {
    if (!driver || driver.cashOnHand <= 0) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/driver/settlement", "POST", { amount: driver.cashOnHand });
      setMsg("დისპეჩერს ვაცნობეთ — ელოდება დადასტურებას");
      mutate();
      mutateSettlements();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="ფინანსები" description="შემოსავალი, ნაღდი ფული და ანგარიშსწორება" />

      {isLoading ? (
        <p className="mb-6 text-sm text-muted-foreground">იტვირთება…</p>
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Stat label="მისაღები ანაზღაურება" value={GEL(driver?.unpaidEarnings ?? 0)} sub="კომპანია გადმოგირიცხავს" />
            <Stat label="ჩასაბარებელი ნაღდი" value={GEL(driver?.cashOnHand ?? 0)} sub="მიმღებებისგან აღებული, კომპანიას" />
            <Stat label="სულ მიტანა" value={String(driver?.totalDeliveries ?? 0)} />
          </div>
          {(() => {
            const net = (driver?.unpaidEarnings ?? 0) - (driver?.cashOnHand ?? 0);
            return (
              <div className="mb-6 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                {net >= 0 ? (
                  <>
                    ანგარიშსწორებისას მიიღებ:{" "}
                    <span className="font-semibold tabular-nums">{GEL(net)}</span>
                  </>
                ) : (
                  <>
                    ანგარიშსწორებისას ჩააბარებ:{" "}
                    <span className="font-semibold tabular-nums">{GEL(-net)}</span>
                  </>
                )}
                <span className="ml-1 text-muted-foreground">
                  (მისაღები ანაზღაურება მინუს ჩასაბარებელი ნაღდი)
                </span>
              </div>
            );
          })()}
        </>
      )}

      {pendingSettlement ? (
        <Card className="mb-6 border-amber-200 bg-amber-50/50">
          <CardContent className="p-5">
            <div className="font-medium">ნაღდის ჩაბარება — {GEL(pendingSettlement.amount)}</div>
            <p className="text-sm text-muted-foreground">
              დისპეჩერს ვაცნობეთ. როგორც კი დაადასტურებს ფულის მიღებას, ეს თანხა „ჩასაბარებელი ნაღდიდან" ჩამოგეჭრება.
            </p>
            {msg && <p className="mt-1 text-xs text-muted-foreground">{msg}</p>}
          </CardContent>
        </Card>
      ) : (
        driver &&
        driver.cashOnHand > 0 && (
          <Card className="mb-6 border-amber-200 bg-amber-50/50">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="font-medium">ნაღდის ჩაბარება</div>
                <p className="text-sm text-muted-foreground">
                  შენთან დაგროვდა {GEL(driver.cashOnHand)}. გადაეცი დისპეჩერს და დააჭირე ღილაკს — დისპეჩერი დაადასტურებს მიღებას.
                </p>
                {msg && <p className="mt-1 text-xs text-muted-foreground">{msg}</p>}
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={settle}>
                {busy ? "…" : "ნაღდი ჩავაბარე"}
              </Button>
            </CardContent>
          </Card>
        )
      )}

      {settlements.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>ნაღდის ჩაბარებები</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">თარიღი</th>
                  <th className="px-5 py-2 font-medium">თანხა</th>
                  <th className="px-5 py-2 font-medium">სტატუსი</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">{fmtDateTime(s.createdAt)}</td>
                    <td className="px-5 py-3 font-medium tabular-nums">{GEL(s.amount)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{SETTLEMENT_STATUS_LABEL[s.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ჩაბარებული შეკვეთები</CardTitle>
        </CardHeader>
        {delivered.length === 0 ? (
          <CardContent className="text-sm text-muted-foreground">ჯერ არაფერი.</CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">თარიღი</th>
                  <th className="px-5 py-2 font-medium">ტრეკინგი</th>
                  <th className="px-5 py-2 font-medium">შენ მიიღე</th>
                  <th className="px-5 py-2 font-medium">გადახდა</th>
                </tr>
              </thead>
              <tbody>
                {delivered.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      {o.deliveredAt ? fmtDate(o.deliveredAt) : "—"}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{o.trackingNumber}</td>
                    <td className="px-5 py-3 font-medium tabular-nums">{GEL(o.price.driverFee)}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      ნაღდი
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
