import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { findUserByEmailOrPhone } from "@/lib/auth/lookup";
import { loginSchema } from "@/lib/validation";
import { handle, ok, ApiError, throttle } from "@/lib/api";

export function POST(req: Request) {
  return handle(async () => {
    throttle(req, "login", 10, 300);
    const { emailOrPhone, password } = loginSchema.parse(await req.json());

    const user = await findUserByEmailOrPhone(emailOrPhone);
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      throw new ApiError(401, "ელფოსტა/ტელეფონი ან პაროლი არასწორია");
    }

    await createSession({ sub: user.id, role: user.role, name: user.name, email: user.email });
    return ok({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  });
}
