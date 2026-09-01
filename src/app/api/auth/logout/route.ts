import { clearSessionCookie } from "@/lib/auth/session";
import { handle, ok } from "@/lib/api";

export function POST() {
  return handle(async () => {
    clearSessionCookie();
    return ok({ ok: true });
  });
}
