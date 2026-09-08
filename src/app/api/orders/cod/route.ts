import { prisma } from "@/lib/db";
import { requireRole, handle, ok } from "@/lib/api";

// მომხმარებლის COD — მისაღები (ჩაბარებული, ჯერ გადაურიცხავი) + ისტორია
export function GET() {
  return handle(async () => {
    const session = await requireRole("CUSTOMER");

    const pending = await prisma.order.findMany({
      where: {
        customerId: session.sub,
        status: "DELIVERED",
        collectAmount: { gt: 0 },
        codRemittanceId: null,
      },
      select: {
        id: true,
        trackingNumber: true,
        collectAmount: true,
        codCommission: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: "desc" },
    });

    const history = await prisma.codRemittance.findMany({
      where: { customerId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const gross = pending.reduce((s, o) => s + Number(o.collectAmount), 0);
    const commission = pending.reduce((s, o) => s + Number(o.codCommission), 0);

    return ok({
      outstandingNet: Math.round((gross - commission) * 100) / 100,
      outstandingCount: pending.length,
      pending: pending.map((o) => ({
        trackingNumber: o.trackingNumber,
        collectAmount: Number(o.collectAmount),
        commission: Number(o.codCommission),
        net: Math.round((Number(o.collectAmount) - Number(o.codCommission)) * 100) / 100,
        deliveredAt: o.deliveredAt?.toISOString() ?? null,
      })),
      history: history.map((r) => ({
        id: r.id,
        gross: Number(r.grossAmount),
        commission: Number(r.commission),
        net: Number(r.netAmount),
        orderCount: r.orderCount,
        method: r.method,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });
}
