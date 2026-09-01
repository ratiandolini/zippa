import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { registerSchema } from "@/lib/validation";
import { handle, ok, ApiError, throttle } from "@/lib/api";

export function POST(req: Request) {
  return handle(async () => {
    throttle(req, "register", 5, 3600);
    const body = await req.json();
    const data = registerSchema.parse(body);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: data.email }, { phone: data.phone }] },
      select: { email: true, phone: true },
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
        role: data.role,
        ...(data.role === "DRIVER"
          ? { driverProfile: { create: { isApproved: false, status: "OFFLINE" } } }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true },
    });

    await createSession({ sub: user.id, role: user.role, name: user.name, email: user.email });
    return ok({ user }, 201);
  });
}
