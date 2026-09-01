import { prisma } from "@/lib/db";
import { requireRole, handle, ok } from "@/lib/api";
import { pricingRuleSchema } from "@/lib/validation";

const num = (v: unknown) => Number(v);

function dto(r: Awaited<ReturnType<typeof prisma.pricingRule.findFirstOrThrow>> & { city?: { name: string } | null }) {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    cityId: r.cityId,
    cityName: r.city?.name ?? null,
    isActive: r.isActive,
    priority: r.priority,
    basePrice: num(r.basePrice),
    pricePerKm: num(r.pricePerKm),
    pricePerKg: num(r.pricePerKg),
    freeWeightKg: num(r.freeWeightKg),
    minPrice: num(r.minPrice),
    codFee: num(r.codFee),
    driverPayoutPercent: r.driverPayoutPercent,
  };
}

export function GET() {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const rules = await prisma.pricingRule.findMany({
      include: { city: { select: { name: true } } },
      orderBy: [{ kind: "asc" }, { priority: "desc" }],
    });
    return ok({ rules: rules.map(dto) });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const data = pricingRuleSchema.parse(await req.json());
    const r = await prisma.pricingRule.create({
      data: { ...data, cityId: data.cityId ?? null },
      include: { city: { select: { name: true } } },
    });
    return ok({ rule: dto(r) }, 201);
  });
}
