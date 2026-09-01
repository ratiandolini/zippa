import { prisma } from "@/lib/db";
import { handle, ok, throttle } from "@/lib/api";
import { forgotSchema } from "@/lib/validation";
import { findUserByEmailOrPhone } from "@/lib/auth/lookup";
import { hashPassword } from "@/lib/auth/password";
import { sendSms, smsTemplates } from "@/lib/sms";

const WINDOW_MS = 15 * 60 * 1000;

export function POST(req: Request) {
  return handle(async () => {
    throttle(req, "forgot", 5, 3600);
    const { emailOrPhone } = forgotSchema.parse(await req.json());
    const user = await findUserByEmailOrPhone(emailOrPhone);

    // ყოველთვის ერთი პასუხი — არსებობის გაჟონვის თავიდან ასაცილებლად
    if (user && user.isActive) {
      const recent = await prisma.passwordReset.count({
        where: { userId: user.id, createdAt: { gt: new Date(Date.now() - WINDOW_MS) } },
      });
      if (recent < 3) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await prisma.passwordReset.create({
          data: {
            userId: user.id,
            codeHash: await hashPassword(code),
            expiresAt: new Date(Date.now() + WINDOW_MS),
          },
        });
        await sendSms(user.phone, smsTemplates.resetCode(code));
      }
    }

    return ok({ ok: true });
  });
}
