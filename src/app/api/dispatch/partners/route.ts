import { prisma } from "@/lib/db";
import { requireRole, handle, ok, ApiError } from "@/lib/api";
import { PARTNER_ONBOARDING_ENABLED } from "@/lib/flags";
import type { CompanyProfileStatus } from "@prisma/client";

const VALID_STATUSES: CompanyProfileStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
];

export function GET(req: Request) {
  return handle(async () => {
    if (!PARTNER_ONBOARDING_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
    await requireRole("DISPATCHER");
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam && VALID_STATUSES.includes(statusParam as CompanyProfileStatus)
        ? (statusParam as CompanyProfileStatus)
        : undefined;

    const profiles = await prisma.companyProfile.findMany({
      where: status ? { status } : {},
      select: {
        id: true,
        legalName: true,
        taxId: true,
        contactPersonName: true,
        status: true,
        submittedAt: true,
        createdAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    return ok({
      partners: profiles.map((p) => ({
        ...p,
        submittedAt: p.submittedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  });
}
