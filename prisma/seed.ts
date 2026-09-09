import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const pass = await bcrypt.hash("password123", 10);

  // ქალაქები
  const cities = [
    { name: "თბილისი", centerLat: 41.7151, centerLng: 44.8271 },
    { name: "ბათუმი", centerLat: 41.6168, centerLng: 41.6367 },
    { name: "ქუთაისი", centerLat: 42.2679, centerLng: 42.7181 },
    { name: "რუსთავი", centerLat: 41.5495, centerLng: 45.0 },
  ];
  for (const c of cities) {
    await prisma.city.upsert({ where: { name: c.name }, update: {}, create: c });
  }
  const tbilisi = await prisma.city.findUniqueOrThrow({ where: { name: "თბილისი" } });

  // ტარიფის წესები — ზონა + წონა-კალათები.
  // არსებულს არ ვშლით (დისპეჩერის რედაქტირება რომ არ დაიკარგოს) — ვამატებთ მხოლოდ ნაკლულ ზონას.
  const B = (rows: [number, number][]) => rows.map(([maxKg, price]) => ({ maxKg, price }));
  const DB = (rows: [number, number][]) => rows.map(([maxKg, payout]) => ({ maxKg, payout }));
  const tbilisiDriverBrackets = DB([[6, 2.5], [10, 3], [15, 4], [20, 5], [30, 6.5], [40, 8], [50, 10]]);
  const existingZones = new Set((await prisma.pricingRule.findMany({ select: { zone: true } })).map((r) => r.zone));
  const seedRules = [
      {
        zone: "TBILISI",
        weightBrackets: B([[6, 5], [10, 6], [15, 8], [20, 10], [30, 13], [40, 16], [50, 20]]),
        driverWeightBrackets: tbilisiDriverBrackets,
        codFee: "0",
        driverBaseFee: "2.50",
        driverPerKm: "0",
        driverFreeKm: "0",
        driverFlatFee: "3.00",
        sameDayCutoffHour: 16,
        deliveryDays: 0,
      },
      {
        zone: "REGIONAL_CITY",
        weightBrackets: B([[6, 7], [10, 9], [15, 12], [20, 15], [30, 19], [40, 28], [50, 38]]),
        codFee: "0",
        driverBaseFee: "4.00",
        driverPerKm: "0.50",
        driverFreeKm: "5",
        driverFlatFee: "5.00",
        deliveryDays: 1,
      },
      {
        zone: "TOWN_VILLAGE",
        weightBrackets: B([[6, 11], [10, 13], [15, 16], [20, 19], [30, 23], [40, 33], [50, 43]]),
        codFee: "0",
        driverBaseFee: "6.00",
        driverPerKm: "0.50",
        driverFreeKm: "5",
        driverFlatFee: "7.00",
        deliveryDays: 2,
      },
    ] as const;
  const missing = seedRules.filter((r) => !existingZones.has(r.zone));
  if (missing.length) await prisma.pricingRule.createMany({ data: missing as never });

  // ─── PRODUCTION: მხოლოდ დისპეჩერი env-იდან, დემო მონაცემების გარეშე ───
  if (process.env.NODE_ENV === "production") {
    const email = process.env.ADMIN_EMAIL;
    const phone = process.env.ADMIN_PHONE;
    const adminPass = process.env.ADMIN_PASSWORD;
    if (email && phone && adminPass) {
      await prisma.user.upsert({
        where: { email: email.toLowerCase() },
        update: {},
        create: {
          email: email.toLowerCase(),
          phone: phone.startsWith("+") ? phone : `+995${phone.replace(/\D/g, "").slice(-9)}`,
          passwordHash: await bcrypt.hash(adminPass, 10),
          name: process.env.ADMIN_NAME || "დისპეჩერი",
          role: "DISPATCHER",
        },
      });
      console.log("Production seed: ქალაქები, ტარიფები და დისპეჩერი დამატებულია.");
    } else {
      console.log("Production seed: ქალაქები და ტარიფები დამატებულია (ADMIN_* არ არის — დისპეჩერი გამოტოვდა).");
    }
    return;
  }

  // ─── DEVELOPMENT: სრული დემო მონაცემები ───
  const dispatcher = await prisma.user.upsert({
    where: { email: "dispatch@sakuriero.ge" },
    update: {},
    create: {
      email: "dispatch@sakuriero.ge",
      phone: "+995555000001",
      passwordHash: pass,
      name: "დისპეჩერი გიორგი",
      role: "DISPATCHER",
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: "customer@sakuriero.ge" },
    update: {},
    create: {
      email: "customer@sakuriero.ge",
      phone: "+995555000002",
      passwordHash: pass,
      name: "მარიამ გიორგაძე",
      role: "CUSTOMER",
    },
  });

  const driverUser = await prisma.user.upsert({
    where: { email: "driver@sakuriero.ge" },
    update: {},
    create: {
      email: "driver@sakuriero.ge",
      phone: "+995555000003",
      passwordHash: pass,
      name: "ნიკა ბერიძე",
      role: "DRIVER",
      driverProfile: {
        create: {
          vehicleType: "MOTORCYCLE",
          vehicleNumber: "ZP-101",
          status: "AVAILABLE",
          isApproved: true,
          cityId: tbilisi.id,
          currentLat: 41.7151,
          currentLng: 44.8271,
          locationUpdatedAt: new Date(),
        },
      },
    },
  });

  // დაუმტკიცებელი კურიერი (დისპეჩერისთვის დასამტკიცებელი)
  await prisma.user.upsert({
    where: { email: "driver2@sakuriero.ge" },
    update: {},
    create: {
      email: "driver2@sakuriero.ge",
      phone: "+995555000004",
      passwordHash: pass,
      name: "დავით ხარაძე",
      role: "DRIVER",
      driverProfile: {
        create: { vehicleType: "CAR", vehicleNumber: "ZP-102", isApproved: false, status: "OFFLINE" },
      },
    },
  });

  const driver = await prisma.driverProfile.findUniqueOrThrow({ where: { userId: driverUser.id } });

  // ─── დემო შეკვეთები (თბილისში, სხვადასხვა სტატუსით) ───
  const haversine = (a: [number, number], b: [number, number]) => {
    const R = 6371;
    const dLat = ((b[0] - a[0]) * Math.PI) / 180;
    const dLng = ((b[1] - a[1]) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 100) / 100;
  };
  const round2 = (n: number) => Math.round(n * 100) / 100;

  type DemoInput = {
    tn: string;
    pickup: [string, number, number];
    delivery: [string, number, number];
    recipient: [string, string];
    weightKg: number;
    description: string;
    payment: "CASH" | "CARD";
    status: "PENDING" | "ASSIGNED" | "IN_TRANSIT" | "DELIVERED";
    minutesAgo: number;
    rating?: number;
  };

  const demo: DemoInput[] = [
    { tn: "ZP-DEMO-0001", pickup: ["თბილისი, რუსთაველის გამზ. 10", 41.6977, 44.7995], delivery: ["თბილისი, ჭავჭავაძის გამზ. 25", 41.709, 44.7741], recipient: ["ლევან კაპანაძე", "+995555111222"], weightKg: 2.5, description: "დოკუმენტები", payment: "CASH", status: "IN_TRANSIT", minutesAgo: 55 },
    { tn: "ZP-DEMO-0002", pickup: ["თბილისი, ვაჟა-ფშაველას გამზ. 45", 41.7255, 44.7502], delivery: ["თბილისი, აღმაშენებლის გამზ. 100", 41.7145, 44.7965], recipient: ["ანა ბოლქვაძე", "+995555333444"], weightKg: 5, description: "კვების პროდუქტები", payment: "CARD", status: "ASSIGNED", minutesAgo: 30 },
    { tn: "ZP-DEMO-0003", pickup: ["თბილისი, პეკინის ქ. 5", 41.72, 44.76], delivery: ["თბილისი, ვარკეთილის III მ/რ", 41.744, 44.86], recipient: ["ნინო წიკლაური", "+995555555666"], weightKg: 1, description: "საჩუქარი", payment: "CASH", status: "PENDING", minutesAgo: 12 },
    { tn: "ZP-DEMO-0004", pickup: ["თბილისი, აღმაშენებლის გამზ. 140", 41.72, 44.79], delivery: ["თბილისი, გლდანის IV მ/რ", 41.78, 44.81], recipient: ["დათო ქავთარაძე", "+995555888999"], weightKg: 3, description: "ტექნიკა", payment: "CARD", status: "PENDING", minutesAgo: 6 },
    { tn: "ZP-DEMO-0005", pickup: ["თბილისი, ლესელიძის ქ. 8", 41.6905, 44.8065], delivery: ["თბილისი, საბურთალო, ყიფშიძის 4", 41.727, 44.746], recipient: ["გიორგი მაისურაძე", "+995555777888"], weightKg: 1.5, description: "წიგნები", payment: "CASH", status: "DELIVERED", minutesAgo: 240, rating: 5 },
  ];

  for (const o of demo) {
    if (await prisma.order.findUnique({ where: { trackingNumber: o.tn } })) continue;
    const dist = haversine([o.pickup[1], o.pickup[2]], [o.delivery[1], o.delivery[2]]);
    // თბილისის ტარიფი: წონა-კალათა
    const tbBrackets: [number, number][] = [[6, 5], [10, 6], [15, 8], [20, 10], [30, 13], [40, 16], [50, 20]];
    const deliveryPrice = tbBrackets.find(([m]) => o.weightKg <= m)?.[1] ?? 20;
    const codFee = 0;
    const total = round2(deliveryPrice + codFee);
    const driverFee = tbilisiDriverBrackets.find((b) => o.weightKg <= b.maxKg)?.payout ?? 10;
    const createdAt = new Date(Date.now() - o.minutesAgo * 60000);
    const assigned = o.status !== "PENDING";
    const delivered = o.status === "DELIVERED";

    const steps: { status: DemoInput["status"] | "ACCEPTED" | "EN_ROUTE_PICKUP" | "PICKED_UP"; note: string; t: number }[] = [
      { status: "PENDING", note: "შეკვეთა შექმნილია", t: 0 },
    ];
    if (assigned) steps.push({ status: "ASSIGNED", note: "კურიერი: ნიკა ბერიძე", t: 5 });
    if (o.status === "IN_TRANSIT" || delivered) {
      steps.push(
        { status: "ACCEPTED", note: "", t: 8 },
        { status: "EN_ROUTE_PICKUP", note: "", t: 12 },
        { status: "PICKED_UP", note: "", t: 20 },
        { status: "IN_TRANSIT", note: "", t: 25 },
      );
    }
    if (delivered) steps.push({ status: "DELIVERED", note: "ჩაბარებულია", t: 40 });

    const order = await prisma.order.create({
      data: {
        trackingNumber: o.tn,
        customerId: customer.id,
        driverId: assigned ? driver.id : null,
        status: o.status,
        kind: "INTRA_CITY",
        zone: "TBILISI",
        estimatedDeliveryAt: new Date(createdAt.getTime() + 3 * 3600 * 1000),
        senderName: "მარიამ გიორგაძე",
        senderPhone: "+995555000002",
        pickupAddress: o.pickup[0], pickupLat: o.pickup[1], pickupLng: o.pickup[2], pickupCityId: tbilisi.id,
        recipientName: o.recipient[0], recipientPhone: o.recipient[1],
        deliveryAddress: o.delivery[0], deliveryLat: o.delivery[1], deliveryLng: o.delivery[2], deliveryCityId: tbilisi.id,
        weightKg: o.weightKg, description: o.description,
        distanceKm: dist, deliveryPrice, codFee, totalPrice: total, driverFee,
        paymentMethod: o.payment,
        paymentStatus: delivered && o.payment === "CASH" ? "PAID" : "UNPAID",
        codAmount: o.payment === "CASH" ? total : 0,
        createdAt,
        deliveredAt: delivered ? new Date(createdAt.getTime() + 40 * 60000) : null,
        events: {
          create: steps.map((s) => ({
            status: s.status as never,
            note: s.note || null,
            createdAt: new Date(createdAt.getTime() + s.t * 60000),
          })),
        },
      },
    });

    if (delivered) {
      const driverAmount = driverFee;
      await prisma.driverEarning.create({
        data: {
          driverId: driver.id, orderId: order.id, grossPrice: total,
          driverAmount, companyAmount: round2(total - driverAmount),
          collectedInCash: o.payment === "CASH",
        },
      });
      await prisma.driverProfile.update({
        where: { id: driver.id },
        data: {
          totalDeliveries: { increment: 1 },
          unpaidEarnings: { increment: driverAmount },
          ...(o.payment === "CASH" ? { cashOnHand: { increment: total } } : {}),
        },
      });
      if (o.rating) {
        await prisma.review.create({
          data: { orderId: order.id, authorId: customer.id, driverId: driver.id, rating: o.rating, comment: "სწრაფად და თავაზიანად" },
        });
        const agg = await prisma.review.aggregate({ where: { driverId: driver.id }, _avg: { rating: true }, _count: true });
        await prisma.driverProfile.update({
          where: { id: driver.id },
          data: { ratingAvg: round2(agg._avg.rating ?? 5), ratingCount: agg._count },
        });
      }
    }
  }

  // ნიკა დაკავებულია (IN_TRANSIT შეკვეთა აქვს)
  await prisma.driverProfile.update({ where: { id: driver.id }, data: { status: "BUSY" } });

  console.log("Seed დასრულდა:", {
    dispatcher: dispatcher.email,
    customer: customer.email,
    driver: driverUser.email,
    password: "password123",
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
