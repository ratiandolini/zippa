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
    // Audit fix (R1) — მრავალამანათიან შეკვეთაზე ledger-based დაბრუნების
    // საფასურის გაუქმებას წერილობითი მიზეზი სავალდებულოა (append-only
    // reversal ჩანაწერი მხოლოდ ამ მიზეზით იქმნება).
    if (body.waiveReturnFee && order.isMultiParcel && !body.reason)
      throw new ApiError(422, "დაბრუნების საფასურის გაუქმებას მიზეზი სჭირდება");

    const { waived, waivedLedgerAmount, adjusted, deduped } = await prisma.$transaction(async (tx) => {
      // ── შეკვეთის row-ს ჩავკეტავთ — პარალელური adjust იმავე შეკვეთაზე სერიულდება,
      //    ე.ი. dupe-შემოწმება ხედავს უკვე commit-ულ დარიცხვას. ──
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;

      let waived = false;
      let waivedLedgerAmount = 0;
      if (body.waiveReturnFee && order.isMultiParcel) {
        // ── მრავალამანათიანი შეკვეთა — RETURN_FEE ledger-ჩანაწერების გაუქმება.
        //    ორიგინალი ჩანაწერი (amount/kind/reason) არასდროს არ იცვლება/იშლება —
        //    მხოლოდ settledAt ინიშნება (რომ განმეორებით არ დაექვემდებაროს), და
        //    ერთი დადებითი, append-only reversal იქმნება თითო ჩანაწერზე. ──
        const unsettled = await tx.customerAdjustment.findMany({
          where: { orderId: order.id, kind: "RETURN_FEE", settledAt: null },
        });
        for (const row of unsettled) {
          const claimed = await tx.customerAdjustment.updateMany({
            where: { id: row.id, settledAt: null },
            data: { settledAt: new Date() },
          });
          if (claimed.count === 0) continue; // პარალელურად უკვე დაჭერილი
          const fee = -Number(row.amount); // row.amount უარყოფითია (customer owes)
          await tx.customerAdjustment.create({
            data: {
              customerId: order.customerId,
              orderId: order.id,
              parcelId: row.parcelId,
              amount: fee,
              kind: "RETURN_FEE_WAIVED",
              reason: `დისპეჩერის გაუქმება — ${body.reason}`,
              createdById: session.sub,
            },
          });
          waived = true;
          waivedLedgerAmount = Math.round((waivedLedgerAmount + fee) * 100) / 100;
        }
      } else if (body.waiveReturnFee) {
        // ── ლეგასი ერთამანათიანი შეკვეთა — Order.returnFee ველი ──
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
      return { waived, waivedLedgerAmount, adjusted, deduped };
    });

    if (waived || adjusted) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          events: {
            create: {
              status: order.status,
              note: [
                waived && order.isMultiParcel
                  ? `დაბრუნების საფასური გაუქმდა (${GEL(waivedLedgerAmount)}) — ${body.reason}`
                  : waived
                    ? "ჩაშლის საფასური გაუქმდა"
                    : null,
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

    return ok({ ok: true, waived, waivedLedgerAmount, adjusted, deduped });
  });
}
