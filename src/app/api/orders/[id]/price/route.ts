import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { adjustPriceSchema } from "@/lib/validation";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { reallocateParcels } from "@/lib/parcels";
import { notify } from "@/lib/notify";

const r2 = (n: number) => Math.round(n * 100) / 100;

// დისპეჩერი ხელით ასწორებს ფასს — მხოლოდ სანამ კურიერი მუშაობას დაიწყებს
export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    const { deliveryPrice, driverFee, reason } = adjustPriceSchema.parse(await req.json());

    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (!["PENDING", "ASSIGNED"].includes(order.status))
      throw new ApiError(409, "ფასს მხოლოდ მიღებამდე (PENDING / ASSIGNED) ასწორებ");

    // Audit fix (B3) — იგივე დაცვა, რაც ჩვეულებრივ რედაქტირებაზე: მრავალამანათიან
    // შეკვეთაზე ხელით ფასის შესწორება დაშვებულია მხოლოდ მანამ, სანამ ყველა
    // ამანათი კვლავ PENDING-ია.
    let multiParcelRows: { id: string }[] = [];
    if (order.isMultiParcel) {
      const parcels = await prisma.orderParcel.findMany({
        where: { orderId: order.id },
        orderBy: { sequenceNo: "asc" },
        select: { id: true, status: true },
      });
      if (parcels.some((p) => p.status !== "PENDING"))
        throw new ApiError(409, "ამანათები უკვე დამუშავებულია — ფასი ვერ შესწორდება ამ ეტაპზე");
      multiParcelRows = parcels;
    }

    const codFee = Number(order.codFee);
    const totalPrice = r2(deliveryPrice + codFee);
    const collectAmount = Number(order.collectAmount);
    const codCommission = Number(order.codCommission);
    const codAmount = r2((order.paymentMethod === "CASH" ? totalPrice : 0) + collectAmount);
    const companyMargin = r2(totalPrice + codCommission - driverFee - Number(order.partnerCost));

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: order.id },
        data: {
          deliveryPrice,
          driverFee,
          totalPrice,
          codAmount,
          companyMargin,
          pricingSource: "MANUAL",
          priceAdjustmentReason: reason,
          priceAdjustedById: session.sub,
          priceAdjustedAt: new Date(),
          needsManualReview: false,
          events: {
            create: {
              status: order.status,
              note: order.isMultiParcel
                ? `ფასის შესწორება: მიტანა ${deliveryPrice} ₾ · კურიერს ${driverFee} ₾ · ${reason} — ${multiParcelRows.length} ამანათის ალოკაცია ხელახლა გამოთვლილია`
                : `ფასის შესწორება: მიტანა ${deliveryPrice} ₾ · კურიერს ${driverFee} ₾ · ${reason}`,
              actorId: session.sub,
            },
          },
        },
        include: orderInclude,
      });

      if (order.isMultiParcel && multiParcelRows.length > 0) {
        await reallocateParcels(tx, multiParcelRows, { deliveryPrice, driverFee, collectAmount });
      }

      return o;
    });

    await notify(order.customerId, {
      title: "მიტანის ფასი განახლდა",
      body: `შეკვეთა ${order.trackingNumber} — ახალი ფასი ${totalPrice} ₾ (${reason})`,
      data: { orderId: order.id },
    });

    return ok({ order: serializeOrder(updated) });
  });
}
