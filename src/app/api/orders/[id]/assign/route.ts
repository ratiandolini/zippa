import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { assignDriverSchema } from "@/lib/validation";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { notify, notifyDriver } from "@/lib/notify";
import { streetOf } from "@/lib/domain";

export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    const { driverId } = assignDriverSchema.parse(await req.json());

    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (!["PENDING", "ASSIGNED", "FAILED"].includes(order.status))
      throw new ApiError(409, "ამ შეკვეთას კურიერს ვეღარ მიანიჭებ");
    if (order.needsManualReview)
      throw new ApiError(409, "ჯერ დისპეჩერმა ფასი უნდა დაადასტუროს („ფასის შესწორება“)");

    const driver = await prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: { user: { select: { name: true } } },
    });
    if (!driver || !driver.isApproved) throw new ApiError(400, "კურიერი არ არის ხელმისაწვდომი");

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: order.id },
        data: {
          driverId,
          status: "ASSIGNED",
          assignedAt: new Date(),
          events: {
            create: {
              status: "ASSIGNED",
              note: `კურიერი: ${driver.user.name}`,
              actorId: session.sub,
            },
          },
        },
        include: orderInclude,
      });
      await tx.driverProfile.update({ where: { id: driverId }, data: { status: "BUSY" } });
      return o;
    });

    await Promise.all([
      notify(order.customerId, {
        title: "კურიერს ვეძებთ",
        body: `${order.trackingNumber} — კურიერს ვთხოვეთ დადასტურება`,
        data: { orderId: order.id },
      }),
      notifyDriver(driverId, {
        title: "ახალი შემოთავაზება",
        body: `${order.trackingNumber} — ${streetOf(order.pickupAddress)} · დაადასტურე ან უარყავი`,
        data: { orderId: order.id },
      }),
    ]);

    return ok({ order: serializeOrder(updated) });
  });
}
