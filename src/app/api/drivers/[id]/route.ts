import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { ACTIVE_ORDER_STATUSES } from "@/lib/domain";

const schema = z.object({
  isApproved: z.boolean().optional(),
  vehicleType: z.enum(["BIKE", "MOTORCYCLE", "CAR", "VAN"]).optional(),
  vehicleNumber: z.string().trim().max(20).optional(),
  cityId: z.string().cuid().nullable().optional(),
});

export function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const d = await prisma.driverProfile.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { name: true, phone: true, email: true, isActive: true } },
        city: { select: { name: true } },
        payouts: { orderBy: { createdAt: "desc" }, take: 10 },
        settlements: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!d) return fail(404, "კურიერი ვერ მოიძებნა");
    const unsettled = await prisma.driverEarning.aggregate({
      where: { driverId: d.id, isSettled: false },
      _sum: { driverAmount: true },
      _count: true,
    });
    const earnings = await prisma.driverEarning.findMany({
      where: { driverId: d.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { order: { select: { trackingNumber: true, status: true } } },
    });
    const reviews = await prisma.review.findMany({
      where: { driverId: d.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        order: { select: { trackingNumber: true } },
      },
    });
    return ok({
      driver: {
        id: d.id,
        name: d.user.name,
        phone: d.user.phone,
        email: d.user.email,
        city: d.city?.name ?? null,
        cityId: d.cityId,
        isActive: d.user.isActive ?? true,
        vehicleType: d.vehicleType,
        vehicleNumber: d.vehicleNumber,
        isApproved: d.isApproved,
        status: d.status,
        rating: d.ratingAvg,
        ratingCount: d.ratingCount,
        totalDeliveries: d.totalDeliveries,
        cashOnHand: Number(d.cashOnHand),
        unpaidEarnings: Number(d.unpaidEarnings),
        unsettledEarningsSum: Number(unsettled._sum.driverAmount ?? 0),
        unsettledEarningsCount: unsettled._count,
        payouts: d.payouts.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          note: p.note,
          createdAt: p.createdAt.toISOString(),
        })),
        settlements: d.settlements.map((s) => ({
          id: s.id,
          amount: Number(s.amount),
          note: s.note,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
        })),
        earnings: earnings.map((e) => ({
          id: e.id,
          trackingNumber: e.order?.trackingNumber ?? null,
          orderStatus: e.order?.status ?? null,
          driverAmount: Number(e.driverAmount),
          collectedInCash: e.collectedInCash,
          isSettled: e.isSettled,
          createdAt: e.createdAt.toISOString(),
        })),
        reviews: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          trackingNumber: r.order?.trackingNumber ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      },
    });
  });
}

export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const body = schema.parse(await req.json());

    const dp = await prisma.driverProfile.findUnique({ where: { id: params.id } });
    if (!dp) return fail(404, "კურიერი ვერ მოიძებნა");
    const wasApproved = dp.isApproved;

    const updated = await prisma.driverProfile.update({
      where: { id: params.id },
      data: {
        ...(body.isApproved != null ? { isApproved: body.isApproved } : {}),
        ...(body.vehicleType ? { vehicleType: body.vehicleType } : {}),
        ...(body.vehicleNumber !== undefined ? { vehicleNumber: body.vehicleNumber } : {}),
        ...(body.cityId !== undefined ? { cityId: body.cityId } : {}),
      },
    });

    if (!wasApproved && updated.isApproved) {
      await notify(updated.userId, {
        type: "SYSTEM",
        title: "პროფილი დამტკიცდა",
        body: "შეგიძლია ჩაირთო ხაზზე და მიიღო შეკვეთები.",
      });
    }

    return ok({ ok: true });
  });
}

// კურიერის დეაქტივაცია (ანგარიშის გაუქმება). ?payout=1 → ჯერ გადაუხდის დარჩენილ ანაზღაურებას.
export function DELETE(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    const payoutFirst = new URL(req.url).searchParams.get("payout") === "1";

    const dp = await prisma.driverProfile.findUnique({ where: { id: params.id } });
    if (!dp) return fail(404, "კურიერი ვერ მოიძებნა");

    const activeCount = await prisma.order.count({
      where: { driverId: dp.id, status: { in: ACTIVE_ORDER_STATUSES } },
    });
    if (activeCount > 0)
      throw new ApiError(409, "კურიერს აქვს მიმდინარე შეკვეთა — ჯერ გადაანაწილე ან დაასრულე");

    const unpaid = Number(dp.unpaidEarnings);
    const cash = Number(dp.cashOnHand);
    if (cash > 0.01)
      throw new ApiError(409, `კურიერს ხელზე აქვს ${cash} ₾ ნაღდი — ჯერ დაადასტურე ჩაბარება`);
    if (unpaid > 0.01 && !payoutFirst)
      throw new ApiError(409, `კურიერს ერგება ${unpaid} ₾ ანაზღაურება — გადაუხადე ან დაადასტურე`);

    await prisma.$transaction(async (tx) => {
      if (unpaid > 0.01 && payoutFirst) {
        const earnings = await tx.driverEarning.findMany({
          where: { driverId: dp.id, isSettled: false },
          orderBy: { createdAt: "asc" },
        });
        await tx.payout.create({
          data: {
            driverId: dp.id,
            amount: unpaid,
            note: "დეაქტივაცია — საბოლოო ანგარიშსწორება",
            periodFrom: earnings[0]?.createdAt ?? new Date(),
            periodTo: earnings[earnings.length - 1]?.createdAt ?? new Date(),
            createdById: session.sub,
          },
        });
        await tx.driverEarning.updateMany({
          where: { driverId: dp.id, isSettled: false },
          data: { isSettled: true },
        });
      }
      await tx.driverProfile.update({
        where: { id: dp.id },
        data: { status: "OFFLINE", isApproved: false, unpaidEarnings: 0 },
      });
      await tx.user.update({
        where: { id: dp.userId },
        data: { isActive: false, tokenVersion: { increment: 1 } },
      });
    });

    return ok({ ok: true, paidOut: unpaid > 0.01 && payoutFirst ? unpaid : 0 });
  });
}
