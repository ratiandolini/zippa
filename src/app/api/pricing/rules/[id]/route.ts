import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail } from "@/lib/api";
import { pricingRuleSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const data = pricingRuleSchema.partial().parse(await req.json());
    const existing = await prisma.pricingRule.findUnique({ where: { id: params.id } });
    if (!existing) return fail(404, "წესი ვერ მოიძებნა");

    const patch: Prisma.PricingRuleUpdateInput = {};
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    if (data.weightBrackets !== undefined) patch.weightBrackets = data.weightBrackets;
    if (data.codFee !== undefined) patch.codFee = data.codFee;
    if (data.driverBaseFee !== undefined) patch.driverBaseFee = data.driverBaseFee;
    if (data.driverPerKm !== undefined) patch.driverPerKm = data.driverPerKm;
    if (data.driverFreeKm !== undefined) patch.driverFreeKm = data.driverFreeKm;
    if (data.driverFlatFee !== undefined) patch.driverFlatFee = data.driverFlatFee;
    if (data.driverPayoutPercent !== undefined) patch.driverPayoutPercent = data.driverPayoutPercent;
    if (data.sameDayCutoffHour !== undefined) patch.sameDayCutoffHour = data.sameDayCutoffHour;
    if (data.deliveryDays !== undefined) patch.deliveryDays = data.deliveryDays;

    await prisma.pricingRule.update({ where: { id: params.id }, data: patch });
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
