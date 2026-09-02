"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDrivers } from "@/lib/hooks";
import { api } from "@/lib/fetcher";
import { DRIVER_STATUS_LABEL, VEHICLE_LABEL, GEL } from "@/lib/domain";
import type { VehicleType } from "@prisma/client";

const tone = { AVAILABLE: "green", BUSY: "accent", OFFLINE: "neutral" } as const;

export default function DriversPage() {
  const { drivers, isLoading } = useDrivers("", 15000);
  const { drivers: pending, mutate: mutatePending } = useDrivers("?pending=1", 15000);
  const [busy, setBusy] = useState<string | null>(null);

  async function approve(id: string) {
    setBusy(id);
    try {
      await api(`/api/drivers/${id}`, "PATCH", { isApproved: true });
      mutatePending();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="კურიერები" description="დამტკიცება, სტატუსი და ფინანსური ბალანსი" />

      {pending.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle>დასამტკიცებელი ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"
              >
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.phone} · {VEHICLE_LABEL[d.vehicleType as VehicleType] ?? d.vehicleType}
                    {d.vehicleNumber ? ` · ${d.vehicleNumber}` : ""}
                  </div>
                </div>
                <Button size="sm" disabled={busy === d.id} onClick={() => approve(d.id)}>
                  {busy === d.id ? "…" : "დამტკიცება"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}
      {!isLoading && drivers.length === 0 && pending.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            ჯერ არ არის რეგისტრირებული კურიერი.
          </CardContent>
        </Card>
      )}

      {drivers.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">სახელი</th>
                <th className="px-5 py-3 font-medium">ტრანსპორტი</th>
                <th className="px-5 py-3 font-medium">ქალაქი</th>
                <th className="px-5 py-3 font-medium">რეიტინგი</th>
                <th className="px-5 py-3 font-medium">მიტანები</th>
                <th className="px-5 py-3 font-medium">ნაღდი ხელზე</th>
                <th className="px-5 py-3 font-medium">სტატუსი</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-3 font-medium">
                    <Link href={`/dispatch/drivers/${d.id}`} className="text-accent hover:underline">
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {VEHICLE_LABEL[d.vehicleType as VehicleType] ?? d.vehicleType}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{d.city ?? "—"}</td>
                  <td className="px-5 py-3 tabular-nums">
                    <span className="text-amber-500">★</span> {d.rating.toFixed(1)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {d.ratingCount > 0 ? `(${d.ratingCount})` : "(ახალი)"}
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular-nums">{d.totalDeliveries}</td>
                  <td className="px-5 py-3 tabular-nums">{GEL(d.cashOnHand)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={tone[d.status]}>{DRIVER_STATUS_LABEL[d.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
