import { z } from "zod";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
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
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
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
const provisionSchema = z.object({ action: z.literal("provision-admin") });

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

    if (body?.action === "provision-admin") {
      provisionSchema.parse(body);
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminEmail || !adminPassword) {
        return fail(503, "ADMIN_EMAIL/ADMIN_PASSWORD არ არის კონფიგურირებული");
      }

      const collision = await prisma.user.findUnique({
        where: { email: adminEmail },
        select: { id: true, role: true },
      });

      if (collision && collision.role !== "DISPATCHER") {
        return fail(
          409,
          `ADMIN_EMAIL (${adminEmail}) უკვე ეკუთვნის ${collision.role} როლის ანგარიშს (id: ${collision.id}). არაფერი არ შეცვლილა.`,
        );
      }

      const passwordHash = await hashPassword(adminPassword);

      if (collision && collision.role === "DISPATCHER") {
        // ანგარიში უკვე ADMIN_EMAIL-ზეა — მხოლოდ პაროლის განახლება (idempotent ხელახალი გაშვება)
        const updated = await prisma.user.update({
          where: { id: collision.id },
          data: { passwordHash },
          select: { id: true, email: true, role: true, createdAt: true },
        });
        return ok({ provisioned: { ...updated, note: "already-at-admin-email — მხოლოდ პაროლი განახლდა" } });
      }

      const dispatchers = await prisma.user.findMany({
        where: { role: "DISPATCHER" },
        select: { id: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });

      if (dispatchers.length === 0) {
        return fail(404, "DISPATCHER როლის ანგარიში ვერ მოიძებნა — გადასატანი ანგარიში არ არსებობს");
      }
      if (dispatchers.length > 1) {
        return NextResponse.json(
          {
            error: "რამდენიმე DISPATCHER ანგარიშია — უსაფრთხოდ ვერ ავირჩევთ მთავარს. არაფერი არ შეცვლილა.",
            dispatchers,
          },
          { status: 409 },
        );
      }

      const target = dispatchers[0]!;
      const updated = await prisma.$transaction(async (tx) => {
        return tx.user.update({
          where: { id: target.id },
          data: { email: adminEmail, passwordHash },
          select: { id: true, email: true, role: true, createdAt: true },
        });
      });

      return ok({ provisioned: updated });
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
