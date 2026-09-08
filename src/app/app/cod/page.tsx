"use client";

import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/stat";
import { useMyCod } from "@/lib/hooks";
import { GEL, fmtDate } from "@/lib/domain";
import { ArrowLeft } from "lucide-react";

export default function CustomerCodPage() {
  const { cod } = useMyCod();

  return (
    <>
      <Link
        href="/app"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> მთავარი
      </Link>
      <PageHeader title="COD" description="მიმღებებისგან შეგროვილი თანხა, რომელიც გერგებათ" />

      {!cod ? (
        <p className="text-sm text-muted-foreground">იტვირთება…</p>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat
              label={cod.outstandingNet >= 0 ? "მისაღები (წმინდა)" : "დავალიანება"}
              value={GEL(Math.abs(cod.outstandingNet))}
              sub={`${cod.outstandingCount} შეკვეთა`}
            />
            <Stat label="დაბრუნება / გაუქმება" value={GEL(cod.chargesTotal)} sub="გამოიქვითება COD-იდან" />
            <Stat
              label="სულ გადმორიცხული"
              value={GEL(cod.history.reduce((s, h) => s + Math.max(0, h.net), 0))}
            />
          </div>

          {cod.charges.length > 0 && (
            <Card className="mb-6 border-destructive/30">
              <CardHeader>
                <CardTitle>დაბრუნების / გაუქმების საფასური</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-5 py-2 font-medium">ტრეკინგი</th>
                      <th className="px-5 py-2 font-medium">მიზეზი</th>
                      <th className="px-5 py-2 font-medium">თანხა</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cod.charges.map((c) => (
                      <tr key={c.trackingNumber} className="border-b border-border last:border-0">
                        <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">
                          {c.trackingNumber}
                        </td>
                        <td className="px-5 py-2.5">{c.reason}</td>
                        <td className="px-5 py-2.5 tabular-nums text-destructive">−{GEL(c.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>მისაღები — შეკვეთების ჩაშლა</CardTitle>
            </CardHeader>
            {cod.pending.length === 0 ? (
              <CardContent className="text-sm text-muted-foreground">
                ამჟამად გადმოსარიცხი COD არ არის.
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-5 py-2 font-medium">ჩაბარდა</th>
                      <th className="px-5 py-2 font-medium">ტრეკინგი</th>
                      <th className="px-5 py-2 font-medium">შეგროვილი</th>
                      <th className="px-5 py-2 font-medium">საკომისიო</th>
                      <th className="px-5 py-2 font-medium">მიიღებთ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cod.pending.map((p) => (
                      <tr key={p.trackingNumber} className="border-b border-border last:border-0">
                        <td className="px-5 py-2.5">{p.deliveredAt ? fmtDate(p.deliveredAt) : "—"}</td>
                        <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">
                          {p.trackingNumber}
                        </td>
                        <td className="px-5 py-2.5 tabular-nums">{GEL(p.collectAmount)}</td>
                        <td className="px-5 py-2.5 tabular-nums text-muted-foreground">−{GEL(p.commission)}</td>
                        <td className="px-5 py-2.5 font-medium tabular-nums">{GEL(p.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>გადმორიცხვების ისტორია</CardTitle>
            </CardHeader>
            {cod.history.length === 0 ? (
              <CardContent className="text-sm text-muted-foreground">ჯერ არაფერი.</CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-5 py-2 font-medium">თარიღი</th>
                      <th className="px-5 py-2 font-medium">შეკვეთა</th>
                      <th className="px-5 py-2 font-medium">გადმორიცხული</th>
                      <th className="px-5 py-2 font-medium">მეთოდი</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cod.history.map((h) => (
                      <tr key={h.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-2.5">{fmtDate(h.createdAt)}</td>
                        <td className="px-5 py-2.5 tabular-nums">{h.orderCount}</td>
                        <td className="px-5 py-2.5 font-medium tabular-nums">{GEL(h.net)}</td>
                        <td className="px-5 py-2.5 text-muted-foreground">{h.method ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
