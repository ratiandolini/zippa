import { prisma } from "@/lib/db";
import { getSession, createSession } from "@/lib/auth/session";
import { handle, ok, fail, requireUser, ApiError } from "@/lib/api";
import { updateProfileSchema } from "@/lib/validation";

export function PATCH(req: Request) {
  return handle(async () => {
    const session = await requireUser();
    const data = updateProfileSchema.parse(await req.json());

    if (data.phone) {
      const clash = await prisma.user.findFirst({
        where: { phone: data.phone, NOT: { id: session.sub } },
        select: { id: true },
      });
      if (clash) throw new ApiError(409, "ეს ტელეფონი უკვე გამოიყენება");
    }

    const user = await prisma.user.update({
      where: { id: session.sub },
      data: { ...(data.name ? { name: data.name } : {}), ...(data.phone ? { phone: data.phone } : {}) },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });

    // სესიის განახლება (სახელი JWT-შია)
    await createSession({ sub: user.id, role: user.role, name: user.name, email: user.email });
    return ok({ user });
  });
}

export function GET() {
  return handle(async () => {
    const session = await getSession();
    if (!session) return fail(401, "ავტორიზაცია საჭიროა");

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });
    if (!user) return fail(401, "მომხმარებელი ვერ მოიძებნა");
    return ok({ user });
  });
}
