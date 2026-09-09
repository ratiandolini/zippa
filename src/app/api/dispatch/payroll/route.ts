import { prisma } from "@/lib/db";
import { requireRole, handle, ok } from "@/lib/api";

// კურიერების ანგარიშსწორება — პერიოდის ჭრილში + მიმდინარე ბალანსები
export function GET(req: Request) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const period = new URL(req.url).searchParams.get("period") ?? "week";

    const from = new Date();
    if (period === "week") from.setDate(from.getDate() - 7);
    else if (period === "month") from.setDate(from.getDate() - 30);
    else from.setFullYear(2000); // "all"
    from.setHours(0, 0, 0, 0);
    const inPeriod = { gte: from };

    const drivers = await prisma.driverProfile.findMany({
      where: { isApproved: true },
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { user: { name: "asc" } },
    });

    const [earnings, deliveryCounts, payouts, settlements] = await Promise.all([
      prisma.driverEarning.groupBy({
        by: ["driverId"],
        where: { createdAt: inPeriod },
        _sum: { driverAmount: true, companyAmount: true },
      }),
      // „მიტანა" — მხოლოდ ჩაბარებული (ჩაშლის/გაუქმების ანაზღაურება არ ითვლება)
      prisma.driverEarning.groupBy({
        by: ["driverId"],
        where: { createdAt: inPeriod, kind: "DELIVERY" },
        _count: true,
      }),
      prisma.payout.groupBy({
        by: ["driverId"],
        where: { createdAt: inPeriod },
        _sum: { amount: true },
      }),
      prisma.cashSettlement.groupBy({
        by: ["driverId"],
        where: { status: "CONFIRMED", confirmedAt: inPeriod },
        _sum: { amount: true },
      }),
    ]);
    const lastPayouts = await prisma.payout.findMany({
      where: { driverId: { in: drivers.map((d) => d.id) } },
      orderBy: { createdAt: "desc" },
      distinct: ["driverId"],
      select: { driverId: true, amount: true, createdAt: true },
    });

    const eMap = new Map(earnings.map((e) => [e.driverId, e]));
    const dcMap = new Map(deliveryCounts.map((e) => [e.driverId, e._count]));
    const pMap = new Map(payouts.map((p) => [p.driverId, Number(p._sum.amount ?? 0)]));
    const sMap = new Map(settlements.map((s) => [s.driverId, Number(s._sum.amount ?? 0)]));
    const lpMap = new Map(lastPayouts.map((p) => [p.driverId, p]));

    const rows = drivers.map((d) => {
      const e = eMap.get(d.id);
      const lp = lpMap.get(d.id);
      return {
        driverId: d.id,
        name: d.user.name,
        phone: d.user.phone,
        deliveries: dcMap.get(d.id) ?? 0,
        earnedInPeriod: Math.round(Number(e?._sum.driverAmount ?? 0) * 100) / 100,
        companyInPeriod: Math.round(Number(e?._sum.companyAmount ?? 0) * 100) / 100,
        paidInPeriod: Math.round((pMap.get(d.id) ?? 0) * 100) / 100,
        remittedInPeriod: Math.round((sMap.get(d.id) ?? 0) * 100) / 100,
        unpaidEarnings: Number(d.unpaidEarnings),
        cashOnHand: Number(d.cashOnHand),
        lastPayoutAt: lp?.createdAt.toISOString() ?? null,
        lastPayoutAmount: lp ? Number(lp.amount) : null,
      };
    });

    const totals = {
      earned: rows.reduce((s, r) => s + r.earnedInPeriod, 0),
      company: rows.reduce((s, r) => s + r.companyInPeriod, 0),
      paid: rows.reduce((s, r) => s + r.paidInPeriod, 0),
      remitted: rows.reduce((s, r) => s + r.remittedInPeriod, 0),
      unpaidNow: rows.reduce((s, r) => s + r.unpaidEarnings, 0),
      cashOutNow: rows.reduce((s, r) => s + r.cashOnHand, 0),
    };

    return ok({
      period,
      rows: rows.filter((r) => r.deliveries > 0 || r.unpaidEarnings > 0 || r.cashOnHand > 0),
      totals: Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [k, Math.round(v * 100) / 100]),
      ),
    });
  });
}
