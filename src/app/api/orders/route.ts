import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api";
import { handle, ok } from "@/lib/api";
import { createOrderSchema } from "@/lib/validation";
import { calculatePrice, resolveCityId } from "@/lib/pricing";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { generateTrackingNumber } from "@/lib/utils";
import { notifyDispatchers } from "@/lib/notify";
import { streetOf } from "@/lib/domain";

export function GET(req: Request) {
  return handle(async () => {
    const session = await requireUser();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

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
      pickupCityId,
      deliveryCityId,
    });

    const codAmount =
      data.paymentMethod === "CASH" ? price.totalPrice + (data.parcelValue ?? 0) : 0;

    const order = await prisma.order.create({
      data: {
        trackingNumber: generateTrackingNumber(),
        customerId: session.sub,
        status: "PENDING",
        kind: price.kind,

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

        distanceKm: price.distanceKm,
        basePrice: price.basePrice,
        distancePrice: price.distancePrice,
        weightPrice: price.weightPrice,
        codFee: price.codFee,
        totalPrice: price.totalPrice,
        pricingRuleId: price.pricingRuleId,

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
