import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { reviewSchema } from "@/lib/validation";
import { notifyDriver } from "@/lib/notify";

export function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireRole("CUSTOMER");
    const { rating, comment } = reviewSchema.parse(await req.json());

    const order = await prisma.order.findUnique({ where: { id: params.id }, include: { review: true } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (order.customerId !== session.sub) return fail(403, "წვდომა აკრძალულია");
    if (order.status !== "DELIVERED") throw new ApiError(409, "შეფასება მხოლოდ ჩაბარების შემდეგ");
    if (order.review) throw new ApiError(409, "შეფასება უკვე დატოვე");
    if (!order.driverId) throw new ApiError(409, "შეკვეთას კურიერი არ ჰყავდა");

    await prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          orderId: order.id,
          authorId: session.sub,
          driverId: order.driverId!,
          rating,
          comment,
        },
      });
      const agg = await tx.review.aggregate({
        where: { driverId: order.driverId! },
        _avg: { rating: true },
        _count: true,
      });
      await tx.driverProfile.update({
        where: { id: order.driverId! },
        data: {
          ratingAvg: Math.round((agg._avg.rating ?? 5) * 100) / 100,
          ratingCount: agg._count,
        },
      });
    });

    await notifyDriver(order.driverId, {
      type: "SYSTEM",
      title: `მიიღე შეფასება: ${rating}★`,
      body: comment || `შეკვეთა ${order.trackingNumber}`,
    });

    return ok({ ok: true }, 201);
  });
}
