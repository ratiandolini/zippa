import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { parcelPickupSchema } from "@/lib/validation";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { MULTI_PARCEL_ORDERS_ENABLED } from "@/lib/flags";
import { notify, notifyDispatchers } from "@/lib/notify";

// Phase 2 — მრავალამანათიანი შეკვეთის აღების რაოდენობრივი დადასტურება.
// მხოლოდ isMultiParcel=true შეკვეთაზე; ცალკეული (PICKED_UP) status-ის
// ჩანაცვლებით ერთი Order-ის ბოლო status-ის ცვლილება (/status route) ამ
// შემთხვევაში დაბლოკილია — იხ. [id]/status/route.ts-ის დამატებული გუარდი.
export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    if (!MULTI_PARCEL_ORDERS_ENABLED) return fail(404, "ვერ მოიძებნა");

    const session = await requireUser();
    const body = parcelPickupSchema.parse(await req.json());

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { parcels: true },
    });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (!order.isMultiParcel) return fail(409, "ეს არ არის მრავალამანათიანი შეკვეთა");

    const driver = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
    if (!driver || order.driverId !== driver.id) return fail(403, "წვდომა აკრძალულია");

    if (!["EN_ROUTE_PICKUP", "PICKED_UP"].includes(order.status))
      throw new ApiError(409, "ამ ეტაპზე აღების დადასტურება არ შეიძლება");

    const remaining = order.parcels
      .filter((p) => p.status === "PENDING" || p.status === "NOT_PICKED_UP")
      .sort((a, b) => a.sequenceNo - b.sequenceNo);

    if (remaining.length === 0) throw new ApiError(409, "ყველა ამანათი უკვე დამუშავებულია");
    if (body.pickedUpCount > remaining.length)
      throw new ApiError(422, "რაოდენობა დარჩენილ ამანათებზე მეტია");
    if (body.pickedUpCount < remaining.length && !body.reason?.trim())
      throw new ApiError(422, "მიუთითე მიზეზი, რატომ ვერ აიღე დანარჩენი ამანათები");

    const toPickup = remaining.slice(0, body.pickedUpCount);
    const toRetry = remaining.slice(body.pickedUpCount);

    const shouldAdvance = toPickup.length > 0 && order.status === "EN_ROUTE_PICKUP";

    const updated = await prisma.$transaction(async (tx) => {
      for (const p of toPickup) {
        await tx.orderParcel.update({
          where: { id: p.id },
          data: { status: "PICKED_UP", pickedUpAt: new Date(), pickupAttempts: { increment: 1 } },
        });
        await tx.orderParcelEvent.create({
          data: { parcelId: p.id, status: "PICKED_UP", actorId: session.sub },
        });
      }
      for (const p of toRetry) {
        await tx.orderParcel.update({
          where: { id: p.id },
          data: {
            status: "NOT_PICKED_UP",
            pickupAttempts: { increment: 1 },
            failureNote: body.reason,
          },
        });
        await tx.orderParcelEvent.create({
          data: { parcelId: p.id, status: "NOT_PICKED_UP", note: body.reason, actorId: session.sub },
        });
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          ...(shouldAdvance ? { status: "PICKED_UP" } : {}),
          events: shouldAdvance
            ? {
                create: {
                  status: "PICKED_UP",
                  note: `${toPickup.length}/${order.parcelCount} აღებული`,
                  lat: body.lat,
                  lng: body.lng,
                  actorId: session.sub,
                },
              }
            : undefined,
        },
        include: orderInclude,
      });
    });

    await notifyDispatchers({
      title: "ამანათების აღება",
      body: `${order.trackingNumber} — აღებულია ${toPickup.length}/${remaining.length}${
        toRetry.length > 0 ? `, ვერ აიღო ${toRetry.length}` : ""
      }`,
      data: { orderId: order.id },
    });
    if (shouldAdvance) {
      await notify(order.customerId, {
        title: "კურიერმა აიღო ამანათები",
        body: `შეკვეთა ${order.trackingNumber} — ${toPickup.length}/${order.parcelCount} აღებულია`,
        data: { orderId: order.id },
      });
    }

    return ok({ order: serializeOrder(updated, session.role) });
  });
}
