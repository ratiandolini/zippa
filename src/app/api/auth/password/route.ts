import { prisma } from "@/lib/db";
import { requireUser, handle, ok, ApiError } from "@/lib/api";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { changePasswordSchema } from "@/lib/validation";

export function POST(req: Request) {
  return handle(async () => {
    const session = await requireUser();
    const { currentPassword, newPassword } = changePasswordSchema.parse(await req.json());

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.sub } });
    if (!(await verifyPassword(currentPassword, user.passwordHash)))
      throw new ApiError(401, "მიმდინარე პაროლი არასწორია");

    // პაროლის ცვლილება → tokenVersion++ → ყველა სხვა სესია (მოწყობილობა) გაითიშება
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        tokenVersion: { increment: 1 },
      },
    });
    // მიმდინარე სესიას ვინარჩუნებთ — ვასწორებთ cookie-ს ახალი ვერსიით
    await createSession({
      sub: updated.id,
      role: updated.role,
      name: updated.name,
      email: updated.email,
      tv: updated.tokenVersion,
    });
    return ok({ ok: true });
  });
}
