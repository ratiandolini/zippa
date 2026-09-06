import { prisma } from "@/lib/db";
import { requireRole, handle, ok, ApiError } from "@/lib/api";
import { pricingRuleSchema } from "@/lib/validation";
import type { WeightBracket } from "@/lib/pricing";

const num = (v: unknown) => Number(v);

function dto(r: Awaited<ReturnType<typeof prisma.pricingRule.findFirstOrThrow>>) {
  return {
    id: r.id,
    zone: r.zone,
    isActive: r.isActive,
    weightBrackets: (r.weightBrackets as unknown as WeightBracket[]) ?? [],
    codFee: num(r.codFee),
    driverBaseFee: num(r.driverBaseFee),
    driverPerKm: num(r.driverPerKm),
    driverFreeKm: num(r.driverFreeKm),
    driverFlatFee: num(r.driverFlatFee),
    driverPayoutPercent: r.driverPayoutPercent,
    sameDayCutoffHour: r.sameDayCutoffHour,
    deliveryDays: r.deliveryDays,
  };
}

const ZONE_ORDER = { TBILISI: 0, REGIONAL_CITY: 1, TOWN_VILLAGE: 2 } as const;

export function GET() {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const rules = await prisma.pricingRule.findMany();
    rules.sort((a, b) => ZONE_ORDER[a.zone] - ZONE_ORDER[b.zone]);
    return ok({ rules: rules.map(dto) });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const data = pricingRuleSchema.parse(await req.json());
    if (await prisma.pricingRule.findUnique({ where: { zone: data.zone } })) {
      throw new ApiError(409, "ამ ზონის წესი უკვე არსებობს");
    }
    const r = await prisma.pricingRule.create({
      data: {
        zone: data.zone,
        isActive: data.isActive,
        weightBrackets: data.weightBrackets,
        codFee: data.codFee,
        driverBaseFee: data.driverBaseFee,
        driverPerKm: data.driverPerKm,
        driverFreeKm: data.driverFreeKm,
        driverFlatFee: data.driverFlatFee,
        driverPayoutPercent: data.driverPayoutPercent ?? null,
        sameDayCutoffHour: data.sameDayCutoffHour ?? null,
        deliveryDays: data.deliveryDays,
      },
    });
    return ok({ rule: dto(r) }, 201);
  });
}
