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
      await prisma.$transaction(async (tx) => {
        // ატომური CAS — მხოლოდ PENDING → CONFIRMED. განმეორებითი დადასტურება
        // ვერ ჩამოჭრის ბალანსს ორჯერ.
        const claim = await tx.cashSettlement.updateMany({
          where: { id: s.id, status: "PENDING" },
          data: {
            status: "CONFIRMED",
            confirmedById: session.sub,
            confirmedAt: new Date(),
            note: note ?? s.note,
          },
        });
        if (claim.count === 0) throw new ApiError(409, "ჩანაწერი უკვე დამუშავებულია");
        await tx.driverProfile.update({
          where: { id: s.driverId },
          data: { cashOnHand: { decrement: Number(s.amount) } },
        });
      });
      await notifyDriver(s.driverId, {
        type: "PAYMENT",
        title: "ნაღდის ჩაბარება დადასტურდა",
        body: `${Number(s.amount)} ₾ ჩაითვალა`,
      });
    } else {
      const claim = await prisma.cashSettlement.updateMany({
        where: { id: s.id, status: "PENDING" },
        data: {
          status: "REJECTED",
          confirmedById: session.sub,
          confirmedAt: new Date(),
          note: note ?? s.note,
        },
      });
      if (claim.count === 0) throw new ApiError(409, "ჩანაწერი უკვე დამუშავებულია");
      await notifyDriver(s.driverId, {
        type: "PAYMENT",
        title: "ნაღდის ჩაბარება უარყოფილია",
        body: `${Number(s.amount)} ₾ — დაუკავშირდი დისპეჩერს${note ? ` · ${note}` : ""}`,
      });
    }

    return ok({ ok: true });
  });
}
