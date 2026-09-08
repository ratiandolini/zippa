import { prisma } from "@/lib/db";
import { requireRole, handle, ok } from "@/lib/api";
import { fmtDate } from "@/lib/domain";

export function GET() {
  return handle(async () => {
    await requireRole("DISPATCHER");

    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 13);
    from.setHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: from } },
      select: {
        createdAt: true,
        deliveredAt: true,
        status: true,
        totalPrice: true,
        codCommission: true,
      },
    });

    // დღიური სერია
    const days: { date: string; label: string; orders: number; delivered: number; revenue: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      days.push({
        date: d.toISOString().slice(0, 10),
        label: fmtDate(d),
        orders: 0,
        delivered: 0,
        revenue: 0,
      });
    }
    const idx = (iso: string) => days.findIndex((x) => x.date === iso.slice(0, 10));

    const statusCount: Record<string, number> = {};
    let totalRevenue = 0;
    let codCommissionTotal = 0;
    let deliveredCount = 0;
    let endedCount = 0; // DELIVERED + FAILED + CANCELLED

    for (const o of orders) {
      const ci = idx(o.createdAt.toISOString());
      if (ci >= 0) days[ci].orders++;
      statusCount[o.status] = (statusCount[o.status] ?? 0) + 1;
      if (["DELIVERED", "FAILED", "CANCELLED"].includes(o.status)) endedCount++;
      if (o.status === "DELIVERED" && o.deliveredAt) {
        const di = idx(o.deliveredAt.toISOString());
        if (di >= 0) {
          days[di].delivered++;
          days[di].revenue += Number(o.totalPrice);
        }
        totalRevenue += Number(o.totalPrice);
        codCommissionTotal += Number(o.codCommission);
        deliveredCount++;
      }
    }

    // საშ. მიტანის დრო (წუთი)
    const delivered = orders.filter((o) => o.status === "DELIVERED" && o.deliveredAt);
    const avgMinutes = delivered.length
      ? Math.round(
          delivered.reduce(
            (s, o) => s + (o.deliveredAt!.getTime() - o.createdAt.getTime()) / 60000,
            0,
          ) / delivered.length,
        )
      : 0;

    // კომპანიის წილი vs კურიერების ანაზღაურება (დარიცხული ამ პერიოდში)
    const earnings = await prisma.driverEarning.aggregate({
      where: { createdAt: { gte: from } },
      _sum: { companyAmount: true, driverAmount: true },
    });
    const companyEarnings = Math.round(Number(earnings._sum.companyAmount ?? 0) * 100) / 100;
    const driverPay = Math.round(Number(earnings._sum.driverAmount ?? 0) * 100) / 100;

    const topDrivers = await prisma.driverProfile.findMany({
      where: { totalDeliveries: { gt: 0 } },
      include: { user: { select: { name: true } } },
      orderBy: { totalDeliveries: "desc" },
      take: 5,
    });

    return ok({
      days: days.map((d) => ({ ...d, revenue: Math.round(d.revenue * 100) / 100 })),
      totals: {
        orders: orders.length,
        delivered: deliveredCount,
        revenue: Math.round(totalRevenue * 100) / 100,
        companyEarnings: Math.round((companyEarnings + codCommissionTotal) * 100) / 100,
        codCommission: Math.round(codCommissionTotal * 100) / 100,
        driverPay,
        avgMinutes,
        completionRate: endedCount ? Math.round((deliveredCount / endedCount) * 100) : 0,
      },
      statusCount,
      topDrivers: topDrivers.map((d) => ({
        name: d.user.name,
        deliveries: d.totalDeliveries,
        rating: d.ratingAvg,
      })),
    });
  });
}
