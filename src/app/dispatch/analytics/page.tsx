"use client";

import useSWR from "swr";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/stat";
import { jsonFetcher } from "@/lib/fetcher";
import { GEL, ORDER_STATUS_LABEL } from "@/lib/domain";
import type { OrderStatus } from "@prisma/client";

interface Analytics {
  days: { label: string; orders: number; delivered: number; revenue: number }[];
  totals: {
    orders: number;
    delivered: number;
    revenue: number;
    companyEarnings: number;
    codCommission: number;
    driverPay: number;
    avgMinutes: number;
    completionRate: number;
  };
  statusCount: Record<string, number>;
  topDrivers: { name: string; deliveries: number; rating: number }[];
}

const AXIS = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

export default function AnalyticsPage() {
  const { data, isLoading } = useSWR<Analytics>("/api/dispatch/analytics", jsonFetcher, {
    refreshInterval: 60000,
  });

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="ანალიტიკა" />
        <p className="text-sm text-muted-foreground">იტვირთება…</p>
      </>
    );
  }

  const { totals } = data;

  return (
    <>
      <PageHeader title="ანალიტიკა" description="ბოლო 14 დღე" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="შეკვეთა" value={String(totals.orders)} />
        <Stat label="ჩაბარებული" value={String(totals.delivered)} sub={`${totals.completionRate}% ჩაბარების მაჩვენებელი`} />
        <Stat label="ბრუნვა (ჩაბარებული)" value={GEL(totals.revenue)} />
        <Stat label="საშ. მიტანა" value={`${totals.avgMinutes} წთ`} />
        <Stat label="კომპანიის წილი" value={GEL(totals.companyEarnings)} sub="მიტანის მარჟა + COD საკომისიო" />
        <Stat label="კურიერების ანაზღაურება" value={GEL(totals.driverPay)} sub="დარიცხული ამ პერიოდში" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>შეკვეთები დღეების მიხედვით</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.days} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                />
                <Bar dataKey="orders" name="შეკვეთა" fill="hsl(var(--accent))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="delivered" name="ჩაბარებული" fill="#93c5be" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>შემოსავალი დღეში</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.days} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number) => GEL(v)}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="შემოსავალი"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>სტატუსების განაწილება</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(data.statusCount)
              .sort((a, b) => b[1] - a[1])
              .map(([s, n]) => (
                <div key={s} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {ORDER_STATUS_LABEL[s as OrderStatus] ?? s}
                  </span>
                  <span className="font-medium tabular-nums">{n}</span>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>საუკეთესო კურიერები</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topDrivers.length === 0 && (
              <p className="text-sm text-muted-foreground">ჯერ არ არის მონაცემი.</p>
            )}
            {data.topDrivers.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <span>{d.name}</span>
                <span className="text-muted-foreground">
                  {d.deliveries} მიტანა · ★ {d.rating.toFixed(1)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
