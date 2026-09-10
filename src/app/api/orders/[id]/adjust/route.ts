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

    if (body.amount && body.amount > 0 && !body.reason)
      throw new ApiError(422, "მიუთითე მიზეზი");

    const { waived, adjusted, deduped } = await prisma.$transaction(async (tx) => {
      // ── შეკვეთის row-ს ჩავკეტავთ — პარალელური adjust იმავე შეკვეთაზე სერიულდება,
      //    ე.ი. dupe-შემოწმება ხედავს უკვე commit-ულ დარიცხვას. ──
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;

      // ── ატომური waive — მხოლოდ თუ returnFee ისევ დასარიცხია და ჯერ არ გასწორებულა ──
      let waived = false;
      if (body.waiveReturnFee) {
        const w = await tx.order.updateMany({
          where: { id: order.id, returnFee: { gt: 0 }, chargeSettledAt: null },
          data: { returnFee: 0 },
        });
        if (w.count > 0) {
          waived = true;
        } else {
          // უკვე გაუქმებული/გასწორებული — განმეორებითი მოთხოვნა იდემპოტენტურია
          const cur = await tx.order.findUnique({
            where: { id: order.id },
            select: { returnFee: true },
          });
          waived = Number(cur?.returnFee ?? 0) === 0;
        }
      }

      let adjusted = 0;
      let deduped = false;
      if (body.amount && body.amount > 0) {
        const kind = body.kind ?? "GOODWILL";
        // ── განმეორებითი დაჭერის დაცვა: ბოლო 60 წმ-ში იდენტური დარიცხვა თუ არსებობს,
        //    ხელახლა არ ვქმნით (ორმაგი კრედიტი). ──
        const dupe = await tx.customerAdjustment.findFirst({
          where: {
            orderId: order.id,
            customerId: order.customerId,
            amount: body.amount,
            kind,
            reason: body.reason,
            createdAt: { gt: new Date(Date.now() - 60_000) },
          },
        });
        if (dupe) {
          deduped = true; // განმეორებითი დაჭერა — ახალი დარიცხვა არ შექმნილა
        } else {
          await tx.customerAdjustment.create({
            data: {
              customerId: order.customerId,
              orderId: order.id,
              amount: body.amount,
              kind,
              reason: body.reason!,
              createdById: session.sub,
            },
          });
          adjusted = body.amount;
        }
      }

      if (!waived && !adjusted && !deduped) throw new ApiError(400, "არაფერი შესაცვლელი");
      return { waived, adjusted, deduped };
    });

    if (waived || adjusted) {
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
    }

    if (adjusted) {
      await notify(order.customerId, {
        type: "PAYMENT",
        title: "ანაზღაურება დაგერიცხათ",
        body: `${GEL(adjusted)} — ${body.reason} · შეკვეთა ${order.trackingNumber}`,
        data: { orderId: order.id },
      });
    }

    return ok({ ok: true, waived, adjusted, deduped });
  });
}
