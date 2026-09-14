import sharp from "sharp";
import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { parcelReturnConfirmSchema } from "@/lib/validation";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { MULTI_PARCEL_ORDERS_ENABLED } from "@/lib/flags";
import { RETURN_FEE_PCT } from "@/lib/domain";
import { round2 } from "@/lib/parcels";
import { putProofFile } from "@/lib/storage";
import { notify, notifyDispatchers } from "@/lib/notify";

const MAX_BYTES = 4 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// Phase 2 fix (safeguard) — RETURN_REQUESTED ამანათის ფაქტობრივი დაბრუნების
// დადასტურება. ორი გზა:
//
//  - კურიერი (isOwnerDriver): ფოტო სავალდებულოა (multipart `file`) — ეს
//    არის დაბრუნების მტკიცებულება, ინახება ცალკე `OrderParcel.returnProofPhotoUrl`/
//    `returnProofAt`-ში, `proofPhotoUrl`-ს (მიტანის ფოტო) არასდროს არ ეხება.
//  - დისპეჩერი: მხოლოდ override-ის სახით — წერილობითი `reason` სავალდებულოა,
//    ფოტო არჩევითია. Audit-ში ცალსახად აღინიშნება, რომ დისპეჩერმა ხელით
//    დააფინალა. არსებული (კურიერის ატვირთული) ფოტო არასდროს არ წაშლილა/
//    გადაფარულა override-ით — თუ დისპეჩერი ახალ ფაილს არ ატვირთავს, ძველი ისევ ძველია.
//
// ორივე გზაზე per-parcel compare-and-swap უზრუნველყოფს იდემპოტენტურობას —
// ერთხელ RETURNED-ზე გადასული ამანათი მეორედ არასდროს დაარიცხავს RETURN_FEE-ს.
export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    if (!MULTI_PARCEL_ORDERS_ENABLED) return fail(404, "ვერ მოიძებნა");

    const session = await requireUser();

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

    const form = await req.formData();
    const raw = {
      returnedCount: Number(form.get("returnedCount")),
      note: form.get("note")?.toString() || undefined,
      reason: form.get("reason")?.toString() || undefined,
    };
    const body = parcelReturnConfirmSchema.parse(raw);
    const file = form.get("file");

    // კურიერი — ფოტო სავალდებულოა. დისპეჩერი — override, წერილობითი მიზეზი სავალდებულოა.
    if (isOwnerDriver) {
      if (!(file instanceof File) || file.size === 0)
        throw new ApiError(422, "დაბრუნების დასადასტურებლად ატვირთე ფოტო");
    } else {
      if (!body.reason?.trim())
        throw new ApiError(422, "დისპეჩერის ხელით დადასტურებას სავალდებულო მიზეზი სჭირდება");
    }

    let photoUrl: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) throw new ApiError(422, "ფოტო 4MB-ზე დიდია");
      if (file.type && !OK_TYPES.includes(file.type)) throw new ApiError(422, "მხოლოდ სურათია დაშვებული");
      const input = Buffer.from(await file.arrayBuffer());
      let jpeg: Buffer;
      try {
        jpeg = await sharp(input)
          .rotate()
          .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 78 })
          .toBuffer();
      } catch {
        throw new ApiError(422, "სურათის დამუშავება ვერ მოხერხდა");
      }
      const key = `return-proofs/${order.id}-${Date.now()}.jpg`;
      try {
        ({ url: photoUrl } = await putProofFile(key, jpeg, "image/jpeg"));
      } catch {
        throw new ApiError(503, "ფოტო-საცავი მიუწვდომელია — სცადე მოგვიანებით ან დაუკავშირდი დისპეჩერს");
      }
    }

    const eligible = order.parcels
      .filter((p) => p.status === "RETURN_REQUESTED")
      .sort((a, b) => a.sequenceNo - b.sequenceNo);

    if (eligible.length === 0) throw new ApiError(409, "დასაბრუნებელი ამანათი არ არის");
    if (body.returnedCount > eligible.length)
      throw new ApiError(422, "რაოდენობა დასაბრუნებელ ამანათებზე მეტია");

    const toReturn = eligible.slice(0, body.returnedCount);
    const overrideNote = isDispatcher
      ? `დისპეჩერის override — ხელით დადასტურდა: ${body.reason}`
      : body.note;

    const { returnedCount, returnFeeCharged } = await prisma.$transaction(async (tx) => {
      const now = new Date();
      let returnFeeCharged = 0;
      let returnedCount = 0;
      for (const p of toReturn) {
        // თითო ამანათზე compare-and-swap — პარალელური/განმეორებითი request-ი
        // იმავე ამანათს მეორედ ვერ დაარიცხავს.
        const claimed = await tx.orderParcel.updateMany({
          where: { id: p.id, status: "RETURN_REQUESTED" },
          data: {
            status: "RETURNED",
            returnedAt: now,
            // photoUrl არასდროს ნულავს არსებულ მნიშვნელობას — მხოლოდ მაშინ წერს,
            // როცა ეს request-ი ახალ ფოტოს ატვირთავს.
            ...(photoUrl ? { returnProofPhotoUrl: photoUrl, returnProofAt: now } : {}),
          },
        });
        if (claimed.count === 0) continue;
        returnedCount++;
        await tx.orderParcelEvent.create({
          data: {
            parcelId: p.id,
            status: "RETURNED",
            note: isDispatcher
              ? `დისპეჩერი (${session.sub}) — ხელით/override დადასტურება: ${body.reason}`
              : body.note,
            actorId: session.sub,
          },
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
                note: `დაბრუნებულია ${returnedCount} ამანათი${overrideNote ? ` — ${overrideNote}` : ""}`,
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
        title: isDispatcher ? "დაბრუნება — დისპეჩერის override" : "ამანათი დაბრუნდა",
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
