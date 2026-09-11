import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, throttle, ApiError } from "@/lib/api";
import { companyReviewSchema } from "@/lib/validation";
import { CONTRACT_VERSION } from "@/lib/partner-contract";
import { notify } from "@/lib/notify";
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

// შენიშვნა: APPROVE არ ითხოვს/არ წერს ინდივიდუალურ ტარიფს (CompanyPricingProfile) —
// ფასების სისტემა გამარტივებულია ორ კატეგორიად (RETAIL/PARTNER), იხ. src/lib/pricing.ts.
// CompanyPricingProfile მოდელი დარჩენილია (არ წაშლილა), მაგრამ calculatePrice() მას არ კითხულობს.
const bodySchema = companyReviewSchema;

const REVIEW_LABEL: Record<string, string> = {
  APPROVE: "დამტკიცდა",
  CHANGES_REQUESTED: "ცვლილება მოთხოვნილია",
  REJECT: "უარყოფილია",
  SUSPEND: "შეჩერდა",
};

export function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    if (!PARTNER_ONBOARDING_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
    const session = await requireRole("DISPATCHER");
    await throttle(req, "partner-review", 30, 60);
    const body = bodySchema.parse(await req.json());

    const profile = await prisma.companyProfile.findUnique({
      where: { id: params.id },
      include: { contractAcceptances: { orderBy: { acceptedAt: "desc" }, take: 1 } },
    });
    if (!profile) return fail(404, "პარტნიორის განაცხადი ვერ მოიძებნა");

    // idempotent — უკვე იმ status-ში მდგომი განაცხადის ხელახლა იმავე action-ით გავლა 409-ს აბრუნებს
    const TERMINAL_MATCH: Record<string, string> = {
      APPROVE: "APPROVED",
      REJECT: "REJECTED",
      SUSPEND: "SUSPENDED",
    };
    if (TERMINAL_MATCH[body.action] === profile.status) {
      return fail(409, `განაცხადი უკვე ${REVIEW_LABEL[body.action]}-ია`);
    }

    if (body.action === "APPROVE") {
      const missing = REQUIRED_FIELDS.filter((f) => !profile[f] || String(profile[f]).trim() === "");
      const latestAcceptance = profile.contractAcceptances[0];
      const problems: string[] = [];
      if (missing.length) problems.push(`ცარიელი ველები: ${missing.join(", ")}`);
      if (!latestAcceptance) problems.push("ხელშეკრულებაზე თანხმობა არ არსებობს");
      else if (latestAcceptance.contractVersion !== CONTRACT_VERSION)
        problems.push(
          `თანხმობა ძველ ვერსიაზეა (${latestAcceptance.contractVersion}), საჭირო: ${CONTRACT_VERSION}`,
        );
      if (!["SUBMITTED", "CHANGES_REQUESTED"].includes(profile.status))
        problems.push(`სტატუსი (${profile.status}) არ არის განხილვისთვის მზადყოფნაში`);

      if (problems.length) {
        return fail(422, `დამტკიცება შეუძლებელია: ${problems.join("; ")}`);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {
        reviewedAt: new Date(),
        reviewedById: session.sub,
      };
      if (body.action === "APPROVE") {
        data.status = "APPROVED";
        data.rejectionReason = null;
        data.changesRequestedMessage = null;
      } else if (body.action === "CHANGES_REQUESTED") {
        data.status = "CHANGES_REQUESTED";
        data.changesRequestedMessage = body.message ?? "დისპეჩერმა მოითხოვა ცვლილება";
      } else if (body.action === "REJECT") {
        data.status = "REJECTED";
        data.rejectionReason = body.message ?? "განაცხადი უარყოფილია";
      } else if (body.action === "SUSPEND") {
        data.status = "SUSPENDED";
        data.rejectionReason = body.message ?? "პარტნიორობა შეჩერებულია";
      }

      const updated = await tx.companyProfile.update({ where: { id: profile.id }, data });

      await tx.partnerAuditEvent.create({
        data: {
          companyProfileId: profile.id,
          actorId: session.sub,
          action: body.action,
          message: body.message,
        },
      });

      return updated;
    });

    const notifBody: Record<string, string> = {
      APPROVE: `თქვენი კომპანია (${result.legalName}) დამტკიცდა Zippa-ს პარტნიორად.`,
      CHANGES_REQUESTED: `საჭიროა განაცხადის შესწორება: ${result.changesRequestedMessage ?? ""}`,
      REJECT: `თქვენი განაცხადი უარყოფილია: ${result.rejectionReason ?? ""}`,
      SUSPEND: `თქვენი პარტნიორობა შეჩერებულია: ${result.rejectionReason ?? ""}`,
    };
    await notify(profile.ownerUserId, {
      title: "პარტნიორის განაცხადის სტატუსი",
      body: notifBody[body.action] ?? "სტატუსი განახლდა",
      url: "/app",
    }).catch((e) => console.error("[partner-review] notify", e));
    await sendEmail(
      result.contactEmail,
      `Zippa — პარტნიორობის განაცხადი: ${REVIEW_LABEL[body.action]}`,
      notifBody[body.action] ?? "სტატუსი განახლდა",
    ).catch((e) => console.error("[partner-review] sendEmail", e));

    return ok({ profile: { id: result.id, status: result.status } });
  });
}
