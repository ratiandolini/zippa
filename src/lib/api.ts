import { NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { getSession, type SessionPayload } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import type { Role } from "@prisma/client";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** ცენტრალიზებული შეცდომების დამმუშავებელი route handler-ებისთვის */
export function handle(fn: () => Promise<Response>) {
  return fn().catch((err) => {
    // Next.js-ის შიდა კონტროლ-ფლოუ შეცდომები უნდა გავიდეს ხელუხლებლად
    if (err?.digest?.startsWith?.("DYNAMIC_SERVER_USAGE") || err?.digest === "NEXT_REDIRECT")
      throw err;
    if (err instanceof ApiError) return fail(err.status, err.message);
    if (err?.name === "InactiveZoneError") return fail(409, err.message);
    if (err instanceof ZodError) {
      // dotted-path fieldErrors (მაგ. "sender.phone") — რომ კლიენტმა კონკრეტულ ველთან აჩვენოს
      const fieldErrors: Record<string, string[]> = {};
      const formErrors: string[] = [];
      for (const i of err.issues) {
        const key = i.path.join(".");
        if (key) (fieldErrors[key] ??= []).push(i.message);
        else formErrors.push(i.message);
      }
      return NextResponse.json(
        { error: "ვალიდაციის შეცდომა", issues: { formErrors, fieldErrors } },
        { status: 422 },
      );
    }
    console.error("[API]", err);
    Sentry.captureException(err);
    return fail(500, "სერვერის შიდა შეცდომა");
  });
}

/** rate limit helper — throws ApiError(429) როცა ლიმიტი გადაცილებულია */
export async function throttle(req: Request, name: string, limit: number, windowSec: number) {
  const r = await rateLimit(`${name}:${clientIp(req)}`, limit, windowSec);
  if (!r.ok) throw new ApiError(429, `ბევრი მცდელობა. სცადე ${r.retryAfterSec} წამში.`);
}

export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "ავტორიზაცია საჭიროა");
  return session;
}

export async function requireRole(...roles: Role[]): Promise<SessionPayload> {
  const session = await requireUser();
  if (!roles.includes(session.role)) throw new ApiError(403, "წვდომა აკრძალულია");
  return session;
}
