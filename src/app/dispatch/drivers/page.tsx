"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDrivers } from "@/lib/hooks";
import { api, HttpError } from "@/lib/fetcher";
import {
  DRIVER_STATUS_LABEL,
  VEHICLE_LABEL,
  GEL,
  DRIVER_LIFECYCLE_LABEL,
  driverPendingLifecycleLabel,
} from "@/lib/domain";
import type { VehicleType } from "@prisma/client";

const tone = { AVAILABLE: "green", BUSY: "accent", OFFLINE: "neutral" } as const;
const lifecycleTone = { ACTIVE: "green", SUSPENDED: "red", ARCHIVED: "neutral" } as const;

export default function DriversPage() {
  // lifecycle=all — roster-გვერდზე დაბლოკილი/დაარქივებული კურიერებიც ჩანს
  // (მართვისთვის); assign-picker (dispatch/orders) ნაგულისხმევად ACTIVE-ს იძლევა.
  const { drivers, isLoading: loadingAll } = useDrivers("?lifecycle=all", 15000);
  // pending&lifecycle=all — ყველა ჯერ არ დამტკიცებული, lifecycle-ის მიუხედავად;
  // ორ სექციად იყოფა ქვემოთ (ჩვეულებრივი დასამტკიცებელი vs საჭიროებს აღდგენას).
  const { drivers: pendingAll, mutate: mutatePending, isLoading: loadingPending } =
    useDrivers("?pending=1&lifecycle=all", 15000);
  const pending = pendingAll.filter((d) => d.lifecycleStatus === "ACTIVE");
  const pendingBlocked = pendingAll.filter((d) => d.lifecycleStatus !== "ACTIVE");
  const isLoading = loadingAll || loadingPending;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  // დასამტკიცებელ კურიერზე წაშლის მცდელობის 409 (ისტორია არსებობს) — ინლაინ
  // ახსნა + "არქივში გადატანა" ალტერნატივა, თითო კურიერზე ცალკე.
  const [deleteBlocked, setDeleteBlocked] = useState<Record<string, string>>({});

  async function approve(id: string) {
    setBusy(id);
    try {
      await api(`/api/drivers/${id}`, "PATCH", { isApproved: true });
      mutatePending();
    } finally {
      setBusy(null);
    }
  }

  async function deletePending(id: string) {
    const reason = prompt("წაშლის მიზეზი (სავალდებულო):");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("მიზეზი სავალდებულოა (მინ. 3 სიმბოლო)");
      return;
    }
    if (!confirm("ეს ქმედება საბოლოოა და ვერ დაბრუნდება. ნამდვილად წაიშალოს კურიერი?")) return;
    setError("");
    setDeleteBlocked((m) => ({ ...m, [id]: "" }));
    setBusy(id);
    try {
      await api(`/api/dispatch/drivers/${id}/lifecycle`, "POST", { action: "DELETE", reason });
      await mutatePending();
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        setDeleteBlocked((m) => ({ ...m, [id]: e.message }));
      } else {
        setError(e instanceof HttpError ? e.message : "შეცდომა");
      }
    } finally {
      setBusy(null);
    }
  }

  async function archiveInstead(id: string) {
    const reason = prompt("დაარქივების მიზეზი (სავალდებულო):");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("მიზეზი სავალდებულოა (მინ. 3 სიმბოლო)");
      return;
    }
    setError("");
    setBusy(id);
    try {
      await api(`/api/dispatch/drivers/${id}/lifecycle`, "POST", { action: "ARCHIVE", reason });
      setDeleteBlocked((m) => ({ ...m, [id]: "" }));
      await mutatePending();
    } catch (e) {
      setError(e instanceof HttpError ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
    }
  }

  async function reactivate(id: string) {
    const reason = prompt("აღდგენის მიზეზი (სავალდებულო):");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("მიზეზი სავალდებულოა (მინ. 3 სიმბოლო)");
      return;
    }
    setError("");
    setBusy(id);
    try {
      await api(`/api/dispatch/drivers/${id}/lifecycle`, "POST", { action: "REACTIVATE", reason });
      await mutatePending();
    } catch (e) {
      setError(e instanceof HttpError ? e.message : "შეცდომა");
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
                className="rounded-lg border border-border bg-background px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.phone} · {VEHICLE_LABEL[d.vehicleType as VehicleType] ?? d.vehicleType}
                      {d.vehicleNumber ? ` · ${d.vehicleNumber}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy === d.id} onClick={() => approve(d.id)}>
                      {busy === d.id ? "…" : "დამტკიცება"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive/10"
                      disabled={busy === d.id}
                      onClick={() => deletePending(d.id)}
                    >
                      {busy === d.id ? "…" : "წაშლა"}
                    </Button>
                  </div>
                </div>
                {deleteBlocked[d.id] && (
                  <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <p>{deleteBlocked[d.id]}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={busy === d.id}
                      onClick={() => archiveInstead(d.id)}
                    >
                      არქივში გადატანა
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {pendingBlocked.length > 0 && (
        <Card className="mb-6 border-border bg-muted/30">
          <CardHeader>
            <CardTitle>საჭიროებს აღდგენას ({pendingBlocked.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingBlocked.map((d) => (
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
                  <div className="mt-1 text-xs text-muted-foreground">
                    {driverPendingLifecycleLabel(d.lifecycleStatus)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === d.id}
                  onClick={() => reactivate(d.id)}
                >
                  {busy === d.id ? "…" : "აღდგენა"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}
      {!isLoading && drivers.length === 0 && pending.length === 0 && pendingBlocked.length === 0 && (
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
                <th className="px-5 py-3 font-medium">ანგარიში</th>
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
                  <td className="px-5 py-3">
                    <Badge tone={lifecycleTone[d.lifecycleStatus]}>
                      {DRIVER_LIFECYCLE_LABEL[d.lifecycleStatus]}
                    </Badge>
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
