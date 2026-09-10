// განაწილებული rate-limit — PostgreSQL-ზე, რომ Vercel-ის ყველა serverless
// ინსტანსს შორის ერთი და იგივე მრიცხველი ჰქონდეს.
// DB-ის ჩავარდნისას — **მკაცრი in-memory fallback** (არასდროს „შეზღუდვის გარეშე").
import { prisma } from "@/lib/db";

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
  /** true — თუ პასუხი DB-ის ნაცვლად degraded in-memory fallback-იდან მოვიდა */
  degraded?: boolean;
}

// ── მკაცრი in-memory fallback (per-instance) ──
interface Bucket {
  count: number;
  resetAt: number;
}
const memBuckets = new Map<string, Bucket>();

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of memBuckets) if (b.resetAt < now) memBuckets.delete(k);
  }, 60_000).unref?.();
}

function memRateLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const b = memBuckets.get(key);
  if (!b || b.resetAt < now) {
    memBuckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, retryAfterSec: 0, degraded: true };
  }
  b.count++;
  if (b.count > limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      degraded: true,
    };
  }
  return { ok: true, retryAfterSec: 0, degraded: true };
}

/**
 * `key` — მაგ. `login:${ip}`. ლიმიტი `limit` მოთხოვნა `windowSec` წამში.
 * ერთი ატომური `INSERT … ON CONFLICT DO UPDATE` — race-safe.
 * DB შეცდომაზე → მკაცრი in-memory fallback (`degraded: true`).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);

  try {
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
      RETURNING "count", "resetAt"`;

    const row = rows[0];
    if (!row) return memRateLimit(key, limit, windowSec); // მოულოდნელი — fallback
    const count = Number(row.count);
    if (count > limit) {
      const retry = Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - now.getTime()) / 1000));
      return { ok: false, retryAfterSec: retry };
    }
    return { ok: true, retryAfterSec: 0 };
  } catch {
    // ბაზა მიუწვდომელია — მკაცრი per-instance ლიმიტი (არასდროს unlimited)
    return memRateLimit(key, limit, windowSec);
  }
}

/** ვადაგასული ჩანაწერების გაწმენდა — cron-იდან (არასავალდებულო). */
export async function pruneRateLimits(): Promise<number> {
  const res = await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
  return res.count;
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}
