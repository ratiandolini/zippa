import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";
import { POST as payout } from "@/app/api/drivers/[id]/payout/route";
import { GET as driverDetail } from "@/app/api/drivers/[id]/route";
import { POST as settle } from "@/app/api/driver/settlement/route";
import { PATCH as reviewSettlement } from "@/app/api/settlements/[id]/route";
import { GET as payroll } from "@/app/api/dispatch/payroll/route";
import { DELETE as deactivateDriver } from "@/app/api/drivers/[id]/route";

const body = (over: Record<string, unknown> = {}) => ({
  sender: { name: "მა რი", phone: "+995599111111" },
  recipient: { name: "ლე ვა", phone: "+995599222222" },
  pickup: { address: "თბილისი, ა 1", lat: 41.72, lng: 44.79 },
  delivery: { address: "თბილისი, ბ 2", lat: 41.71, lng: 44.77 },
  weightKg: 3,
  parcelValue: 50,
  paymentMethod: "CASH",
  deliveryProof: "NONE",
  ...over,
});

async function deliverN(n: number, payment: "CASH") {
  const customer = await makeUser("CUSTOMER");
  const drv = await makeDriver({ approved: true });
  const disp = await makeUser("DISPATCHER");
  for (let i = 0; i < n; i++) {
    actAs(session({ ...customer, role: "CUSTOMER" }));
    const created = await call(createOrder, { body: body({ paymentMethod: payment }) });
    const oid = (created.body.order as { id: string }).id;
    actAs(session(disp));
    await call(assign, { params: { id: oid }, body: { driverId: drv.profile.id } });
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
      await call(setStatus, { params: { id: oid }, body: { status: s } });
    }
  }
  return { drv, disp };
}

beforeEach(resetDb);

describe("payout (დისპეჩერი)", () => {
  it("2 ნაღდი მიტანა → unpaidEarnings 5, cashOnHand 10", async () => {
    const { drv } = await deliverN(2, "CASH"); // total 5 თითო, driverFee 2.5 თითო (წონა-ცხრილი)
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(5);
    expect(Number(dp.cashOnHand)).toBe(10);
  });

  it("გადახდა → unpaidEarnings მცირდება, Payout ჩანაწერი, earnings settled", async () => {
    const { drv, disp } = await deliverN(3, "CASH");
    actAs(session(disp));
    const r = await call(payout, { params: { id: drv.profile.id }, body: { amount: 7.5 } });
    expect(r.status).toBe(200);
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(0);
    expect(await prisma.payout.count({ where: { driverId: drv.profile.id } })).toBe(1);
    expect(await prisma.driverEarning.count({ where: { driverId: drv.profile.id, isSettled: false } })).toBe(0);
  });

  it("გადასახდელზე მეტი → 400", async () => {
    const { drv, disp } = await deliverN(1, "CASH"); // unpaid 3
    actAs(session(disp));
    const r = await call(payout, { params: { id: drv.profile.id }, body: { amount: 100 } });
    expect(r.status).toBe(400);
  });

  it("არა-დისპეჩერი → 403", async () => {
    const { drv } = await deliverN(1, "CASH");
    actAs(session(await makeUser("CUSTOMER")));
    const r = await call(payout, { params: { id: drv.profile.id }, body: { amount: 1 } });
    expect(r.status).toBe(403);
  });

  it("driver detail აჩვენებს დაუფარავ ანაზღაურებას", async () => {
    const { drv, disp } = await deliverN(2, "CASH");
    actAs(session(disp));
    const r = await call(driverDetail, { params: { id: drv.profile.id } });
    expect((r.body.driver as { unpaidEarnings: number }).unpaidEarnings).toBe(5);
    expect((r.body.driver as { unsettledEarningsCount: number }).unsettledEarningsCount).toBe(2);
  });
});

describe("ანგარიშსწორების ცხრილი (payroll)", () => {
  it("აჯამებს ანაზღაურებას, კომპანიის წილს და გადახდას პერიოდში", async () => {
    const { drv, disp } = await deliverN(2, "CASH"); // 2 მიტანა, თითო driverFee 2.5, total 5
    actAs(session(disp));
    await call(payout, { params: { id: drv.profile.id }, body: { amount: 4 } });

    const r = await call(payroll, { query: { period: "month" } });
    expect(r.status).toBe(200);
    const b = r.body as { rows: Record<string, number>[]; totals: Record<string, number> };
    const row = b.rows.find((x) => x.driverId === (drv.profile.id as never));
    expect(row).toBeTruthy();
    expect(row!.deliveries).toBe(2);
    expect(row!.earnedInPeriod).toBe(5); // 2 × 2.5
    expect(row!.companyInPeriod).toBe(5); // 2 × (5 − 2.5)
    expect(row!.paidInPeriod).toBe(4);
    expect(row!.unpaidEarnings).toBe(1); // 5 − 4
    expect(b.totals.earned).toBe(5);
  });

  it("არა-დისპეჩერი → 403", async () => {
    actAs(session(await makeUser("DRIVER")));
    const r = await call(payroll, { query: { period: "week" } });
    expect(r.status).toBe(403);
  });
});

