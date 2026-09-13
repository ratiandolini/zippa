import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { parcelDeliverSchema } from "@/lib/validation";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { MULTI_PARCEL_ORDERS_ENABLED } from "@/lib/flags";
import { round2, DELIVERY_REASON_TO_FAILURE } from "@/lib/parcels";
import { notify, notifyDispatchers, notifyDriver } from "@/lib/notify";
import { sendSms, smsTemplates } from "@/lib/sms";

// Phase 2 fix — მრავალამანათიანი შეკვეთის ჩაბარების რაოდენობრივი დადასტურება.
// ერთჯერადი ნაბიჯი — მაგრამ არ ნიშნავს, რომ ყველაფერი დახურულია: ვინც არ
// ჩაბარდა, ფიზიკურად კვლავ კურიერთანაა და გადადის RETURN_REQUESTED-ზე
// (მიზეზის მიუხედავად — უარი/ვერ დაუკავშირდნენ/დაბრუნება/სხვა). დაბრუნება
// საბოლოოდ დახურულად ითვლება მხოლოდ [id]/parcels/return-confirm-ის შემდეგ.
//
// Order.status სამი შესაძლებლობიდან ერთზეა:
//   DELIVERED            — ყველა ამანათი ჩაბარდა
//   PARTIALLY_COMPLETED  — ზოგი ჩაბარდა, ზოგი RETURN_REQUESTED/CANCELLED-ზეა
//   FAILED               — არცერთი არ ჩაბარდა (ეს endpoint-ი უკვე მოითხოვს,
//                          რომ აღების საკითხი წინასწარ დახურული იყოს)
//
// Order.deliveryPrice/driverFee/totalPrice/codFee/partnerCost/companyMargin —
// შექმნის-დროინდელი snapshot, აქ არასდროს არ იცვლება. კლიენტის რეალური
// ვალდებულება (რისი გადახდაც სჭირდება) ცალკე, append-only CustomerAdjustment
// ჩანაწერებით ინახება (kind: DELIVERY_CHARGE) — ეს არის ერთადერთი წყარო, რასაც
// COD/remittance-ის რეალური endpoint-ები (dispatch/cod, orders/cod) კითხულობენ,
// ასე რომ საბოლოო გადასახდელი არასდროს ეყრდნობა მხოლოდ UI-გამოთვლას.
// დაბრუნების საფასური (RETURN_FEE) ცალკე adjustment-ითაა და იქმნება მხოლოდ
// მას შემდეგ, რაც კონკრეტული ამანათი რეალურად დაბრუნებულია.
export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    if (!MULTI_PARCEL_ORDERS_ENABLED) return fail(404, "ვერ მოიძებნა");

    const session = await requireUser();
    const body = parcelDeliverSchema.parse(await req.json());

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { parcels: true },
    });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (!order.isMultiParcel) return fail(409, "ეს არ არის მრავალამანათიანი შეკვეთა");

    const driver = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
    if (!driver || order.driverId !== driver.id) return fail(403, "წვდომა აკრძალულია");

    if (order.status !== "IN_TRANSIT")
      throw new ApiError(409, "ამ ეტაპზე ჩაბარების დადასტურება არ შეიძლება");

    // FAILED უნდა ნიშნავდეს "ყველა ამანათის საკითხი საბოლოოდ დახურულია" — არა უბრალოდ
    // "არცერთი არ ჩაბარდა". თუ ჯერ კიდევ არსებობს ვერ-აღებული (PENDING/NOT_PICKED_UP)
    // ამანათი, ჩაბარება ვერ დაფინალდება მანამ, სანამ დისპეჩერი არ გადაწყვეტს მის
    // ბედს (/parcels/resolve-pickup — ხელახლა მინიჭება ან ჩამოწერა).
    const unresolvedPickup = order.parcels.filter(
      (p) => p.status === "PENDING" || p.status === "NOT_PICKED_UP",
    );
    if (unresolvedPickup.length > 0)
      throw new ApiError(
        409,
        `ჯერ ${unresolvedPickup.length} ვერ-აღებული ამანათის საკითხი გადაწყვიტე (დისპეჩერთან — ხელახლა მინიჭება ან ჩამოწერა), მერე დაადასტურე ჩაბარება`,
      );

    const eligible = order.parcels
      .filter((p) => p.status === "PICKED_UP")
      .sort((a, b) => a.sequenceNo - b.sequenceNo);

    if (body.deliveredCount > eligible.length)
      throw new ApiError(422, "რაოდენობა აღებულ ამანათებზე მეტია");
    if (body.deliveredCount < eligible.length && !body.reason)
      throw new ApiError(422, "მიუთითე მიზეზი, რატომ ვერ ჩააბარე დანარჩენი ამანათები");

    // ჩაბარების დადასტურება — deliveryProof-ის მიხედვით (მხოლოდ თუ რამე ნამდვილად ჩაბარდა)
    if (body.deliveredCount > 0) {
      if (order.deliveryProof === "PHOTO" && !order.proofPhotoUrl)
        throw new ApiError(422, "ჯერ ატვირთე მიტანის ფოტო");
      if (order.deliveryProof === "PIN") {
        const pin = (body.pin ?? "").replace(/\D/g, "");
        if (!order.deliveryPin || pin !== order.deliveryPin)
          throw new ApiError(422, "მიმღების PIN არ ემთხვევა");
      }
    }

    const toDeliver = eligible.slice(0, body.deliveredCount);
    const toReturn = eligible.slice(body.deliveredCount);
    const failReason = body.reason ? DELIVERY_REASON_TO_FAILURE[body.reason] : "OTHER";

    const { updated, deliveredCount, awaitingReturnCount, earnedDriverFee } =
      await prisma.$transaction(async (tx) => {
        // ატომური compare-and-swap — იგივე შეკვეთაზე ორი პარალელური/განმეორებითი
        // request-ი მეორედ ვერ გაატარებს ფინალიზაციას (ორმაგი CustomerAdjustment/
        // DriverEarning/cashOnHand-ის თავიდან ასაცილებლად).
        const claimed = await tx.order.updateMany({
          where: { id: order.id, status: "IN_TRANSIT" },
          data: { status: "IN_TRANSIT" },
        });
        if (claimed.count === 0)
          throw new ApiError(409, "შეკვეთის სტატუსი უკვე შეიცვალა — განაახლე გვერდი");

        const now = new Date();
        for (const p of toDeliver) {
          await tx.orderParcel.update({
            where: { id: p.id },
            data: { status: "DELIVERED", deliveredAt: now },
          });
          await tx.orderParcelEvent.create({
            data: { parcelId: p.id, status: "DELIVERED", actorId: session.sub },
          });
        }
        // ვერ ჩაბარდა — ფიზიკურად კურიერთანვეა, საჭიროა რეალური დაბრუნება
        // (/parcels/return-confirm), სანამ საბოლოოდ დახურულად ჩაითვლება.
        for (const p of toReturn) {
          await tx.orderParcel.update({
            where: { id: p.id },
            data: {
              status: "RETURN_REQUESTED",
              failureReason: failReason,
              failureNote: body.note,
              returnRequestedAt: now,
            },
          });
          await tx.orderParcelEvent.create({
            data: { parcelId: p.id, status: "RETURN_REQUESTED", note: body.note, actorId: session.sub },
          });
        }

        // ── ფინალიზაცია: ორდერის დონეზე ერთხელ, ამანათების საბოლოო მდგომარეობით ──
        const finalParcels = await tx.orderParcel.findMany({ where: { orderId: order.id } });
        const delivered = finalParcels.filter((p) => p.status === "DELIVERED");
        const awaitingReturn = finalParcels.filter((p) => p.status === "RETURN_REQUESTED");

        const earnedDeliveryPrice = round2(
          delivered.reduce((s, p) => s + Number(p.allocatedDeliveryPrice), 0),
        );
        const earnedDriverFee = round2(
          delivered.reduce((s, p) => s + Number(p.allocatedDriverFee), 0),
        );
        const earnedCollect = round2(delivered.reduce((s, p) => s + Number(p.codAmount), 0));

        const ratio = order.parcelCount > 0 ? delivered.length / order.parcelCount : 0;
        const earnedCodFee = round2(Number(order.codFee) * ratio);
        const earnedCodCommission = round2(Number(order.codCommission) * ratio);
        const earnedTotalPrice = round2(earnedDeliveryPrice + earnedCodFee);
        const earnedCodAmount = round2(
          (order.paymentMethod === "CASH" ? earnedTotalPrice : 0) + earnedCollect,
        );
        const newOrderStatus =
          delivered.length === 0
            ? "FAILED"
            : delivered.length === order.parcelCount
              ? "DELIVERED"
              : "PARTIALLY_COMPLETED";

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: newOrderStatus,
            // deliveryPrice/driverFee/totalPrice/codFee/partnerCost/companyMargin
            // — შექმნის snapshot, აქ არ იცვლება (იხ. ფაილის თავი).
            collectAmount: earnedCollect,
            codCommission: earnedCodCommission,
            codAmount: earnedCodAmount,
            ...(newOrderStatus !== "FAILED" ? { deliveredAt: now } : {}),
            ...(newOrderStatus !== "FAILED" && order.paymentMethod === "CASH"
              ? { paymentStatus: "PAID" }
              : {}),
            ...(newOrderStatus === "FAILED" ? { failureReason: failReason } : {}),
            events: {
              create: {
                status: newOrderStatus,
                note: `${delivered.length}/${order.parcelCount} ჩაბარებული`,
                lat: body.lat,
                lng: body.lng,
                actorId: session.sub,
              },
            },
          },
        });

        // ── საბოლოო გადასახდელის ერთადერთი წყარო: append-only CustomerAdjustment.
        //    negative amount = კლიენტი Zippa-ს ევალება. ეს ჩანაწერი (არა UI-გამოთვლა)
        //    არის ის, რასაც COD/remittance-ის რეალური endpoint-ები კითხულობენ.
        //    (order.update-ის `include: orderInclude` ქვემოთ, ამის შემდეგ — რომ
        //    ახლადშექმნილი adjustment-იც ჩანდეს parcelFinance-ის გამოთვლაში.) ──
        if (delivered.length > 0) {
          await tx.customerAdjustment.create({
            data: {
              customerId: order.customerId,
              orderId: order.id,
              amount: -earnedTotalPrice,
              kind: "DELIVERY_CHARGE",
              reason: `მიტანის საფასური — ${delivered.length}/${order.parcelCount} ამანათი ჩაბარებული`,
            },
          });
        }

        const o = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });

        if (order.driverId) {
          if (delivered.length > 0) {
            await tx.driverEarning.create({
              data: {
                driverId: order.driverId,
                orderId: order.id,
                kind: "DELIVERY",
                grossPrice: earnedTotalPrice,
                driverAmount: earnedDriverFee,
                companyAmount: round2(earnedTotalPrice - earnedDriverFee),
                collectedInCash: order.paymentMethod === "CASH",
              },
            });
            await tx.driverProfile.update({
              where: { id: order.driverId },
              data: {
                totalDeliveries: { increment: 1 },
                unpaidEarnings: { increment: earnedDriverFee },
                ...(order.paymentMethod === "CASH"
                  ? { cashOnHand: { increment: earnedCodAmount } }
                  : {}),
                status: "AVAILABLE",
              },
            });
          } else {
            await tx.driverProfile.update({ where: { id: order.driverId }, data: { status: "AVAILABLE" } });
          }
        }

        return {
          updated: o,
          deliveredCount: delivered.length,
          awaitingReturnCount: awaitingReturn.length,
          earnedDriverFee,
        };
      });

    const fullyDelivered = awaitingReturnCount === 0;
    await notifyDispatchers({
      title: deliveredCount === 0 ? "მიტანა ჩაიშალა" : fullyDelivered ? "ჩაბარება დასრულდა" : "ნაწილობრივ შესრულდა",
      body: `${order.trackingNumber} — ჩაბარებული ${deliveredCount}/${order.parcelCount}${
        awaitingReturnCount > 0 ? `, დასაბრუნებელი ${awaitingReturnCount}` : ""
      }`,
      data: { orderId: order.id },
    });
    await notify(order.customerId, {
      title: deliveredCount === 0 ? "მიტანა ვერ შესრულდა" : fullyDelivered ? "ამანათები ჩაბარდა" : "ამანათები ნაწილობრივ ჩაბარდა",
      body: `${order.trackingNumber} — ${deliveredCount}/${order.parcelCount} ჩაბარებულია`,
      data: { orderId: order.id },
    });
    if (order.driverId && deliveredCount > 0) {
      await notifyDriver(order.driverId, {
        title: "მიტანა დასრულდა",
        body: `${order.trackingNumber} — დაგერიცხა ${earnedDriverFee} ₾`,
        data: { orderId: order.id },
      });
    }
    if (order.driverId && awaitingReturnCount > 0) {
      await notifyDriver(order.driverId, {
        title: "დასაბრუნებელი ამანათები",
        body: `${order.trackingNumber} — ${awaitingReturnCount} ამანათი დაუბრუნე გამგზავნს და დაადასტურე`,
        data: { orderId: order.id },
      });
    }
    void sendSms(order.senderPhone, smsTemplates.delivered(order.trackingNumber));
    if (deliveredCount > 0) void sendSms(order.recipientPhone, smsTemplates.delivered(order.trackingNumber));

    return ok({ order: serializeOrder(updated, session.role) });
  });
}
