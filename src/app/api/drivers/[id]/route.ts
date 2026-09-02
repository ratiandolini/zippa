import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail } from "@/lib/api";
import { notify } from "@/lib/notify";

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
        user: { select: { name: true, phone: true, email: true } },
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
          createdAt: s.createdAt.toISOString(),
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
