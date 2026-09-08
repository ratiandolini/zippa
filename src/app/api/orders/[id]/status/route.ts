import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { updateStatusSchema } from "@/lib/validation";
import {
  DRIVER_NEXT_STATUS,
  FREE_CANCEL_STATUSES,
  PAID_CANCEL_STATUSES,
  CANCEL_FEE_GEL,
  FAILED_TRIP_DRIVER_PCT,
  RETURN_FEE_PCT,
  DRIVER_FAULT_FAILURE,
  FAILURE_REASON_LABEL,
} from "@/lib/domain";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { notify, notifyDispatchers, notifyDriver } from "@/lib/notify";
import { sendSms, smsTemplates } from "@/lib/sms";
import type { OrderStatus } from "@prisma/client";

const CUSTOMER_MSG: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "კურიერი დაინიშნა",
  EN_ROUTE_PICKUP: "კურიერი მოდის ასაღებად",
  PICKED_UP: "კურიერმა აიღო ამანათი",
  IN_TRANSIT: "ამანათი გზაშია",
  DELIVERED: "ამანათი ჩაბარდა 🎉",
  FAILED: "მიტანა ვერ შესრულდა",
  CANCELLED: "შეკვეთა გაუქმდა",
};

const DISPATCHER_MSG: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "კურიერმა დაადასტურა შეკვეთა",
  PICKED_UP: "კურიერმა აიღო ამანათი",
  DELIVERED: "ამანათი ჩაბარდა",
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
      [...FREE_CANCEL_STATUSES, ...PAID_CANCEL_STATUSES].includes(order.status);
    // ამანათის აღების შემდეგ (PICKED_UP+) მომხმარებელი ვეღარ აუქმებს — მხოლოდ დაბრუნების მოთხოვნა (support)

    if (!isDispatcher && !isOwnerDriver && !isCustomerCancel)
      return fail(403, "წვდომა აკრძალულია");

    // მომხმარებლის გაუქმების საფასური — მხოლოდ თუ კურიერი უკვე გზაშია ასაღებად
    const cancelFee =
      isCustomerCancel && PAID_CANCEL_STATUSES.includes(order.status) ? CANCEL_FEE_GEL : 0;

    // კურიერისთვის — გადასვლების შემოწმება
    if (isOwnerDriver && !isDispatcher) {
      const allowed = DRIVER_NEXT_STATUS[order.status as OrderStatus] ?? [];
      if (!allowed.includes(body.status as OrderStatus))
        throw new ApiError(409, `სტატუსი ${order.status}-დან ${body.status}-ზე ვერ გადავა`);
    }

    if (body.status === "FAILED" && !body.failureReason)
      throw new ApiError(422, "მიუთითე ჩაშლის მიზეზი");

    // ── მიტანის ჩაშლა (RTO) — ფინანსური ლოგიკა ──
    const driverFault = body.failureReason
      ? DRIVER_FAULT_FAILURE.includes(body.failureReason)
      : false;
    const failedTripComp =
      body.status === "FAILED" && order.driverId && !driverFault
        ? Math.round(Number(order.driverFee) * FAILED_TRIP_DRIVER_PCT * 100) / 100
        : 0;
    const returnFee =
      body.status === "FAILED" && !driverFault
        ? Math.round(Number(order.deliveryPrice) * RETURN_FEE_PCT * 100) / 100
        : 0;

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: order.id },
        data: {
          status: body.status,
          ...(body.status === "CANCELLED" && cancelFee > 0 ? { cancelFee } : {}),
          ...(body.status === "FAILED"
            ? { failureReason: body.failureReason, returnFee }
            : {}),
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
            kind: "DELIVERY",
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

      // ჩაშლა — კურიერს ერიცხება დაკარგული სვლის კომპენსაცია (COD არ გროვდება)
      if (body.status === "FAILED" && order.driverId && failedTripComp > 0) {
        await tx.driverEarning.create({
          data: {
            driverId: order.driverId,
            orderId: order.id,
            kind: "FAILED_TRIP",
            grossPrice: returnFee,
            driverAmount: failedTripComp,
            companyAmount: Math.round((returnFee - failedTripComp) * 100) / 100,
            collectedInCash: false,
          },
        });
        await tx.driverProfile.update({
          where: { id: order.driverId },
          data: { unpaidEarnings: { increment: failedTripComp } },
        });
      }
      if (body.status === "CANCELLED" && order.assignedAt) {
        await tx.order.update({ where: { id: order.id }, data: { assignedAt: null } });
      }

      return o;
    });

    const st = body.status as OrderStatus;
    const driverName = updated.driver?.user.name ?? null;

    // ── მომხმარებელს (გამგზავნს) — აპში ──
    const cmsg = CUSTOMER_MSG[st];
    if (cmsg) {
      await notify(order.customerId, {
        title: cmsg,
        body:
          st === "ACCEPTED" && driverName
            ? `${driverName} · შეკვეთა ${order.trackingNumber}`
            : cancelFee > 0
              ? `შეკვეთა ${order.trackingNumber} · გაუქმების საფასური ${cancelFee} ₾`
              : st === "FAILED" && returnFee > 0
                ? `შეკვეთა ${order.trackingNumber} · ამანათი ბრუნდება · დაბრუნების საფასური ${returnFee} ₾`
                : `შეკვეთა ${order.trackingNumber}`,
        data: { orderId: order.id },
      });
    }

    // ── დისპეჩერს — აპში ──
    const dmsg = st === "FAILED" ? "მიტანა ჩაიშალა" : DISPATCHER_MSG[st];
    if (dmsg) {
      const reasonTxt =
        st === "FAILED" && body.failureReason ? ` · ${FAILURE_REASON_LABEL[body.failureReason]}` : "";
      await notifyDispatchers({
        title: dmsg,
        body: `${order.trackingNumber}${driverName ? ` — ${driverName}` : ""}${reasonTxt}${body.note ? ` · ${body.note}` : ""}${returnFee > 0 ? ` · დაბრუნება ${returnFee} ₾` : ""}`,
        data: { orderId: order.id },
      });
    }
    if (cancelFee > 0) {
      await notifyDispatchers({
        title: "გაუქმება საფასურით",
        body: `${order.trackingNumber} — მომხმარებელმა გააუქმა კურიერის გზაში-ყოფნისას, ${cancelFee} ₾ ასაკრები`,
        data: { orderId: order.id },
      });
    }

    // ── კურიერს — აპში (ჩაბარებისას) ──
    if (st === "DELIVERED" && order.driverId) {
      await notifyDriver(order.driverId, {
        title: "მიტანა დასრულდა",
        body: `${order.trackingNumber} — დაგერიცხა ${Number(order.driverFee)} ₾`,
        data: { orderId: order.id },
      });
    }
    if (st === "FAILED" && order.driverId) {
      await notifyDriver(order.driverId, {
        title: "მიტანა ჩაიშალა",
        body:
          failedTripComp > 0
            ? `${order.trackingNumber} — დაკარგული სვლის კომპენსაცია ${failedTripComp} ₾. ამანათი დააბრუნე.`
            : `${order.trackingNumber} — ამანათი დააბრუნე.`,
        data: { orderId: order.id },
      });
    }

    // ── SMS — გამგზავნსა და მიმღებს (ანგარიში არ სჭირდებათ; ფასიანია) ──
    if (st === "PICKED_UP") {
      void sendSms(order.senderPhone, smsTemplates.pickedUpForSender(order.trackingNumber));
      void sendSms(order.recipientPhone, smsTemplates.pickedUpForRecipient(order.trackingNumber));
    }
    if (st === "IN_TRANSIT" && order.status !== "PICKED_UP") {
      // მხოლოდ იმ შემთხვევაში, თუ PICKED_UP-ის SMS არ გაშვებულა (გამოტოვებული ნაბიჯი)
      void sendSms(order.recipientPhone, smsTemplates.onTheWay(order.trackingNumber));
    }
    if (st === "DELIVERED") {
      void sendSms(order.senderPhone, smsTemplates.delivered(order.trackingNumber));
      void sendSms(order.recipientPhone, smsTemplates.delivered(order.trackingNumber));
    }

    return ok({ order: serializeOrder(updated) });
  });
}
