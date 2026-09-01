import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getSession, type SessionPayload } from "./session";
import { ROLE_HOME } from "@/lib/domain";

/** სესია ან redirect /login-ზე */
export async function requireSession(role?: Role): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (role && session.role !== role) redirect(ROLE_HOME[session.role]);
  return session;
}
