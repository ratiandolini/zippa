"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { jsonFetcher, api } from "@/lib/fetcher";
import { useSettlements, useDispatchCod } from "@/lib/hooks";
import { GEL, fmtDate, fmtDateTime } from "@/lib/domain";

interface Row {
  driverId: string;
  name: string;
  phone: string;
  deliveries: number;
  earnedInPeriod: number;
  companyInPeriod: number;
  paidInPeriod: number;
  remittedInPeriod: number;
  unpaidEarnings: number;
  cashOnHand: number;
  lastPayoutAt: string | null;
  lastPayoutAmount: number | null;
}
interface Payroll {
  period: string;
  rows: Row[];
  totals: {
    earned: number;
    company: number;
    paid: number;
    remitted: number;
    unpaidNow: number;
    cashOutNow: number;
  };
}

const PERIODS = [
  { key: "week", label: "ეს კვირა" },
  { key: "month", label: "ეს თვე" },
  { key: "all", label: "მთელი პერიოდი" },
];

export default function PayrollPage() {
  const [period, setPeriod] = useState("week");
  const { data, isLoading, mutate } = useSWR<Payroll>(
    `/api/dispatch/payroll?period=${period}`,
    jsonFetcher,
    { refreshInterval: 20000 },
  );
  const { settlements: pending, mutate: mutatePending } = useSettlements("", 12000);
  const { outstanding: cod, history: codHistory, mutate: mutateCod } = useDispatchCod();

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function payCod(customerId: string, name: string, net: number) {
    const msg =
      net >= 0
        ? `${name}: გადავრიცხოთ ${GEL(net)}. მეთოდი (მაგ. ბანკი):`
        : `${name}: გამგზავნი გვმართებს ${GEL(-net)}. ჩაწერე როგორ გასწორდა (მაგ. მიიღო ნაღდი / ჩამოიწერა):`;
    const method = prompt(msg, net >= 0 ? "ბანკი" : "მიიღო ნაღდი");
    if (method === null) return;
    setBusy("cod" + customerId);
    setErr(null);
    try {
      await api("/api/dispatch/cod", "POST", { customerId, method: method || undefined });
      mutateCod();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
    }
  }

  async function reviewCash(id: string, action: "CONFIRM" | "REJECT") {
    setBusy("cash" + id + action);
    setErr(null);
    try {
      await api(`/api/settlements/${id}`, "PATCH", { action });
      mutatePending();
      mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
    }
  }

  async function payFull(r: Row) {
    if (r.unpaidEarnings <= 0) return;
    if (!confirm(`${r.name}: გადავიხადოთ ${GEL(r.unpaidEarnings)}?`)) return;
    setBusy("pay" + r.driverId);
    setErr(null);
    try {
      await api(`/api/drivers/${r.driverId}/payout`, "POST", { amount: r.unpaidEarnings });
      mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
    }
  }

  const t = data?.totals;

  return (
    <>
      <PageHeader title="ანგარიშსწორება" description="კურიერების ანაზღაურება და ნაღდის მიღება" />

      {err && <p className="mb-4 text-sm text-destructive">{err}</p>}

      {pending.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle>ნაღდის მიღება — დასადასტურებელი ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
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
                  <Button size="sm" disabled={busy != null} onClick={() => reviewCash(s.id, "CONFIRM")}>
                    {busy === "cash" + s.id + "CONFIRM" ? "…" : "მივიღე ნაღდი"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy != null}
                    onClick={() => reviewCash(s.id, "REJECT")}
                  >
                    {busy === "cash" + s.id + "REJECT" ? "…" : "თანხა არ ემთხვევა"}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={
              "rounded-full border px-3 py-1 text-sm " +
              (period === p.key
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:border-border")
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {t && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="კურიერების ანაზღაურება" value={GEL(t.earned)} sub="პერიოდში დარიცხული" />
          <Tile label="კომპანიის წილი" value={GEL(t.company)} sub="პერიოდში" />
          <Tile label="გადახდილი კურიერებზე" value={GEL(t.paid)} sub="პერიოდში" />
          <Tile label="მიღებული ნაღდი" value={GEL(t.remitted)} sub="პერიოდში" />
          <Tile label="დარჩენილი გადასახდელი" value={GEL(t.unpaidNow)} sub="ახლა, ყველა კურიერი" />
          <Tile label="კურიერებთან ნაღდი" value={GEL(t.cashOutNow)} sub="ჯერ არ ჩაბარებული" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>კურიერების ცხრილი</CardTitle>
        </CardHeader>
        {isLoading && <CardContent className="text-sm text-muted-foreground">იტვირთება…</CardContent>}
        {data && data.rows.length === 0 && (
          <CardContent className="text-sm text-muted-foreground">ამ პერიოდში აქტივობა არ ყოფილა.</CardContent>
        )}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th className="text-left">კურიერი</th>
                  <th className="text-right">მიტანა</th>
                  <th className="text-right">ანაზღაურება</th>
                  <th className="text-right">გადახდილი</th>
                  <th className="text-right">ჩააბარა ნაღდი</th>
                  <th className="text-right">გადასახდელი ახლა</th>
                  <th className="text-right">ხელზე ნაღდი</th>
                  <th className="text-left">ბოლო გადახდა</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={r.driverId}
                    className="border-b border-border last:border-0 [&>td]:whitespace-nowrap [&>td]:px-4 [&>td]:py-3"
                  >
                    <td>
                      <Link href={`/dispatch/drivers/${r.driverId}`} className="font-medium hover:text-accent">
                        {r.name}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{r.deliveries}</td>
                    <td className="text-right tabular-nums">{GEL(r.earnedInPeriod)}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{GEL(r.paidInPeriod)}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{GEL(r.remittedInPeriod)}</td>
                    <td className="text-right font-medium tabular-nums">{GEL(r.unpaidEarnings)}</td>
                    <td className="text-right tabular-nums">
                      {r.cashOnHand > 0 ? GEL(r.cashOnHand) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {r.lastPayoutAt
                        ? `${fmtDate(r.lastPayoutAt)} · ${GEL(r.lastPayoutAmount ?? 0)}`
                        : "—"}
                    </td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy != null || r.unpaidEarnings <= 0}
                        onClick={() => payFull(r)}
                      >
                        {busy === "pay" + r.driverId ? "…" : "გადახდა"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        „გადახდა" ფარავს კურიერის მთელ დარჩენილ ანაზღაურებას. ნაწილობრივი გადახდისთვის გახსენი კურიერის გვერდი.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>გამგზავნებზე თანხის ჩარიცხვა</CardTitle>
        </CardHeader>
        {cod.length === 0 ? (
          <CardContent className="text-sm text-muted-foreground">გასასწორებელი არაფერია.</CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">გამგზავნი</th>
                  <th className="px-4 py-2 font-medium">შეკვეთა</th>
                  <th className="px-4 py-2 font-medium">კურიერმა აიღო</th>
                  <th className="px-4 py-2 font-medium">საკომისიო</th>
                  <th className="px-4 py-2 font-medium">დავალიანება</th>
                  <th className="px-4 py-2 font-medium">ჩასარიცხი</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {cod.map((r) => (
                  <tr key={r.customerId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      {r.name}
                      <div className="text-xs text-muted-foreground">{r.phone}</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.count}</td>
                    <td className="px-4 py-3 tabular-nums">{GEL(r.gross)}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {r.commission > 0 ? `−${GEL(r.commission)}` : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {r.charges > 0 ? `−${GEL(r.charges)}` : "—"}
                    </td>
                    <td
                      className={
                        "px-4 py-3 font-medium tabular-nums " + (r.net < 0 ? "text-destructive" : "")
                      }
                    >
                      {r.net >= 0 ? GEL(r.net) : `გვმართებს ${GEL(-r.net)}`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy != null}
                        onClick={() => payCod(r.customerId, r.name, r.net)}
                      >
                        {busy === "cod" + r.customerId
                          ? "…"
                          : r.net >= 0
                            ? "გადარიცხვა"
                            : "გასწორება"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {codHistory.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>ჩარიცხვების ისტორია</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">თარიღი</th>
                  <th className="px-4 py-2 font-medium">გამგზავნი</th>
                  <th className="px-4 py-2 font-medium">შეკვეთა</th>
                  <th className="px-4 py-2 font-medium">გადარიცხული</th>
                  <th className="px-4 py-2 font-medium">მეთოდი</th>
                </tr>
              </thead>
              <tbody>
                {codHistory.map((h) => (
                  <tr key={h.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{fmtDate(h.createdAt)}</td>
                    <td className="px-4 py-3">{h.customerName}</td>
                    <td className="px-4 py-3 tabular-nums">{h.orderCount}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">{GEL(h.net)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{h.method ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-serif text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
