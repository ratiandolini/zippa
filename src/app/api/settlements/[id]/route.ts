import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { settlementReviewSchema } from "@/lib/validation";
import { notifyDriver } from "@/lib/notify";

// დისპეჩერი ადასტურებს ან უარყოფს კურიერის ნაღდის ჩაბარებას.
// CONFIRM → cashOnHand მცირდება. REJECT → ბალანსი უცვლელი, კურიერი თავიდან აცხადებს.
export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    const { action, note } = settlementReviewSchema.parse(await req.json());

    const s = await prisma.cashSettlement.findUnique({ where: { id: params.id } });
    if (!s) return fail(404, "ჩანაწერი ვერ მოიძებნა");
    if (s.status !== "PENDING") throw new ApiError(409, "ჩანაწერი უკვე დამუშავებულია");

    if (action === "CONFIRM") {
      await prisma.$transaction([
        prisma.cashSettlement.update({
          where: { id: s.id },
          data: {
            status: "CONFIRMED",
            confirmedById: session.sub,
            confirmedAt: new Date(),
            note: note ?? s.note,
          },
        }),
        prisma.driverProfile.update({
          where: { id: s.driverId },
          data: { cashOnHand: { decrement: Number(s.amount) } },
        }),
      ]);
      await notifyDriver(s.driverId, {
        type: "PAYMENT",
        title: "ნაღდის ჩაბარება დადასტურდა",
        body: `${Number(s.amount)} ₾ ჩაითვალა`,
      });
    } else {
      await prisma.cashSettlement.update({
        where: { id: s.id },
        data: {
          status: "REJECTED",
          confirmedById: session.sub,
          confirmedAt: new Date(),
          note: note ?? s.note,
        },
      });
      await notifyDriver(s.driverId, {
        type: "PAYMENT",
        title: "ნაღდის ჩაბარება უარყოფილია",
        body: `${Number(s.amount)} ₾ — დაუკავშირდი დისპეჩერს${note ? ` · ${note}` : ""}`,
      });
    }

    return ok({ ok: true });
  });
}
