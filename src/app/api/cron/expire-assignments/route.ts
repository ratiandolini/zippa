import { handle, ok, fail } from "@/lib/api";
import { expireStaleAssignments } from "@/lib/assignments";
import { pruneRateLimits } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * უპასუხო მიბმების დაბრუნება „მოლოდინში".
 * Vercel Cron ავტომატურად აგზავნის `Authorization: Bearer <CRON_SECRET>`-ს.
 * გარე cron-ისთვის: ?token=<CRON_SECRET ან SETUP_TOKEN>
 */
async function run(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET || process.env.SETUP_TOKEN;
    // fail-closed — secret-ის გარეშე endpoint დაკეტილია (Vercel Cron ავტომ. აგზავნის CRON_SECRET-ს)
    if (!secret) return fail(503, "CRON_SECRET არ არის კონფიგურირებული");
    const auth = req.headers.get("authorization");
    const qToken = new URL(req.url).searchParams.get("token");
    if (auth !== `Bearer ${secret}` && qToken !== secret) return fail(401, "unauthorized");
    const expired = await expireStaleAssignments();
    const rateLimitsPruned = await pruneRateLimits().catch(() => 0);
    return ok({ expired, rateLimitsPruned });
  });
}

export const GET = run;
export const POST = run;
