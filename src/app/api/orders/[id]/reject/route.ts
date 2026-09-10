import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { notifyDispatchers } from "@/lib/notify";
import { streetOf } from "@/lib/domain";

// კურიერი უარს ამბობს მინიჭებულ შეკვეთაზე → უბრუნდება „მოლოდინში"
export function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser();
    if (session.role !== "DRIVER") return fail(403, "წვდომა აკრძალულია");

    const dp = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (!dp || order.driverId !== dp.id) return fail(403, "ეს შეკვეთა თქვენ არ გებარებათ");
    if (order.status !== "ASSIGNED") {
      throw new ApiError(409, "უარი შესაძლებელია მხოლოდ დადასტურებამდე");
    }

    const body = (await req.json().catch(() => ({}))) as { note?: string };

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: order.id },
        data: {
          driverId: null,
          status: "PENDING",
          assignedAt: null,
          events: {
            create: {
              status: "PENDING",
              note: `კურიერმა უარი თქვა${body.note ? ` — ${body.note}` : ""}`,
              actorId: session.sub,
            },
          },
        },
        include: orderInclude,
      });
      await tx.driverProfile.update({ where: { id: dp.id }, data: { status: "AVAILABLE" } });
      return o;
    });

    await notifyDispatchers({
      title: "კურიერმა უარი თქვა",
      body: `${order.trackingNumber} — ${streetOf(order.pickupAddress)} · ხელახლა მიაბით`,
      data: { orderId: order.id },
    });

    return ok({ order: serializeOrder(updated, "DRIVER") });
  });
}
