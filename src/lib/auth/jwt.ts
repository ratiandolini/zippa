import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "skr_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 დღე

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET არ არის განსაზღვრული ან 32 სიმბოლოზე მოკლეა");
  }
  return new TextEncoder().encode(s);
}

export interface SessionPayload {
  sub: string;
  role: Role;
  name: string;
  email: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
