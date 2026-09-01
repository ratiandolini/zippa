import { prisma } from "@/lib/db";
import { requireUser, handle, ok, ApiError } from "@/lib/api";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { changePasswordSchema } from "@/lib/validation";

export function POST(req: Request) {
  return handle(async () => {
    const session = await requireUser();
    const { currentPassword, newPassword } = changePasswordSchema.parse(await req.json());

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.sub } });
    if (!(await verifyPassword(currentPassword, user.passwordHash)))
      throw new ApiError(401, "მიმდინარე პაროლი არასწორია");

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    return ok({ ok: true });
  });
}
