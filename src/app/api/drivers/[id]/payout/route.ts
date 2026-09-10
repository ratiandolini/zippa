import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { payoutSchema } from "@/lib/validation";
import { notifyDriver } from "@/lib/notify";
import { GEL } from "@/lib/domain";

export function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    const { amount, note } = payoutSchema.parse(await req.json());

    const dp = await prisma.driverProfile.findUnique({ where: { id: params.id } });
    if (!dp) return fail(404, "კურიერი ვერ მოიძებნა");
    if (amount > Number(dp.unpaidEarnings) + 0.01)
      throw new ApiError(400, "თანხა აღემატება გადასახდელ ანაზღაურებას");

    await prisma.$transaction(async (tx) => {
      // ── ატომურად ჩამოვჭრათ ბალანსი — მხოლოდ თუ საკმარისია.
      //    პარალელური/განმეორებითი გადახდა მეორედ ვერ გაივლის (count = 0),
      //    unpaidEarnings ვერ გახდება უარყოფითი. ──
      const dec = await tx.driverProfile.updateMany({
        where: { id: dp.id, unpaidEarnings: { gte: amount - 0.01 } },
        data: { unpaidEarnings: { decrement: amount } },
      });
      if (dec.count === 0)
        throw new ApiError(409, "ანაზღაურება უკვე გადახდილია ან შეიცვალა — განაახლე გვერდი");

      const earnings = await tx.driverEarning.findMany({
        where: { driverId: dp.id, isSettled: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true },
      });
      const from = earnings[0]?.createdAt ?? new Date();
      const to = earnings[earnings.length - 1]?.createdAt ?? new Date();

      await tx.payout.create({
        data: {
          driverId: dp.id,
          amount,
          note,
          periodFrom: from,
          periodTo: to,
          createdById: session.sub,
        },
      });
      if (earnings.length)
        await tx.driverEarning.updateMany({
          where: { id: { in: earnings.map((e) => e.id) } },
          data: { isSettled: true },
        });
    });

    await notifyDriver(dp.id, {
      type: "PAYMENT",
      title: "ანაზღაურება გადმოგერიცხა",
      body: `${GEL(amount)}${note ? ` — ${note}` : ""}`,
    });

    return ok({ ok: true });
  });
}
