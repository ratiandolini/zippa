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
    const url = new URL(req.url);
    const given = req.headers.get("x-setup-token") || url.searchParams.get("token");
    if (given !== token) return fail(401, "არასწორი token");

    const result: Record<string, unknown> = {};

    // სატესტო მონაცემების გასუფთავება: POST /api/setup?cleanup=test
    // შლის ყველა ანგარიშს, რომლის ელფოსტა მთავრდება @zippa.test-ით და მათ შეკვეთებს.
    if (url.searchParams.get("cleanup") === "test") {
      const testUsers = await prisma.user.findMany({
        where: { email: { endsWith: "@zippa.test" } },
        select: { id: true, email: true },
      });
      const ids = testUsers.map((u) => u.id);
      const dp = await prisma.driverProfile.findMany({
        where: { userId: { in: ids } },
        select: { id: true },
      });
      const dpIds = dp.map((d) => d.id);
      const delOrders = await prisma.order.deleteMany({
        where: { OR: [{ customerId: { in: ids } }, { driverId: { in: dpIds } }] },
      });
      const delUsers = await prisma.user.deleteMany({
        where: { email: { endsWith: "@zippa.test" } },
      });

      // ობოლი შეტყობინებები — რომელთა orderId აღარ არსებობს (მაგ. წაშლილი სატესტო შეკვეთები)
      const notifs = await prisma.notification.findMany({
        where: { type: "ORDER" },
        select: { id: true, data: true },
      });
      const orderIds = new Set(
        (await prisma.order.findMany({ select: { id: true } })).map((o) => o.id),
      );
      const orphanIds = notifs
        .filter((n) => {
          const oid = (n.data as { orderId?: string } | null)?.orderId;
          return oid && !orderIds.has(oid);
        })
        .map((n) => n.id);
      const delNotifs = await prisma.notification.deleteMany({
        where: { id: { in: orphanIds } },
      });
      return ok({
        cleanup: "test",
        usersDeleted: delUsers.count,
        ordersDeleted: delOrders.count,
        notificationsDeleted: delNotifs.count,
        emails: testUsers.map((u) => u.email),
      });
    }

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
