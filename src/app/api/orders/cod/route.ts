import { prisma } from "@/lib/db";
import { requireRole, handle, ok } from "@/lib/api";

const n = (v: unknown) => Number(v);

// მომხმარებლის COD — მისაღები (ჩაბარებული, ჯერ გადაურიცხავი) მინუს დავალიანება + ისტორია
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
        trackingNumber: true,
        collectAmount: true,
        codCommission: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: "desc" },
    });

    const charges = await prisma.order.findMany({
      where: {
        customerId: session.sub,
        chargeSettledAt: null,
        OR: [{ returnFee: { gt: 0 } }, { cancelFee: { gt: 0 } }],
      },
      select: { trackingNumber: true, returnFee: true, cancelFee: true, failureReason: true },
    });

    const creditRows = await prisma.customerAdjustment.findMany({
      where: { customerId: session.sub, settledAt: null },
      select: { amount: true, kind: true, reason: true, order: { select: { trackingNumber: true } } },
    });

    const history = await prisma.codRemittance.findMany({
      where: { customerId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const gross = pending.reduce((s, o) => s + n(o.collectAmount), 0);
    const commission = pending.reduce((s, o) => s + n(o.codCommission), 0);
    const chargesTotal = charges.reduce((s, o) => s + n(o.returnFee) + n(o.cancelFee), 0);
    const creditsTotal = creditRows.reduce((s, a) => s + n(a.amount), 0);

    return ok({
      outstandingNet: Math.round((gross - commission - chargesTotal + creditsTotal) * 100) / 100,
      outstandingCount: pending.length,
      chargesTotal: Math.round(chargesTotal * 100) / 100,
      creditsTotal: Math.round(creditsTotal * 100) / 100,
      credits: creditRows.map((a) => ({
        trackingNumber: a.order?.trackingNumber ?? null,
        amount: n(a.amount),
        reason: a.reason,
      })),
      charges: charges.map((c) => ({
        trackingNumber: c.trackingNumber,
        amount: Math.round((n(c.returnFee) + n(c.cancelFee)) * 100) / 100,
        reason: n(c.returnFee) > 0 ? "დაბრუნება" : "გაუქმება",
      })),
      pending: pending.map((o) => ({
        trackingNumber: o.trackingNumber,
        collectAmount: n(o.collectAmount),
        commission: n(o.codCommission),
        net: Math.round((n(o.collectAmount) - n(o.codCommission)) * 100) / 100,
        deliveredAt: o.deliveredAt?.toISOString() ?? null,
      })),
      history: history.map((r) => ({
        id: r.id,
        gross: n(r.grossAmount),
        commission: n(r.commission),
        charges: n(r.chargesDeducted),
        credits: n(r.creditsAdded),
        net: n(r.netAmount),
        orderCount: r.orderCount,
        method: r.method,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });
}
