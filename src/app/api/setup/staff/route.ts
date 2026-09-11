import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { handle, ok, fail, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * ერთჯერადი სამართავი ინსტრუმენტი — დისპეჩერი/ადმინ ანგარიშების ინსპექცია და
 * ელფოსტის მიგრაცია. Role-ების სქემაში ცალკე "ADMIN" არ არსებობს — "DISPATCHER"
 * ერთდროულად ადმინისა და დისპეჩერის როლია (schema.prisma-ს კომენტარი).
 * გამოძახება: header x-setup-token: <SETUP_TOKEN>
 */
function checkToken(req: Request) {
  const token = process.env.SETUP_TOKEN;
  if (!token) throw new ApiError(503, "SETUP_TOKEN არ არის კონფიგურირებული");
  const given = req.headers.get("x-setup-token");
  if (given !== token) throw new ApiError(401, "არასწორი token");
}

export async function GET(req: Request) {
  return handle(async () => {
    checkToken(req);
    const staff = await prisma.user.findMany({
      where: { role: "DISPATCHER" },
      select: { email: true, role: true },
      orderBy: { email: "asc" },
    });
    return ok({ staff });
  });
}

const renameSchema = z.object({
  action: z.literal("rename"),
  email: z.string().email(),
  newEmail: z.string().email(),
});

const verifySchema = z.object({ action: z.literal("verify") });

export async function POST(req: Request) {
  return handle(async () => {
    checkToken(req);
    const body = await req.json();

    if (body?.action === "verify") {
      verifySchema.parse(body);
      const email = process.env.ADMIN_EMAIL?.toLowerCase();
      const pass = process.env.ADMIN_PASSWORD;
      if (!email || !pass) return fail(503, "ADMIN_EMAIL/ADMIN_PASSWORD არ არის კონფიგურირებული");
      const user = await prisma.user.findUnique({
        where: { email },
        select: { email: true, role: true, passwordHash: true },
      });
      if (!user || user.role !== "DISPATCHER") return ok({ ok: false, reason: "ანგარიში ვერ მოიძებნა" });
      const matches = await verifyPassword(pass, user.passwordHash);
      return ok({ ok: matches, email: user.email, role: user.role });
    }

    const { email, newEmail } = renameSchema.parse(body);
    try {
      const result = await prisma.user.updateMany({
        where: { email: email.toLowerCase(), role: "DISPATCHER" },
        data: { email: newEmail.toLowerCase() },
      });
      if (result.count === 0) {
        return fail(404, `DISPATCHER როლის ანგარიში ${email}-ით ვერ მოიძებნა`);
      }
      const updated = await prisma.user.findUnique({
        where: { email: newEmail.toLowerCase() },
        select: { email: true, role: true },
      });
      return ok({ renamed: updated });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail(409, `${newEmail} უკვე გამოყენებულია სხვა ანგარიშზე`);
      }
      throw e;
    }
  });
}
