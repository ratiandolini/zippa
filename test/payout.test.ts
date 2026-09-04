import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";
import { POST as payout } from "@/app/api/drivers/[id]/payout/route";
import { GET as driverDetail } from "@/app/api/drivers/[id]/route";
import { POST as settle } from "@/app/api/driver/settlement/route";

const body = (over: Record<string, unknown> = {}) => ({
  sender: { name: "მა რი", phone: "+995599111111" },
  recipient: { name: "ლე ვა", phone: "+995599222222" },
  pickup: { address: "თბილისი, ა 1", lat: 41.72, lng: 44.79 },
  delivery: { address: "თბილისი, ბ 2", lat: 41.71, lng: 44.77 },
  weightKg: 3,
  paymentMethod: "CASH",
  ...over,
});

async function deliverN(n: number, payment: "CASH" | "CARD") {
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
    for (const s of ["ACCEPTED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
      await call(setStatus, { params: { id: oid }, body: { status: s } });
    }
  }
  return { drv, disp };
}

beforeEach(resetDb);

describe("payout (დისპეჩერი)", () => {
  it("2 ნაღდი მიტანა → unpaidEarnings 6, cashOnHand 10", async () => {
    const { drv } = await deliverN(2, "CASH"); // total 5 თითო, driverFee 3 თითო
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(6);
    expect(Number(dp.cashOnHand)).toBe(10);
  });

  it("გადახდა → unpaidEarnings მცირდება, Payout ჩანაწერი, earnings settled", async () => {
    const { drv, disp } = await deliverN(3, "CARD");
    actAs(session(disp));
    const r = await call(payout, { params: { id: drv.profile.id }, body: { amount: 9 } });
    expect(r.status).toBe(200);
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(0);
    expect(await prisma.payout.count({ where: { driverId: drv.profile.id } })).toBe(1);
    expect(await prisma.driverEarning.count({ where: { driverId: drv.profile.id, isSettled: false } })).toBe(0);
  });

  it("გადასახდელზე მეტი → 400", async () => {
    const { drv, disp } = await deliverN(1, "CARD"); // unpaid 3
    actAs(session(disp));
    const r = await call(payout, { params: { id: drv.profile.id }, body: { amount: 100 } });
    expect(r.status).toBe(400);
  });

  it("არა-დისპეჩერი → 403", async () => {
    const { drv } = await deliverN(1, "CARD");
    actAs(session(await makeUser("CUSTOMER")));
    const r = await call(payout, { params: { id: drv.profile.id }, body: { amount: 1 } });
    expect(r.status).toBe(403);
  });

  it("driver detail აჩვენებს დაუფარავ ანაზღაურებას", async () => {
    const { drv, disp } = await deliverN(2, "CARD");
    actAs(session(disp));
    const r = await call(driverDetail, { params: { id: drv.profile.id } });
    expect((r.body.driver as { unpaidEarnings: number }).unpaidEarnings).toBe(6);
    expect((r.body.driver as { unsettledEarningsCount: number }).unsettledEarningsCount).toBe(2);
  });
});

describe("ნაღდის ჩაბარება (კურიერი)", () => {
  it("ჩაბარება → cashOnHand მცირდება; ხელზე არსებულზე მეტი → 400", async () => {
    const { drv } = await deliverN(2, "CASH"); // cashOnHand 10
    actAs(session(drv.user));
    expect((await call(settle, { body: { amount: 5 } })).status).toBe(200);
    let dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.cashOnHand)).toBe(5);
    expect((await call(settle, { body: { amount: 999 } })).status).toBe(400);
    dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.cashOnHand)).toBe(5);
  });
});
