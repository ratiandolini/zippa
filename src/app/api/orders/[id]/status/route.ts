import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { updateStatusSchema } from "@/lib/validation";
import { DRIVER_NEXT_STATUS } from "@/lib/domain";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { notify, notifyDispatchers } from "@/lib/notify";
import { sendSms, smsTemplates } from "@/lib/sms";
import type { OrderStatus } from "@prisma/client";

const CUSTOMER_MSG: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "კურიერი დაინიშნა",
  PICKED_UP: "კურიერმა აიღო ამანათი",
  IN_TRANSIT: "ამანათი გზაშია",
  DELIVERED: "ამანათი ჩაბარდა 🎉",
  FAILED: "მიტანა ვერ შესრულდა",
  CANCELLED: "შეკვეთა გაუქმდა",
};

export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser();
    const body = updateStatusSchema.parse(await req.json());

    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");

    const driver =
      session.role === "DRIVER"
        ? await prisma.driverProfile.findUnique({ where: { userId: session.sub } })
        : null;

    const isDispatcher = session.role === "DISPATCHER";
    const isOwnerDriver = driver && order.driverId === driver.id;
    const isCustomerCancel =
      session.role === "CUSTOMER" &&
      order.customerId === session.sub &&
      body.status === "CANCELLED" &&
      order.status === "PENDING";

    if (!isDispatcher && !isOwnerDriver && !isCustomerCancel)
      return fail(403, "წვდომა აკრძალულია");

    // კურიერისთვის — გადასვლების შემოწმება
    if (isOwnerDriver && !isDispatcher) {
      const allowed = DRIVER_NEXT_STATUS[order.status as OrderStatus] ?? [];
      if (!allowed.includes(body.status as OrderStatus))
        throw new ApiError(409, `სტატუსი ${order.status}-დან ${body.status}-ზე ვერ გადავა`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: order.id },
        data: {
          status: body.status,
          ...(body.status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
          ...(body.status === "DELIVERED" && order.paymentMethod === "CASH"
            ? { paymentStatus: "PAID" }
            : {}),
          events: {
            create: {
              status: body.status,
              note: body.note,
              lat: body.lat,
              lng: body.lng,
              actorId: session.sub,
            },
          },
        },
        include: orderInclude,
      });

      if (body.status === "DELIVERED" && order.driverId) {
        const gross = Number(order.totalPrice);
        const driverAmount = Number(order.driverFee); // სნეპშოტი შეკვეთის შექმნიდან
        const companyAmount = Math.round((gross - driverAmount) * 100) / 100;
        const cash = order.paymentMethod === "CASH";

        await tx.driverEarning.create({
          data: {
            driverId: order.driverId,
            orderId: order.id,
            grossPrice: gross,
            driverAmount,
            companyAmount,
            collectedInCash: cash,
          },
        });
        await tx.driverProfile.update({
          where: { id: order.driverId },
          data: {
            totalDeliveries: { increment: 1 },
            unpaidEarnings: { increment: driverAmount },
            ...(cash ? { cashOnHand: { increment: Number(order.codAmount) } } : {}),
            status: "AVAILABLE",
          },
        });
      }

      if ((body.status === "FAILED" || body.status === "CANCELLED") && order.driverId) {
        await tx.driverProfile.update({
          where: { id: order.driverId },
          data: { status: "AVAILABLE" },
        });
      }

      return o;
    });

    const msg = CUSTOMER_MSG[body.status as OrderStatus];
    if (msg) {
      const driverName =
        body.status === "ACCEPTED" ? updated.driver?.user.name ?? null : null;
      await notify(order.customerId, {
        title: msg,
        body: driverName
          ? `${driverName} · შეკვეთა ${order.trackingNumber}`
          : `შეკვეთა ${order.trackingNumber}`,
        data: { orderId: order.id },
      });
    }
    if (body.status === "FAILED") {
      await notifyDispatchers({
        title: "მიტანა ჩაიშალა",
        body: `${order.trackingNumber}${body.note ? ` — ${body.note}` : ""}`,
        data: { orderId: order.id },
      });
    }

    // SMS მიმღებს/ამგზავნს (ანგარიში არ სჭირდებათ)
    if (body.status === "IN_TRANSIT") {
      void sendSms(order.recipientPhone, smsTemplates.onTheWay(order.trackingNumber));
    }
    if (body.status === "DELIVERED") {
      void sendSms(order.senderPhone, smsTemplates.delivered(order.trackingNumber));
    }

    return ok({ order: serializeOrder(updated) });
  });
}
