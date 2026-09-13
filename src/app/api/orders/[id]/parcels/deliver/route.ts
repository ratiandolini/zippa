import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { parcelDeliverSchema } from "@/lib/validation";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { MULTI_PARCEL_ORDERS_ENABLED } from "@/lib/flags";
import { RETURN_FEE_PCT, FAILURE_REASON_LABEL } from "@/lib/domain";
import { round2, DELIVERY_REASON_TO_STATUS, DELIVERY_REASON_TO_FAILURE } from "@/lib/parcels";
import { notify, notifyDispatchers, notifyDriver } from "@/lib/notify";
import { sendSms, smsTemplates } from "@/lib/sms";

// Phase 2 — მრავალამანათიანი შეკვეთის ჩაბარების რაოდენობრივი დადასტურება.
// ერთჯერადი, საბოლოო ნაბიჯი. Order.status სამი შესაძლებლობიდან ერთზეა:
//   DELIVERED            — ყველა ამანათი ჩაბარდა
//   PARTIALLY_COMPLETED  — ზოგი ჩაბარდა, ზოგი დარჩა (NOT_PICKED_UP/REFUSED/
//                          RETURN_REQUESTED/FAILED/CANCELLED)
//   FAILED               — არცერთი არ ჩაბარდა
// Order.deliveryPrice/driverFee/totalPrice/codFee/partnerCost/companyMargin
// შექმნის-დროინდელი snapshot-ია და აქ არასდროს არ იცვლება (ფინანსური ისტორია
// არ იკარგება — ეს ღირებულებები ყოველთვის საწყისს აჩვენებს). ფაქტობრივად
// შესრულებული ნაწილის თანხა მხოლოდ derived (გამოთვლილი) სახით გამოდის
// serializeOrder()-ის `parcelFinance`-ში, OrderParcel.allocatedDeliveryPrice/
// allocatedDriverFee-ის ჯამებიდან. Order.collectAmount/codCommission/codAmount
// კი ოპერაციულად საჭირო ცვლადებია (COD remittance/დისპეჩერის cashOnHand-ს
// ემსახურება) და აქ განახლდება ფაქტობრივად ჩაბარებულის მიხედვით — თითოეული
// OrderParcel-ის საწყისი codAmount/allocated-წილი კვლავ უცვლელად ინახება,
// ასე რომ საწყისი მთლიანი თანხა ყოველთვის აღდგენადია (sum(parcels.*)).
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
    const toFail = eligible.slice(body.deliveredCount);
    const failStatus = body.reason ? DELIVERY_REASON_TO_STATUS[body.reason] : "FAILED";
    const failReason = body.reason ? DELIVERY_REASON_TO_FAILURE[body.reason] : "OTHER";

    const { updated, deliveredCount, undeliveredCount, earnedDriverFee } = await prisma.$transaction(async (tx) => {
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
      for (const p of toFail) {
        await tx.orderParcel.update({
          where: { id: p.id },
          data: {
            status: failStatus,
            failureReason: failReason,
            failureNote: body.note,
            ...(failStatus === "RETURN_REQUESTED" ? { returnRequestedAt: now } : {}),
          },
        });
        await tx.orderParcelEvent.create({
          data: { parcelId: p.id, status: failStatus, note: body.note, actorId: session.sub },
        });
      }

      // ── ფინალიზაცია: ორდერის დონეზე ერთხელ, ამანათების საბოლოო მდგომარეობით ──
      const finalParcels = await tx.orderParcel.findMany({ where: { orderId: order.id } });
      const delivered = finalParcels.filter((p) => p.status === "DELIVERED");
      const undelivered = finalParcels.filter((p) => p.status !== "DELIVERED");

      const earnedDeliveryPrice = round2(
        delivered.reduce((s, p) => s + Number(p.allocatedDeliveryPrice), 0),
      );
      const earnedDriverFee = round2(
        delivered.reduce((s, p) => s + Number(p.allocatedDriverFee), 0),
      );
      const earnedCollect = round2(delivered.reduce((s, p) => s + Number(p.codAmount), 0));
      const undeliveredDeliveryShare = round2(
        undelivered.reduce((s, p) => s + Number(p.allocatedDeliveryPrice), 0),
      );
      const returnFee = round2(undeliveredDeliveryShare * RETURN_FEE_PCT);

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

      const o = await tx.order.update({
        where: { id: order.id },
        data: {
          status: newOrderStatus,
          // deliveryPrice/driverFee/totalPrice/codFee/partnerCost/companyMargin
          // — შექმნის snapshot, აქ არ იცვლება (იხ. ფაილის თავი).
          collectAmount: earnedCollect,
          codCommission: earnedCodCommission,
          codAmount: earnedCodAmount,
          returnFee,
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
        include: orderInclude,
      });

      // ── ცალკე audit ჩანაწერი თითო ვერ-ჩაბარებულ ამანათზე ──
      for (const p of undelivered) {
        const amount = Number(p.allocatedDeliveryPrice);
        if (amount <= 0) continue;
        const reasonLabel =
          p.failureReason != null
            ? FAILURE_REASON_LABEL[p.failureReason]
            : p.status === "CANCELLED"
              ? `ჩამოწერილი${p.failureNote ? ` — ${p.failureNote}` : ""}`
              : "ვერ აღებულა";
        await tx.customerAdjustment.create({
          data: {
            customerId: order.customerId,
            orderId: order.id,
            parcelId: p.id,
            amount,
            kind: "REFUND",
            reason: `ამანათი ${p.sequenceNo}/${order.parcelCount} — ${reasonLabel}`,
          },
        });
      }

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
              ...(order.paymentMethod === "CASH" ? { cashOnHand: { increment: earnedCodAmount } } : {}),
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
        undeliveredCount: undelivered.length,
        earnedDriverFee,
      };
    });

    const fullyDelivered = undeliveredCount === 0;
    await notifyDispatchers({
      title: deliveredCount === 0 ? "მიტანა ჩაიშალა" : fullyDelivered ? "ჩაბარება დასრულდა" : "ნაწილობრივ შესრულდა",
      body: `${order.trackingNumber} — ჩაბარებული ${deliveredCount}/${order.parcelCount}${
        undeliveredCount > 0 ? `, დარჩენილი/დასაბრუნებელი ${undeliveredCount}` : ""
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
    void sendSms(order.senderPhone, smsTemplates.delivered(order.trackingNumber));
    if (deliveredCount > 0) void sendSms(order.recipientPhone, smsTemplates.delivered(order.trackingNumber));

    return ok({ order: serializeOrder(updated, session.role) });
  });
}
