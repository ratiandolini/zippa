import { requireUser, handle, ok, ApiError } from "@/lib/api";
import { CONTRACT_VERSION, CONTRACT_TITLE, CONTRACT_CLAUSES, contractContentHash } from "@/lib/partner-contract";
import { PARTNER_ONBOARDING_ENABLED } from "@/lib/flags";

// ხელშეკრულების მიმდინარე ვერსია — ფორმაში ჩასასვლელად და PDF-ის გენერაციისთვის.
// LEGAL REVIEW REQUIRED შენიშვნა განზრახ არ ბრუნდება ამ endpoint-იდან.
export function GET() {
  return handle(async () => {
    if (!PARTNER_ONBOARDING_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
    await requireUser();
    return ok({
      version: CONTRACT_VERSION,
      title: CONTRACT_TITLE,
      contentHash: contractContentHash(),
      clauses: CONTRACT_CLAUSES.map((c) => ({ title: c.title, body: c.body })),
    });
  });
}
