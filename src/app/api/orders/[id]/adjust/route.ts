import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { GEL } from "@/lib/domain";

const schema = z.object({
  amount: z.number().positive().max(100000).optional(), // მომხმარებელს ჩასარიცხი
  kind: z.enum(["REFUND", "COMPENSATION", "GOODWILL"]).optional(),
  reason: z.string().trim().min(3, "მიუთითე მიზეზი").max(300).optional(),
  waiveReturnFee: z.boolean().optional(), // ჩაშლის საფასურის გაუქმება
});

const KIND_LABEL: Record<string, string> = {
  REFUND: "მიტანის საფასურის დაბრუნება",
  COMPENSATION: "ნივთის ანაზღაურება",
  GOODWILL: "ანაზღაურება",
};

// დისპეჩერი: მომხმარებელს ურიცხავს ანაზღაურებას / აუქმებს ჩაშლის საფასურს
export function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    const body = schema.parse(await req.json());

    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");

    let waived = false;
    if (body.waiveReturnFee && Number(order.returnFee) > 0 && !order.chargeSettledAt) {
      await prisma.order.update({ where: { id: order.id }, data: { returnFee: 0 } });
      waived = true;
    }

    let adjusted = 0;
    if (body.amount && body.amount > 0) {
      if (!body.reason) throw new ApiError(422, "მიუთითე მიზეზი");
      await prisma.customerAdjustment.create({
        data: {
          customerId: order.customerId,
          orderId: order.id,
          amount: body.amount,
          kind: body.kind ?? "GOODWILL",
          reason: body.reason,
          createdById: session.sub,
        },
      });
      adjusted = body.amount;
    }

    if (!waived && !adjusted) throw new ApiError(400, "არაფერი შესაცვლელი");

    await prisma.order.update({
      where: { id: order.id },
      data: {
        events: {
          create: {
            status: order.status,
            note: [
              waived ? "ჩაშლის საფასური გაუქმდა" : null,
              adjusted ? `მომხმარებელს დაერიცხა ${GEL(adjusted)} (${KIND_LABEL[body.kind ?? "GOODWILL"]})` : null,
            ]
              .filter(Boolean)
              .join(" · "),
            actorId: session.sub,
          },
        },
      },
    });

    if (adjusted) {
      await notify(order.customerId, {
        type: "PAYMENT",
        title: "ანაზღაურება დაგერიცხათ",
        body: `${GEL(adjusted)} — ${body.reason} · შეკვეთა ${order.trackingNumber}`,
        data: { orderId: order.id },
      });
    }

    return ok({ ok: true, waived, adjusted });
  });
}
