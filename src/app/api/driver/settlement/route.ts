import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";

const schema = z.object({ amount: z.number().positive(), note: z.string().max(200).optional() });

// კურიერი აცხადებს ნაღდი ფულის ჩაბარებას (დისპეჩერი ადასტურებს — მომდევნო ვერსია)
export function POST(req: Request) {
  return handle(async () => {
    const session = await requireRole("DRIVER");
    const { amount, note } = schema.parse(await req.json());
    const dp = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
    if (!dp) return fail(404, "პროფილი ვერ მოიძებნა");
    if (amount > Number(dp.cashOnHand) + 0.01)
      throw new ApiError(400, "თანხა აღემატება ხელზე არსებულ ნაღდს");

    await prisma.$transaction([
      prisma.cashSettlement.create({ data: { driverId: dp.id, amount, note } }),
      prisma.driverProfile.update({
        where: { id: dp.id },
        data: { cashOnHand: { decrement: amount } },
      }),
    ]);
    return ok({ ok: true });
  });
}
