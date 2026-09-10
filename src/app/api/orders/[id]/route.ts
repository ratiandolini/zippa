import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { editOrderSchema } from "@/lib/validation";
import { calculatePrice, resolveCityId, estimateDelivery } from "@/lib/pricing";
import { getSetting } from "@/lib/settings";
import { notify, notifyDispatchers, notifyDriver } from "@/lib/notify";
import type { Prisma } from "@prisma/client";

// რომელ სტატუსებზეა შეკვეთის რედაქტირება დაშვებული
const EDITABLE_DISPATCHER = ["PENDING", "ASSIGNED", "ACCEPTED", "EN_ROUTE_PICKUP"];
const EDITABLE_CUSTOMER = ["PENDING"];

// დისპეჩერს შეუძლია წაშალოს მხოლოდ DRAFT შეკვეთა, რომელსაც არანაირი ფინანსური/
// ისტორიული ჩანაწერი არ უკავშირდება. ყველა სხვა (CANCELLED-ის ჩათვლით) რჩება —
// წაშლა cascade-ით შლიდა DriverEarning/Payment-ს და აფუჭებდა აღრიცხვას.
export function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireUser().then((s) => {
      if (s.role !== "DISPATCHER") throw new ApiError(403, "წვდომა აკრძალულია");
    });
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { earnings: true, adjustments: true, events: true } },
        payment: { select: { id: true } },
      },
    });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (order.status !== "DRAFT")
      throw new ApiError(409, "წაშლა შესაძლებელია მხოლოდ მონახაზი (DRAFT) შეკვეთისთვის");
    if (
      order._count.earnings > 0 ||
      order._count.adjustments > 0 ||
      order.payment ||
      order.codRemittanceId ||
      Number(order.cancelFee) > 0 ||
      Number(order.returnFee) > 0
    )
      throw new ApiError(409, "შეკვეთას ფინანსური ჩანაწერი უკავშირდება — წაშლა აკრძალულია");
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

    return ok({ order: serializeOrder(order, session.role) });
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
    if (data.collectAmount !== undefined) upd.collectAmount = data.collectAmount ?? 0;
    if (data.payerSide) upd.payerSide = data.payerSide;

    // ფასის/ზონის/ვადის თავიდან გამოთვლა, თუ შეიცვალა მისამართი, წონა, გადახდა ან ასაღები თანხა
    const priceAffecting =
      data.pickup ||
      data.delivery ||
      data.weightKg != null ||
      data.paymentMethod ||
      data.collectAmount !== undefined;

    if (data.weightKg != null) upd.weightKg = data.weightKg;
    if (data.paymentMethod) upd.paymentMethod = data.paymentMethod;

    if (priceAffecting) {
      const pickup = data.pickup ?? { lat: order.pickupLat, lng: order.pickupLng };
      const delivery = data.delivery ?? { lat: order.deliveryLat, lng: order.deliveryLng };
      const weightKg = data.weightKg ?? Number(order.weightKg);
      const paymentMethod = data.paymentMethod ?? order.paymentMethod;
      const collectAmount =
        data.collectAmount !== undefined
          ? (data.collectAmount ?? 0)
          : Number(order.collectAmount);

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
      upd.partnerCost = price.partnerCost;
      upd.codAmount = (paymentMethod === "CASH" ? price.totalPrice : 0) + collectAmount;
      const codPct = collectAmount > 0 ? await getSetting("cod_commission_percent") : 0;
      const codCommission = Math.round(collectAmount * (codPct / 100) * 100) / 100;
      upd.codCommission = codCommission;
      upd.companyMargin = Math.round((price.companyMargin + codCommission) * 100) / 100;
      upd.needsManualReview = price.needsManualReview;
      upd.pricingSource = "RULE";
      upd.priceAdjustmentReason = null;
      upd.priceAdjustedAt = null;
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

    return ok({ order: serializeOrder(updated, session.role) });
  });
}
