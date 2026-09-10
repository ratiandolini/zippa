import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { POST as quote } from "@/app/api/pricing/quote/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as adjustPrice } from "@/app/api/orders/[id]/price/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";

beforeEach(resetDb);

const orderBody = (over: Record<string, unknown> = {}) => ({
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

async function makeOrder(over: Record<string, unknown> = {}) {
  const c = await makeUser("CUSTOMER");
  actAs(session(c));
  const r = await call(createOrder, { body: orderBody(over) });
  return { order: r.body.order as { id: string; needsManualReview: boolean; price: { total: number; driverFee: number } }, customer: c, status: r.status };
}

describe("driverWeightBrackets", () => {
  it("კურიერის თანხა წონა-ცხრილიდან, არა მანძილიდან", async () => {
    const { order } = await makeOrder({ weightKg: 12, delivery: { address: "შორს", lat: 41.62, lng: 44.9 } });
    const snap = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(snap.driverFee)).toBe(4); // 11–16 კგ კალათა → კურიერს 4 ₾
  });
});

describe("20 კგ+ → needsManualReview", () => {
  it("იქმნება, მაგრამ დაბლოკილია მინიჭება სანამ ფასი არ დადასტურდება", async () => {
    const { order } = await makeOrder({ weightKg: 25 });
    expect(order.needsManualReview).toBe(true);

    const drv = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    const a = await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });
    expect(a.status).toBe(409);
  });
});

describe("ფასის ხელით შესწორება", () => {
  it("დისპეჩერი ცვლის ორივე ფასს, needsManualReview ითიშება, მინიჭება იხსნება", async () => {
    const { order } = await makeOrder({ weightKg: 25 });
    const disp = await makeUser("DISPATCHER");
    actAs(session(disp));
    const r = await call(adjustPrice, {
      params: { id: order.id },
      body: { deliveryPrice: 25, driverFee: 12, reason: "დიდი გაბარიტი" },
    });
    expect(r.status).toBe(200);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(db.deliveryPrice)).toBe(25);
    expect(Number(db.driverFee)).toBe(12);
    expect(Number(db.totalPrice)).toBe(25);
    expect(db.pricingSource).toBe("MANUAL");
    expect(db.needsManualReview).toBe(false);

    const drv = await makeDriver({ approved: true });
    const a = await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });
    expect(a.status).toBe(200);
  });

  it("ჩაბარებულ შეკვეთაზე → 409", async () => {
    const { order } = await makeOrder();
    const disp = await makeUser("DISPATCHER");
    const drv = await makeDriver({ approved: true });
    actAs(session(disp));
    await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"])
      await call(setStatus, { params: { id: order.id }, body: { status: s } });
    actAs(session(disp));
    const r = await call(adjustPrice, {
      params: { id: order.id },
      body: { deliveryPrice: 9, driverFee: 4, reason: "დიდი გაბარიტი" },
    });
    expect(r.status).toBe(409);
  });
});

describe("isActive გეიტი", () => {
  it("გამორთულ ზონაზე quote → 409", async () => {
    await prisma.pricingRule.update({ where: { zone: "TBILISI" }, data: { isActive: false } });
    actAs(session(await makeUser("CUSTOMER")));
    const r = await call(quote, {
      body: { pickup: { lat: 41.72, lng: 44.79 }, delivery: { lat: 41.71, lng: 44.77 }, weightKg: 3, paymentMethod: "CASH" },
    });
    expect(r.status).toBe(409);
  });
});

describe("გზაში-ყოფნისას გაუქმება → კურიერს 1 ₾", () => {
  it("EN_ROUTE_PICKUP-ზე მომხმარებლის გაუქმება → DriverEarning CANCELLED_EN_ROUTE", async () => {
    const { order, customer } = await makeOrder();
    const disp = await makeUser("DISPATCHER");
    const drv = await makeDriver({ approved: true });
    actAs(session(disp));
    await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });
    actAs(session(drv.user));
    await call(setStatus, { params: { id: order.id }, body: { status: "ACCEPTED" } });
    await call(setStatus, { params: { id: order.id }, body: { status: "EN_ROUTE_PICKUP" } });
    actAs(session(customer));
    const r = await call(setStatus, { params: { id: order.id }, body: { status: "CANCELLED" } });
    expect(r.status).toBe(200);

    const e = await prisma.driverEarning.findFirstOrThrow({ where: { orderId: order.id, kind: "CANCELLED_EN_ROUTE" } });
    expect(Number(e.driverAmount)).toBe(1);
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(1);
  });
});
