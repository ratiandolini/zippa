import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, handle, ok, ApiError } from "@/lib/api";
import { notify, notifyDriver } from "@/lib/notify";
import { streetOf } from "@/lib/domain";

const schema = z.object({
  orderIds: z.array(z.string().cuid()).min(1).max(20),
  driverId: z.string().cuid(),
});

const ASSIGNABLE = ["PENDING", "ASSIGNED", "FAILED"];

// რამდენიმე შეკვეთის ერთ კურიერზე მინიჭება ერთ ჯერზე (მარშრუტი)
export function POST(req: Request) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    const { orderIds, driverId } = schema.parse(await req.json());

    const driver = await prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: { user: { select: { name: true } } },
    });
    if (!driver || !driver.isApproved) throw new ApiError(400, "კურიერი არ არის ხელმისაწვდომი");

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, status: true, trackingNumber: true, customerId: true, pickupAddress: true },
    });
    const bad = orders.filter((o) => !ASSIGNABLE.includes(o.status));
    if (bad.length) throw new ApiError(409, `${bad.length} შეკვეთას კურიერს ვეღარ მიანიჭებ`);
    if (orders.length !== orderIds.length) throw new ApiError(404, "ზოგი შეკვეთა ვერ მოიძებნა");

    const now = new Date();
    await prisma.$transaction([
      ...orders.map((o) =>
        prisma.order.update({
          where: { id: o.id },
          data: {
            driverId,
            status: "ASSIGNED",
            assignedAt: now,
            events: {
              create: {
                status: "ASSIGNED",
                note: `მარშრუტი · კურიერი: ${driver.user.name}`,
                actorId: session.sub,
              },
            },
          },
        }),
      ),
      prisma.driverProfile.update({ where: { id: driverId }, data: { status: "BUSY" } }),
    ]);

    await notifyDriver(driverId, {
      title: `ახალი მარშრუტი — ${orders.length} შეკვეთა`,
      body: orders.map((o) => `${o.trackingNumber} · ${streetOf(o.pickupAddress)}`).join("\n"),
      url: "/driver/offers",
    });
    await Promise.all(
      orders.map((o) =>
        notify(o.customerId, {
          title: "კურიერს ვეძებთ",
          body: `${o.trackingNumber} — კურიერს ვთხოვეთ დადასტურება`,
          data: { orderId: o.id },
        }),
      ),
    );

    return ok({ ok: true, assigned: orders.length });
  });
}
