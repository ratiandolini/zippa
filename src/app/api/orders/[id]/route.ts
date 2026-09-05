import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { editOrderSchema } from "@/lib/validation";
import { calculatePrice, resolveCityId, estimateDelivery } from "@/lib/pricing";
import { notify, notifyDispatchers, notifyDriver } from "@/lib/notify";
import type { Prisma } from "@prisma/client";

// რომელ სტატუსებზეა შეკვეთის რედაქტირება დაშვებული
const EDITABLE_DISPATCHER = ["PENDING", "ASSIGNED", "ACCEPTED", "EN_ROUTE_PICKUP"];
const EDITABLE_CUSTOMER = ["PENDING"];

// დისპეჩერს შეუძლია წაშალოს მხოლოდ გაუქმებული/მონახაზი შეკვეთა (შეცდომით შექმნილი ან სატესტო)
export function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireUser().then((s) => {
      if (s.role !== "DISPATCHER") throw new ApiError(403, "წვდომა აკრძალულია");
    });
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (!["CANCELLED", "DRAFT"].includes(order.status)) {
      throw new ApiError(409, "მხოლოდ გაუქმებული შეკვეთის წაშლა შეიძლება");
    }
    await prisma.order.delete({ where: { id: order.id } });
    return ok({ deleted: true });
  });
}

export function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser();
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: orderInclude,
    });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");

    if (session.role === "CUSTOMER" && order.customerId !== session.sub)
      return fail(403, "წვდომა აკრძალულია");
    if (session.role === "DRIVER") {
      const dp = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
      if (order.driverId !== dp?.id) return fail(403, "წვდომა აკრძალულია");
    }

    return ok({ order: serializeOrder(order) });
  });
}

export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser();
    const data = editOrderSchema.parse(await req.json());

    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");

    const isDispatcher = session.role === "DISPATCHER";
    const isOwnerCustomer = session.role === "CUSTOMER" && order.customerId === session.sub;
    if (!isDispatcher && !isOwnerCustomer) return fail(403, "წვდომა აკრძალულია");

    const allowed = isDispatcher ? EDITABLE_DISPATCHER : EDITABLE_CUSTOMER;
    if (!allowed.includes(order.status)) {
      throw new ApiError(409, "ამ სტატუსში შეკვეთის რედაქტირება აღარ შეიძლება");
    }

    const upd: Prisma.OrderUpdateInput = {};

    if (data.sender) {
      upd.senderName = data.sender.name;
      upd.senderPhone = data.sender.phone;
    }
    if (data.recipient) {
      upd.recipientName = data.recipient.name;
      upd.recipientPhone = data.recipient.phone;
    }
    if (data.pickup) {
      upd.pickupAddress = data.pickup.address;
      upd.pickupLat = data.pickup.lat;
      upd.pickupLng = data.pickup.lng;
      upd.pickupNote = data.pickup.note ?? null;
    }
    if (data.delivery) {
      upd.deliveryAddress = data.delivery.address;
      upd.deliveryLat = data.delivery.lat;
      upd.deliveryLng = data.delivery.lng;
      upd.deliveryNote = data.delivery.note ?? null;
    }
    if (data.description !== undefined) upd.description = data.description;
    if (data.parcelValue !== undefined) upd.parcelValue = data.parcelValue;
    if (data.payerSide) upd.payerSide = data.payerSide;

    // ფასის/ზონის/ვადის თავიდან გამოთვლა, თუ შეიცვალა მისამართი, წონა ან გადახდის მეთოდი
    const priceAffecting =
      data.pickup || data.delivery || data.weightKg != null || data.paymentMethod;

    if (data.weightKg != null) upd.weightKg = data.weightKg;
    if (data.paymentMethod) upd.paymentMethod = data.paymentMethod;

    if (priceAffecting) {
      const pickup = data.pickup ?? { lat: order.pickupLat, lng: order.pickupLng };
      const delivery = data.delivery ?? { lat: order.deliveryLat, lng: order.deliveryLng };
      const weightKg = data.weightKg ?? Number(order.weightKg);
      const paymentMethod = data.paymentMethod ?? order.paymentMethod;
      const parcelValue =
        data.parcelValue !== undefined
          ? data.parcelValue
          : order.parcelValue == null
            ? null
            : Number(order.parcelValue);

      const [pickupCityId, deliveryCityId] = await Promise.all([
        resolveCityId(pickup),
        resolveCityId(delivery),
      ]);
      const price = await calculatePrice({
        pickup,
        delivery,
        weightKg,
        paymentMethod,
        deliveryCityId,
      });
      const eta = await estimateDelivery(price.zone);

      upd.zone = price.zone;
      upd.kind = price.zone === "TBILISI" ? "INTRA_CITY" : "INTER_CITY";
      upd.pickupCityId = pickupCityId;
      upd.deliveryCityId = deliveryCityId;
      upd.distanceKm = price.distanceKm;
      upd.deliveryPrice = price.deliveryPrice;
      upd.codFee = price.codFee;
      upd.totalPrice = price.totalPrice;
      upd.driverFee = price.driverFee;
      upd.codAmount = paymentMethod === "CASH" ? price.totalPrice + (parcelValue ?? 0) : 0;
      upd.estimatedDeliveryAt = eta;
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        ...upd,
        events: {
          create: {
            status: order.status,
            note: "შეკვეთა დარედაქტირდა",
            actorId: session.sub,
          },
        },
      },
      include: orderInclude,
    });

    // შეტყობინებები
    if (isDispatcher) {
      await notify(order.customerId, {
        title: "შეკვეთა განახლდა",
        body: `დისპეჩერმა შეასწორა შეკვეთა ${order.trackingNumber}`,
        data: { orderId: order.id },
      });
    } else {
      await notifyDispatchers({
        title: "შეკვეთა დარედაქტირდა",
        body: `${order.trackingNumber} — მომხმარებელმა შეცვალა მონაცემები`,
        data: { orderId: order.id },
      });
    }
    if ((data.pickup || data.delivery) && order.driverId) {
      await notifyDriver(order.driverId, {
        title: "მისამართი შეიცვალა",
        body: `შეკვეთა ${order.trackingNumber} — შეამოწმე ახალი მისამართი`,
        data: { orderId: order.id },
      });
    }

    return ok({ order: serializeOrder(updated) });
  });
}
