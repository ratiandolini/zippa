import { prisma } from "@/lib/db";
import { handle, ok, ApiError, throttle } from "@/lib/api";
import { resetSchema } from "@/lib/validation";
import { findUserByEmailOrPhone } from "@/lib/auth/lookup";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export function POST(req: Request) {
  return handle(async () => {
    throttle(req, "reset", 10, 900);
    const { emailOrPhone, code, newPassword } = resetSchema.parse(await req.json());
    const user = await findUserByEmailOrPhone(emailOrPhone);
    if (!user) throw new ApiError(400, "კოდი არასწორია ან ვადაგასულია");

    const pr = await prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!pr || pr.attempts >= 5) throw new ApiError(400, "კოდი არასწორია ან ვადაგასულია");

    if (!(await verifyPassword(code, pr.codeHash))) {
      await prisma.passwordReset.update({
        where: { id: pr.id },
        data: { attempts: { increment: 1 } },
      });
      throw new ApiError(400, "კოდი არასწორია");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(newPassword),
          tokenVersion: { increment: 1 }, // ძველი სესიები იკვდება
        },
      }),
      prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    return ok({ ok: true });
  });
}
