import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { PARTNER_ONBOARDING_ENABLED, RETAIL_PRICE_MARKUP_GEL } from "@/lib/flags";
import { CONTRACT_VERSION, CONTRACT_TITLE, CONTRACT_CLAUSES } from "@/lib/partner-contract";

export function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    if (!PARTNER_ONBOARDING_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
    await requireRole("DISPATCHER");

    const profile = await prisma.companyProfile.findUnique({
      where: { id: params.id },
      include: {
        owner: { select: { email: true, phone: true, name: true } },
        reviewedBy: { select: { name: true } },
        contractAcceptances: { orderBy: { acceptedAt: "desc" } },
        auditEvents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!profile) return fail(404, "პარტნიორის განაცხადი ვერ მოიძებნა");

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
        reviewedAt: profile.reviewedAt?.toISOString() ?? null,
        reviewedByName: profile.reviewedBy?.name ?? null,
        ownerAccount: profile.owner,
      },
      contractAcceptances: profile.contractAcceptances.map((a) => ({
        contractVersion: a.contractVersion,
        acceptedAt: a.acceptedAt.toISOString(),
        acceptedIp: a.acceptedIp,
      })),
      currentContractVersion: CONTRACT_VERSION,
      acceptedCurrentVersion: profile.contractAcceptances.some(
        (a) => a.contractVersion === CONTRACT_VERSION,
      ),
      auditEvents: profile.auditEvents.map((e) => ({
        action: e.action,
        message: e.message,
        createdAt: e.createdAt.toISOString(),
      })),
      contractTitle: CONTRACT_TITLE,
      contractClauses: CONTRACT_CLAUSES,
      retailMarkupGel: Number(RETAIL_PRICE_MARKUP_GEL),
    });
  });
}
