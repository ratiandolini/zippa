import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api";
import { handle, ok } from "@/lib/api";
import { createOrderSchema } from "@/lib/validation";
import { calculatePrice, resolveCityId, estimateDelivery } from "@/lib/pricing";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { generateTrackingNumber } from "@/lib/utils";
import { notifyDispatchers } from "@/lib/notify";
import { streetOf } from "@/lib/domain";
import { expireStaleAssignments } from "@/lib/assignments";
import { getSetting } from "@/lib/settings";

export function GET(req: Request) {
  return handle(async () => {
    const session = await requireUser();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    // უპასუხო მიბმების დაბრუნება „მოლოდინში" (იაფი, თუ არაფერია ვადაგასული)
    await expireStaleAssignments().catch(() => {});

    const where: Prisma.OrderWhereInput = {};
    if (session.role === "CUSTOMER") where.customerId = session.sub;
    if (session.role === "DRIVER") {
      const dp = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
      where.driverId = dp?.id ?? "__none__";
    }
    if (status) where.status = status as Prisma.OrderWhereInput["status"];

    const orders = await prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok({ orders: orders.map(serializeOrder) });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const session = await requireUser();
    const data = createOrderSchema.parse(await req.json());

    const [pickupCityId, deliveryCityId] = await Promise.all([
      resolveCityId(data.pickup),
      resolveCityId(data.delivery),
    ]);

    const price = await calculatePrice({
      pickup: data.pickup,
      delivery: data.delivery,
      weightKg: data.weightKg,
      paymentMethod: data.paymentMethod,
      deliveryCityId,
    });

    const collectAmount = data.collectAmount ?? 0;
    const codAmount =
      (data.paymentMethod === "CASH" ? price.totalPrice : 0) + collectAmount;
    const codPct = collectAmount > 0 ? await getSetting("cod_commission_percent") : 0;
    const codCommission = Math.round(collectAmount * (codPct / 100) * 100) / 100;
    const companyMargin =
      Math.round((price.companyMargin + codCommission) * 100) / 100;
    const eta = await estimateDelivery(price.zone);

    const order = await prisma.order.create({
      data: {
        trackingNumber: generateTrackingNumber(),
        customerId: session.sub,
        status: "PENDING",
        kind: price.zone === "TBILISI" ? "INTRA_CITY" : "INTER_CITY",
        zone: price.zone,
        estimatedDeliveryAt: eta,

        senderName: data.sender.name,
        senderPhone: data.sender.phone,
        pickupAddress: data.pickup.address,
        pickupLat: data.pickup.lat,
        pickupLng: data.pickup.lng,
        pickupCityId,
        pickupNote: data.pickup.note,

        recipientName: data.recipient.name,
        recipientPhone: data.recipient.phone,
        deliveryAddress: data.delivery.address,
        deliveryLat: data.delivery.lat,
        deliveryLng: data.delivery.lng,
        deliveryCityId,
        deliveryNote: data.delivery.note,

        weightKg: data.weightKg,
        description: data.description,
        parcelValue: data.parcelValue,
        collectAmount,
        codCommission,

        distanceKm: price.distanceKm,
        deliveryPrice: price.deliveryPrice,
        codFee: price.codFee,
        totalPrice: price.totalPrice,
        driverFee: price.driverFee,
        partnerCost: price.partnerCost,
        companyMargin,
        needsManualReview: price.needsManualReview,

        paymentMethod: data.paymentMethod,
        paymentStatus: "UNPAID",
        payerSide: data.payerSide,
        codAmount,

        events: { create: { status: "PENDING", note: "შეკვეთა შექმნილია", actorId: session.sub } },
      },
      include: orderInclude,
    });

    await notifyDispatchers({
      title: "ახალი შეკვეთა",
      body: `${order.trackingNumber} · ${streetOf(order.pickupAddress)} → ${streetOf(order.deliveryAddress)}`,
      data: { orderId: order.id },
    });

    return ok({ order: serializeOrder(order) }, 201);
  });
}
