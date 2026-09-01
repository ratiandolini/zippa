import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail } from "@/lib/api";
import { pricingRuleSchema } from "@/lib/validation";

export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const data = pricingRuleSchema.partial().parse(await req.json());
    const existing = await prisma.pricingRule.findUnique({ where: { id: params.id } });
    if (!existing) return fail(404, "წესი ვერ მოიძებნა");
    await prisma.pricingRule.update({
      where: { id: params.id },
      data: { ...data, ...(data.cityId !== undefined ? { cityId: data.cityId ?? null } : {}) },
    });
    return ok({ ok: true });
  });
}

export function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    await prisma.pricingRule.delete({ where: { id: params.id } }).catch(() => {});
    return ok({ ok: true });
  });
}
