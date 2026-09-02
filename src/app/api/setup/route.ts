import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { handle, ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

const B = (rows: [number, number][]) => rows.map(([maxKg, price]) => ({ maxKg, price }));

const CITIES = [
  { name: "თბილისი", centerLat: 41.7151, centerLng: 44.8271 },
  { name: "ბათუმი", centerLat: 41.6168, centerLng: 41.6367 },
  { name: "ქუთაისი", centerLat: 42.2679, centerLng: 42.7181 },
  { name: "რუსთავი", centerLat: 41.5495, centerLng: 45.0 },
];

const RULES = [
  {
    zone: "TBILISI" as const,
    weightBrackets: B([[6, 5], [10, 6], [15, 8], [20, 10], [30, 13], [40, 16], [50, 20]]),
    codFee: "1.00", driverFlatFee: "3.00", sameDayCutoffHour: 16, deliveryDays: 0,
  },
  {
    zone: "REGIONAL_CITY" as const,
    weightBrackets: B([[6, 7], [10, 9], [15, 12], [20, 15], [30, 19], [40, 28], [50, 38]]),
    codFee: "2.00", driverFlatFee: "5.00", deliveryDays: 1,
  },
  {
    zone: "TOWN_VILLAGE" as const,
    weightBrackets: B([[6, 11], [10, 13], [15, 16], [20, 19], [30, 23], [40, 33], [50, 43]]),
    codFee: "2.00", driverFlatFee: "7.00", deliveryDays: 2,
  },
];

/**
 * ერთჯერადი (იდემპოტენტური) საწყისი მონაცემები — ქალაქები, ტარიფები, დისპეჩერი.
 * გამოძახება: POST /api/setup  header: x-setup-token: <SETUP_TOKEN>
 */
export function POST(req: Request) {
  return handle(async () => {
    const token = process.env.SETUP_TOKEN;
    if (!token) return fail(503, "SETUP_TOKEN არ არის კონფიგურირებული");
    const given = req.headers.get("x-setup-token") || new URL(req.url).searchParams.get("token");
    if (given !== token) return fail(401, "არასწორი token");

    const result: Record<string, unknown> = {};

    for (const c of CITIES) {
      await prisma.city.upsert({ where: { name: c.name }, update: {}, create: c });
    }
    result.cities = CITIES.length;

    const existing = new Set(
      (await prisma.pricingRule.findMany({ select: { zone: true } })).map((r) => r.zone),
    );
    const missing = RULES.filter((r) => !existing.has(r.zone));
    if (missing.length) await prisma.pricingRule.createMany({ data: missing });
    result.pricingRulesAdded = missing.length;
    result.pricingRulesTotal = existing.size + missing.length;

    const email = process.env.ADMIN_EMAIL?.toLowerCase();
    const phoneRaw = process.env.ADMIN_PHONE;
    const pass = process.env.ADMIN_PASSWORD;
    if (email && phoneRaw && pass) {
      const phone = phoneRaw.startsWith("+")
        ? phoneRaw
        : `+995${phoneRaw.replace(/\D/g, "").slice(-9)}`;
      const admin = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          phone,
          passwordHash: await hashPassword(pass),
          name: process.env.ADMIN_NAME || "დისპეჩერი",
          role: "DISPATCHER",
        },
        select: { email: true, role: true },
      });
      result.admin = admin;
    } else {
      result.admin = "ADMIN_EMAIL/ADMIN_PHONE/ADMIN_PASSWORD არ არის — გამოტოვდა";
    }

    return ok({ done: true, ...result });
  });
}
