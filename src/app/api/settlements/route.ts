import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole, handle, ok } from "@/lib/api";

// დისპეჩერი — ნაღდის ჩაბარებების სია (ნაგულისხმევად დაუდასტურებელი)
export function GET(req: Request) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const driverId = url.searchParams.get("driverId");

    const where: Prisma.CashSettlementWhereInput = {};
    if (status === "all") {
      // ყველა
    } else if (status) {
      where.status = status as Prisma.CashSettlementWhereInput["status"];
    } else {
      where.status = "PENDING";
    }
    if (driverId) where.driverId = driverId;

    const list = await prisma.cashSettlement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { driver: { include: { user: { select: { name: true, phone: true } } } } },
    });

    return ok({
      settlements: list.map((s) => ({
        id: s.id,
        driverId: s.driverId,
        driverName: s.driver.user.name,
        driverPhone: s.driver.user.phone,
        cashOnHand: Number(s.driver.cashOnHand),
        amount: Number(s.amount),
        note: s.note,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        confirmedAt: s.confirmedAt?.toISOString() ?? null,
      })),
    });
  });
}