describe("ნაღდის ჩაბარება (კურიერი → დისპეჩერი)", () => {
  it("გამოცხადება PENDING-ია; დისპეჩერის დადასტურებაზე cashOnHand მცირდება", async () => {
    const { drv, disp } = await deliverN(2, "CASH"); // cashOnHand 10
    actAs(session(drv.user));

    const declared = await call(settle, { body: { amount: 5 } });
    expect(declared.status).toBe(200);
    const sid = (declared.body.settlement as { id: string }).id;

    // ბალანსი ჯერ არ შეცვლილა
    let dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.cashOnHand)).toBe(10);

    // მეორე დაუდასტურებელი განაცხადი → 409
    expect((await call(settle, { body: { amount: 3 } })).status).toBe(409);

    // დისპეჩერი ადასტურებს
    actAs(session(disp));
    expect((await call(reviewSettlement, { params: { id: sid }, body: { action: "CONFIRM" } })).status).toBe(200);
    dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.cashOnHand)).toBe(5);

    // ხელზე არსებულზე მეტი → 400
    actAs(session(drv.user));
    expect((await call(settle, { body: { amount: 999 } })).status).toBe(400);
  });

  it("დისპეჩერი უარყოფს — ბალანსი უცვლელი, კურიერს თავიდან შეუძლია", async () => {
    const { drv, disp } = await deliverN(1, "CASH"); // cashOnHand 5
    actAs(session(drv.user));
    const declared = await call(settle, { body: { amount: 5 } });
    const sid = (declared.body.settlement as { id: string }).id;

    actAs(session(disp));
    expect((await call(reviewSettlement, { params: { id: sid }, body: { action: "REJECT" } })).status).toBe(200);
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.cashOnHand)).toBe(5);

    actAs(session(drv.user));
    expect((await call(settle, { body: { amount: 5 } })).status).toBe(200);
  });
});

describe("კურიერის დეაქტივაცია", () => {
  it("ხელზე ნაღდით → 409; ანაზღაურებით უ-payout → 409; payout=1 → იხდის და თიშავს", async () => {
    const { drv, disp } = await deliverN(2, "CASH"); // unpaid 5, cash 10
    actAs(session(disp));

    // ხელზე ნაღდი — ვერ დეაქტივდება
    expect((await call(deactivateDriver, { params: { id: drv.profile.id } })).status).toBe(409);

    // ნაღდი ჩააბარა
    actAs(session(drv.user));
    const s = await call(settle, { body: { amount: 10 } });
    actAs(session(disp));
    await call(reviewSettlement, { params: { id: (s.body.settlement as { id: string }).id }, body: { action: "CONFIRM" } });

    // ანაზღაურება ისევ ღიაა — payout ფლაგის გარეშე 409
    expect((await call(deactivateDriver, { params: { id: drv.profile.id } })).status).toBe(409);

    // payout=1 → იხდის და თიშავს
    const r = await call(deactivateDriver, { params: { id: drv.profile.id }, query: { payout: "1" } });
    expect(r.status).toBe(200);
    expect((r.body as { paidOut: number }).paidOut).toBe(5);

    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(dp.status).toBe("OFFLINE");
    expect(Number(dp.unpaidEarnings)).toBe(0);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: drv.user.id } });
    expect(u.isActive).toBe(false);
    expect(u.tokenVersion).toBe(1);
    expect(await prisma.payout.count({ where: { driverId: drv.profile.id } })).toBe(1);
  });

  it("მიმდინარე შეკვეთით → 409", async () => {
    const c = await makeUser("CUSTOMER");
    const drv = await makeDriver({ approved: true });
    const disp = await makeUser("DISPATCHER");
    actAs(session(c));
    const o = (await call(createOrder, { body: body() })).body.order as { id: string };
    actAs(session(disp));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });
    expect((await call(deactivateDriver, { params: { id: drv.profile.id } })).status).toBe(409);
  });
});
