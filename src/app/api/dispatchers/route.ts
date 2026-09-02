import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { requireRole, handle, ok, ApiError } from "@/lib/api";
import { createDispatcherSchema } from "@/lib/validation";

export function GET() {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const list = await prisma.user.findMany({
      where: { role: "DISPATCHER" },
      select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return ok({
      dispatchers: list.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const data = createDispatcherSchema.parse(await req.json());

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: data.email }, { phone: data.phone }] },
      select: { email: true },
    });
    if (existing) {
      throw new ApiError(
        409,
        existing.email === data.email
          ? "ეს ელფოსტა უკვე რეგისტრირებულია"
          : "ეს ტელეფონი უკვე რეგისტრირებულია",
      );
    }

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        passwordHash: await hashPassword(data.password),
        role: "DISPATCHER",
      },
      select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true },
    });

    return ok({ dispatcher: { ...user, createdAt: user.createdAt.toISOString() } }, 201);
  });
}
