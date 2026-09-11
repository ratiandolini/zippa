import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, throttle, ApiError } from "@/lib/api";
import { clientIp } from "@/lib/rate-limit";
import { companySubmitSchema } from "@/lib/validation";
import { CONTRACT_VERSION, CONTRACT_TITLE, contractContentHash } from "@/lib/partner-contract";
import { notifyDispatchers } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { PARTNER_ONBOARDING_ENABLED } from "@/lib/flags";

const REQUIRED_FIELDS = [
  "legalName",
  "taxId",
  "legalAddress",
  "contactPersonName",
  "contactEmail",
  "contactPhone",
] as const;

export function POST(req: Request) {
  return handle(async () => {
    if (!PARTNER_ONBOARDING_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
    const session = await requireRole("CUSTOMER");
    await throttle(req, "company-submit", 5, 60);
    const data = companySubmitSchema.parse(await req.json());

    if (data.contractVersion !== CONTRACT_VERSION) {
      return fail(409, "ხელშეკრულების ახალი ვერსია გამოქვეყნდა — გთხოვთ, გვერდი განაახლოთ და ხელახლა გაეცნოთ ტექსტს");
    }

    const profile = await prisma.companyProfile.findUnique({ where: { ownerUserId: session.sub } });
    if (!profile) return fail(404, "ჯერ შეავსეთ კომპანიის მონაცემები");
    if (!["DRAFT", "CHANGES_REQUESTED"].includes(profile.status)) {
      return fail(409, "განაცხადი უკვე გაგზავნილი/განხილვის ეტაპზეა");
    }

    const missing = REQUIRED_FIELDS.filter((f) => !profile[f] || String(profile[f]).trim() === "");
    if (missing.length) {
      return fail(422, `შეავსეთ ველები: ${missing.join(", ")}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.companyContractAcceptance.create({
        data: {
          companyProfileId: profile.id,
          contractVersion: CONTRACT_VERSION,
          contractTitle: CONTRACT_TITLE,
          contractContentHash: contractContentHash(),
          acceptedByUserId: session.sub,
          acceptedIp: clientIp(req),
          acceptedUserAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        },
      });
      const updated = await tx.companyProfile.update({
        where: { id: profile.id },
        data: { status: "SUBMITTED", submittedAt: new Date(), changesRequestedMessage: null },
      });
      await tx.partnerAuditEvent.create({
        data: { companyProfileId: profile.id, actorId: session.sub, action: "SUBMITTED" },
      });
      return updated;
    });

    // ჯერ ბიზნეს-მდგომარეობა შენახულია — შეტყობინების ჩავარდნას transaction არ აქცევს
    await notifyDispatchers({
      title: "ახალი პარტნიორის განაცხადი",
      body: `${result.legalName} — გადასახედია დამტკიცებისთვის`,
      url: `/dispatch/partners/${result.id}`,
    }).catch((e) => console.error("[company-submit] notifyDispatchers", e));
    await sendEmail(
      result.contactEmail,
      "Zippa — თქვენი განაცხადი მიღებულია",
      `მოგესალმებით, ${result.contactPersonName}.\n\nთქვენი პარტნიორობის განაცხადი (${result.legalName}) მიღებულია და გადადის განხილვაზე. შედეგის შესახებ გეცნობებათ ელფოსტით.`,
    ).catch((e) => console.error("[company-submit] sendEmail", e));

    return ok({ profile: { id: result.id, status: result.status } });
  });
}
