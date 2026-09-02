import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  AUTH_COOKIE_NAME,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
  type SessionPayload,
} from "./jwt";

export type { SessionPayload };
export { AUTH_COOKIE_NAME };

export async function createSession(payload: SessionPayload) {
  const token = await signSession(payload);
  cookies().set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSessionCookie() {
  cookies().set(AUTH_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;

  // ბაზასთან გადამოწმება — გათიშული ან წაშლილი მომხმარებლის სესია აღარ მუშაობს,
  // როლის ცვლილება დაუყოვნებლივ აისახება.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { isActive: true, role: true, name: true, email: true },
  });
  if (!user || !user.isActive) return null;

  return { sub: payload.sub, role: user.role, name: user.name, email: user.email };
}
