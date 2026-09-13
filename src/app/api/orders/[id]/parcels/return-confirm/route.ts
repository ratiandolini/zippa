import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { parcelReturnConfirmSchema } from "@/lib/validation";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { MULTI_PARCEL_ORDERS_ENABLED } from "@/lib/flags";
import { RETURN_FEE_PCT } from "@/lib/domain";
import { round2 } from "@/lib/parcels";
import { notify, notifyDispatchers } from "@/lib/notify";

// Phase 2 fix — RETURN_REQUESTED ამანათის ფაქტობრივი დაბრუნების დადასტურება.
// მხოლოდ ამის შემდეგ ითვლება დაბრუნება დასრულებულად (RETURNED) და მხოლოდ ამის
// შემდეგ ერიცხება დაბრუნების საფასური — ცალკე, append-only CustomerAdjustment
// ჩანაწერით (kind: RETURN_FEE), ისევე როგორც ჩაბარების საფასური. იდემპოტენტურია:
// ერთხელ RETURNED-ზე გადასული ამანათი აღარასდროს ხვდება "eligible"-ში, ამიტომ
// განმეორებითი request-ი ვერ დაარიცხავს ორმაგ საფასურს.
export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    if (!MULTI_PARCEL_ORDERS_ENABLED) return fail(404, "ვერ მოიძებნა");

    const session = await requireUser();
    const body = parcelReturnConfirmSchema.parse(await req.json());

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { parcels: true },
    });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (!order.isMultiParcel) return fail(409, "ეს არ არის მრავალამანათიანი შეკვეთა");

    const driver = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
    const isOwnerDriver = !!driver && order.driverId === driver.id;
    const isDispatcher = session.role === "DISPATCHER";
    if (!isOwnerDriver && !isDispatcher) return fail(403, "წვდომა აკრძალულია");

    const eligible = order.parcels
      .filter((p) => p.status === "RETURN_REQUESTED")
      .sort((a, b) => a.sequenceNo - b.sequenceNo);

    if (eligible.length === 0) throw new ApiError(409, "დასაბრუნებელი ამანათი არ არის");
    if (body.returnedCount > eligible.length)
      throw new ApiError(422, "რაოდენობა დასაბრუნებელ ამანათებზე მეტია");

    const toReturn = eligible.slice(0, body.returnedCount);

    const { returnedCount, returnFeeCharged } = await prisma.$transaction(async (tx) => {
      const now = new Date();
      let returnFeeCharged = 0;
      let returnedCount = 0;
      for (const p of toReturn) {
        // თითო ამანათზე compare-and-swap — პარალელური/განმეორებითი request-ი
        // იმავე ამანათს მეორედ ვერ დაარიცხავს.
        const claimed = await tx.orderParcel.updateMany({
          where: { id: p.id, status: "RETURN_REQUESTED" },
          data: { status: "RETURNED", returnedAt: now },
        });
        if (claimed.count === 0) continue;
        returnedCount++;
        await tx.orderParcelEvent.create({
          data: { parcelId: p.id, status: "RETURNED", note: body.note, actorId: session.sub },
        });

        const fee = round2(Number(p.allocatedDeliveryPrice) * RETURN_FEE_PCT);
        if (fee > 0) {
          await tx.customerAdjustment.create({
            data: {
              customerId: order.customerId,
              orderId: order.id,
              parcelId: p.id,
              amount: -fee,
              kind: "RETURN_FEE",
              reason: `ამანათი ${p.sequenceNo}/${order.parcelCount} — დაბრუნების საფასური`,
            },
          });
          returnFeeCharged = round2(returnFeeCharged + fee);
        }
      }

      if (returnedCount > 0) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            events: {
              create: {
                status: order.status,
                note: `დაბრუნებულია ${returnedCount} ამანათი${body.note ? ` — ${body.note}` : ""}`,
                actorId: session.sub,
              },
            },
          },
        });
      }

      return { returnedCount, returnFeeCharged };
    });

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });

    if (returnedCount > 0) {
      await notifyDispatchers({
        title: "ამანათი დაბრუნდა",
        body: `${order.trackingNumber} — ${returnedCount} დაბრუნებულია${
          returnFeeCharged > 0 ? `, დაბრუნების საფასური ${returnFeeCharged} ₾` : ""
        }`,
        data: { orderId: order.id },
      });
      await notify(order.customerId, {
        title: "ამანათი დაბრუნდა",
        body: `${order.trackingNumber} — ${returnedCount} ამანათი დაგიბრუნდათ`,
        data: { orderId: order.id },
      });
    }

    return ok({ order: serializeOrder(updated, session.role) });
  });
}
