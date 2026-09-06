import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { cashSettlementSchema } from "@/lib/validation";
import { notifyDispatchers } from "@/lib/notify";

// კურიერი აცხადებს ნაღდი ფულის ჩაბარებას — იქმნება PENDING ჩანაწერი.
// ბალანსი (cashOnHand) მცირდება მხოლოდ მას შემდეგ, რაც დისპეჩერი დაადასტურებს.
export function POST(req: Request) {
  return handle(async () => {
    const session = await requireRole("DRIVER");
    const { amount, note } = cashSettlementSchema.parse(await req.json());

    const dp = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
    if (!dp) return fail(404, "პროფილი ვერ მოიძებნა");

    const pending = await prisma.cashSettlement.findFirst({
      where: { driverId: dp.id, status: "PENDING" },
    });
    if (pending) throw new ApiError(409, "უკვე გაქვს დაუდასტურებელი ჩაბარება");

    if (amount > Number(dp.cashOnHand) + 0.01)
      throw new ApiError(400, "თანხა აღემატება ხელზე არსებულ ნაღდს");

    const s = await prisma.cashSettlement.create({
      data: { driverId: dp.id, amount, note, status: "PENDING" },
    });

    await notifyDispatchers({
      type: "PAYMENT",
      title: "ნაღდის ჩაბარება — დასადასტურებელი",
      body: `${session.name ?? "კურიერი"} აცხადებს ${amount} ₾-ის ჩაბარებას`,
      data: { settlementId: s.id },
    });

    return ok({ settlement: { id: s.id, amount: Number(s.amount), status: s.status } });
  });
}

// კურიერის საკუთარი ჩაბარებების ისტორია
export function GET() {
  return handle(async () => {
    const session = await requireRole("DRIVER");
    const dp = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
    if (!dp) return fail(404, "პროფილი ვერ მოიძებნა");

    const list = await prisma.cashSettlement.findMany({
      where: { driverId: dp.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return ok({
      settlements: list.map((s) => ({
        id: s.id,
        amount: Number(s.amount),
        note: s.note,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        confirmedAt: s.confirmedAt?.toISOString() ?? null,
      })),
    });
  });
}
