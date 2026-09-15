import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/db";
import { handle, ok, throttle } from "@/lib/api";
import { forgotSchema } from "@/lib/validation";
import { findUserByEmailOrPhone } from "@/lib/auth/lookup";
import { hashPassword } from "@/lib/auth/password";
import { sendSms, smsTemplates } from "@/lib/sms";
import { sendEmail, emailTemplates } from "@/lib/email";

const WINDOW_MS = 15 * 60 * 1000;

export function POST(req: Request) {
  return handle(async () => {
    await throttle(req, "forgot", 5, 3600);
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
        const tpl = emailTemplates.resetCode(code);
        const [, emailResult] = await Promise.all([
          sendSms(user.phone, smsTemplates.resetCode(code)),
          sendEmail(user.email, tpl.subject, tpl.text),
        ]);
        // მხოლოდ უსაფრთხო, არა-მგრმნობიარე ველები — არასდროს ელფოსტა/კოდი/
        // key/token/provider-ის raw პასუხი. კლიენტის პასუხი უცვლელია (§3).
        if (!emailResult.ok) {
          Sentry.captureMessage("password-reset email send failed", {
            level: "warning",
            tags: {
              email_provider: emailResult.provider,
              email_failure_category: emailResult.category ?? "unknown",
            },
          });
        }
      }
    }

    return ok({ ok: true });
  });
}
