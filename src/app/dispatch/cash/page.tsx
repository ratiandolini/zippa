"use client";

import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSettlements, useDrivers } from "@/lib/hooks";
import { api } from "@/lib/fetcher";
import { GEL, fmtDateTime, SETTLEMENT_STATUS_LABEL } from "@/lib/domain";

export default function DispatchCashPage() {
  const { settlements: pending, isLoading, mutate } = useSettlements("", 12000);
  const { settlements: history, mutate: mutateHistory } = useSettlements("?status=all", 30000);
  const { drivers, mutate: mutateDrivers } = useDrivers("", 20000);

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function review(id: string, action: "CONFIRM" | "REJECT") {
    setBusy(id + action);
    setErr(null);
    try {
      await api(`/api/settlements/${id}`, "PATCH", { action });
      mutate();
      mutateHistory();
      mutateDrivers();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
    }
  }

  const outstanding = drivers.filter((d) => d.cashOnHand > 0);
  const totalOutstanding = outstanding.reduce((s, d) => s + d.cashOnHand, 0);
  const done = history.filter((s) => s.status !== "PENDING");

  return (
    <>
      <PageHeader title="ნაღდი ფული" description="კურიერების მიერ შეგროვილი ნაღდის დადასტურება" />

      {err && <p className="mb-4 text-sm text-destructive">{err}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">კურიერებთან ხელზე</div>
            <div className="mt-1 font-serif text-2xl font-semibold tabular-nums">{GEL(totalOutstanding)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{outstanding.length} კურიერი</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">დასადასტურებელი</div>
            <div className="mt-1 font-serif text-2xl font-semibold tabular-nums">{pending.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>დადასტურების მოლოდინში</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}
          {!isLoading && pending.length === 0 && (
            <p className="text-sm text-muted-foreground">ახალი განაცხადი არ არის.</p>
          )}
          {pending.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div>
                <div className="font-medium">
                  {s.driverName} · <span className="tabular-nums">{GEL(s.amount)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.driverPhone} · გამოაცხადა {fmtDateTime(s.createdAt)} · ხელზე {GEL(s.cashOnHand ?? 0)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy != null}
                  onClick={() => review(s.id, "CONFIRM")}
                >
                  {busy === s.id + "CONFIRM" ? "…" : "მივიღე"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy != null}
                  onClick={() => review(s.id, "REJECT")}
                >
                  {busy === s.id + "REJECT" ? "…" : "უარყოფა"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ისტორია</CardTitle>
        </CardHeader>
        {done.length === 0 ? (
          <CardContent className="text-sm text-muted-foreground">ჯერ არაფერი.</CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">თარიღი</th>
                  <th className="px-5 py-2 font-medium">კურიერი</th>
                  <th className="px-5 py-2 font-medium">თანხა</th>
                  <th className="px-5 py-2 font-medium">სტატუსი</th>
                </tr>
              </thead>
              <tbody>
                {done.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">{fmtDateTime(s.confirmedAt ?? s.createdAt)}</td>
                    <td className="px-5 py-3">{s.driverName}</td>
                    <td className="px-5 py-3 font-medium tabular-nums">{GEL(s.amount)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={s.status === "CONFIRMED" ? "green" : "red"}>
                        {SETTLEMENT_STATUS_LABEL[s.status]}
                      </Badge>
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
