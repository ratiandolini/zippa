import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, throttle, ApiError } from "@/lib/api";
import { companyPricingSchema } from "@/lib/validation";
import { PARTNER_ONBOARDING_ENABLED } from "@/lib/flags";

// APPROVED კომპანიის ტარიფის ცვლილება approve-flow-ის მიღმა (post-approval ცვლილება).
// ყოველი ცვლილება ცალკე audit event-ია — ისტორია არასდროს იშლება, მხოლოდ active=false ხდება.
export function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    if (!PARTNER_ONBOARDING_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
    const session = await requireRole("DISPATCHER");
    await throttle(req, "partner-pricing", 30, 60);
    const data = companyPricingSchema.parse(await req.json());

    const profile = await prisma.companyProfile.findUnique({ where: { id: params.id } });
    if (!profile) return fail(404, "პარტნიორის განაცხადი ვერ მოიძებნა");
    if (profile.status !== "APPROVED") {
      return fail(409, "ინდივიდუალური ტარიფი მხოლოდ დამტკიცებულ პარტნიორზე დაწესდება");
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.companyPricingProfile.updateMany({
        where: { companyProfileId: profile.id, active: true },
        data: { active: false },
      });
      let row = null;
      if (data.pricingMode !== "DEFAULT") {
        row = await tx.companyPricingProfile.create({
          data: {
            companyProfileId: profile.id,
            pricingMode: data.pricingMode,
            discountPercent: data.discountPercent ?? null,
            customRules: data.customRules ?? undefined,
            effectiveUntil: data.effectiveUntil ? new Date(data.effectiveUntil) : null,
            active: true,
            createdById: session.sub,
          },
        });
      }
      await tx.partnerAuditEvent.create({
        data: {
          companyProfileId: profile.id,
          actorId: session.sub,
          action: "PRICING_UPDATED",
          data,
        },
      });
      return row;
    });

    return ok({ pricingProfile: created ? { id: created.id, pricingMode: created.pricingMode } : null });
  });
}
