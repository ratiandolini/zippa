import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { resolvePickupSchema } from "@/lib/validation";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { MULTI_PARCEL_ORDERS_ENABLED } from "@/lib/flags";
import { notifyDriver } from "@/lib/notify";

// Phase 2 fix — დისპეჩერის მარტივი ქმედება დარჩენილ (ჯერ არაღებულ) რაოდენობაზე:
//  - REASSIGN: შეკვეთის სტატუსი უბრუნდება EN_ROUTE_PICKUP-ს — იგივე კურიერი
//    ხელახლა მიდის დარჩენილი ამანათებისთვის. დაშვებულია მხოლოდ PICKED_UP-დან
//    (ნაწილი უკვე აღებულია, დანარჩენი — NOT_PICKED_UP).
//  - WRITE_OFF: დარჩენილი (PENDING/NOT_PICKED_UP) ამანათები CANCELLED-ზე გადადის,
//    დაშვებულია ნებისმიერ დროს (ფინალიზაციამდეც და მერეც). არასდროს ეხება
//    უკვე PICKED_UP/DELIVERED/სხვა-სტატუსიან ამანათს. ფინანსური adjustment
//    ცალკე არ იქმნება აქ — [id]/parcels/deliver-ის ფინალიზაცია უკვე ითვლის
//    ყველა არა-DELIVERED ამანათს (write-off-ის ჩათვლით) ერთხელ.
export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    if (!MULTI_PARCEL_ORDERS_ENABLED) return fail(404, "ვერ მოიძებნა");

    const session = await requireRole("DISPATCHER");
    const body = resolvePickupSchema.parse(await req.json());

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { parcels: true },
    });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (!order.isMultiParcel) return fail(409, "ეს არ არის მრავალამანათიანი შეკვეთა");
    if (order.status === "CANCELLED") throw new ApiError(409, "შეკვეთა უკვე გაუქმებულია");

    const remaining = order.parcels
      .filter((p) => p.status === "PENDING" || p.status === "NOT_PICKED_UP")
      .sort((a, b) => a.sequenceNo - b.sequenceNo);
    if (remaining.length === 0) throw new ApiError(409, "დარჩენილი ამანათი არ არის");

    if (body.action === "REASSIGN" && order.status !== "PICKED_UP")
      throw new ApiError(
        409,
        "ხელახლა მინიჭება შესაძლებელია მხოლოდ მას შემდეგ, რაც ნაწილი უკვე აღებულია",
      );

    const updated = await prisma.$transaction(async (tx) => {
      for (const p of remaining) {
        await tx.orderParcelEvent.create({
          data: {
            parcelId: p.id,
            status: body.action === "WRITE_OFF" ? "CANCELLED" : p.status,
            note: `დისპეჩერი — ${body.action === "WRITE_OFF" ? "ჩამოწერა" : "ხელახლა მინიჭება"}: ${body.reason}`,
            actorId: session.sub,
          },
        });
        if (body.action === "WRITE_OFF") {
          await tx.orderParcel.update({
            where: { id: p.id },
            data: { status: "CANCELLED", cancelledAt: new Date(), failureNote: body.reason },
          });
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          ...(body.action === "REASSIGN" ? { status: "EN_ROUTE_PICKUP" } : {}),
          events: {
            create: {
              status: body.action === "REASSIGN" ? "EN_ROUTE_PICKUP" : order.status,
              note: `დისპეჩერი — დარჩენილი ${remaining.length} ამანათი: ${
                body.action === "REASSIGN" ? "ხელახლა მინიჭება" : "ჩამოწერა"
              } — ${body.reason}`,
              actorId: session.sub,
            },
          },
        },
        include: orderInclude,
      });
    });

    if (body.action === "REASSIGN" && order.driverId) {
      await notifyDriver(order.driverId, {
        title: "დარჩენილი ამანათების ხელახლა აღება",
        body: `${order.trackingNumber} — დისპეჩერმა დაავალა ${remaining.length} ამანათის ხელახლა აღება: ${body.reason}`,
        data: { orderId: order.id },
      });
    }

    return ok({ order: serializeOrder(updated, session.role) });
  });
}
