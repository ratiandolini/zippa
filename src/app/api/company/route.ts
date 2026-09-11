import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { companyProfileSchema } from "@/lib/validation";
import { PARTNER_ONBOARDING_ENABLED } from "@/lib/flags";

function guard() {
  if (!PARTNER_ONBOARDING_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
}

const EDITABLE_STATUSES = ["DRAFT", "CHANGES_REQUESTED"];

export function GET() {
  return handle(async () => {
    guard();
    const session = await requireRole("CUSTOMER");
    const profile = await prisma.companyProfile.findUnique({
      where: { ownerUserId: session.sub },
      include: {
        contractAcceptances: { orderBy: { acceptedAt: "desc" }, take: 1 },
        pricingProfiles: { where: { active: true }, take: 1 },
      },
    });
    if (!profile) return ok({ profile: null });
    return ok({
      profile: {
        id: profile.id,
        legalName: profile.legalName,
        taxId: profile.taxId,
        legalAddress: profile.legalAddress,
        contactPersonName: profile.contactPersonName,
        contactEmail: profile.contactEmail,
        contactPhone: profile.contactPhone,
        billingEmail: profile.billingEmail,
        status: profile.status,
        rejectionReason: profile.rejectionReason,
        changesRequestedMessage: profile.changesRequestedMessage,
        submittedAt: profile.submittedAt?.toISOString() ?? null,
        editable: EDITABLE_STATUSES.includes(profile.status),
        lastAcceptance: profile.contractAcceptances[0]
          ? {
              contractVersion: profile.contractAcceptances[0].contractVersion,
              acceptedAt: profile.contractAcceptances[0].acceptedAt.toISOString(),
            }
          : null,
        activePricing: profile.pricingProfiles[0]
          ? { pricingMode: profile.pricingProfiles[0].pricingMode }
          : null,
      },
    });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    guard();
    const session = await requireRole("CUSTOMER");
    const data = companyProfileSchema.parse(await req.json());

    const existing = await prisma.companyProfile.findUnique({
      where: { ownerUserId: session.sub },
      select: { id: true, status: true },
    });
    if (existing && !EDITABLE_STATUSES.includes(existing.status)) {
      return fail(409, "პროფილი განხილვის ან დამტკიცების ეტაპზეა — ამ მომენტში რედაქტირება არ შესაძლებელია");
    }

    const payload = {
      legalName: data.legalName,
      taxId: data.taxId,
      legalAddress: data.legalAddress,
      contactPersonName: data.contactPersonName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      billingEmail: data.billingEmail || null,
    };

    const profile = existing
      ? await prisma.companyProfile.update({
          where: { id: existing.id },
          // ცვლილების-მოთხოვნის შემდეგ ხელახლა შენახვა → DRAFT-ში ბრუნდება ხელახალ submit-ამდე
          data: { ...payload, status: "DRAFT", changesRequestedMessage: null },
        })
      : await prisma.companyProfile.create({
          data: { ...payload, ownerUserId: session.sub },
        });

    return ok({ profile: { id: profile.id, status: profile.status } });
  });
}
