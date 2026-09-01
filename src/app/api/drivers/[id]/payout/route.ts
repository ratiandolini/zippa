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

    const earnings = await prisma.driverEarning.findMany({
      where: { driverId: dp.id, isSettled: false },
      orderBy: { createdAt: "asc" },
    });
    const from = earnings[0]?.createdAt ?? new Date();
    const to = earnings[earnings.length - 1]?.createdAt ?? new Date();

    await prisma.$transaction([
      prisma.payout.create({
        data: {
          driverId: dp.id,
          amount,
          note,
          periodFrom: from,
          periodTo: to,
          createdById: session.sub,
        },
      }),
      prisma.driverEarning.updateMany({
        where: { driverId: dp.id, isSettled: false },
        data: { isSettled: true },
      }),
      prisma.driverProfile.update({
        where: { id: dp.id },
        data: { unpaidEarnings: { decrement: amount } },
      }),
    ]);

    await notifyDriver(dp.id, {
      type: "PAYMENT",
      title: "ანაზღაურება გადმოგერიცხა",
      body: `${GEL(amount)}${note ? ` — ${note}` : ""}`,
    });

    return ok({ ok: true });
  });
}
