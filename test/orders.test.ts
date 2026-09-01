import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder, GET as listOrders } from "@/app/api/orders/route";
import { GET as getOrder } from "@/app/api/orders/[id]/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";

const orderBody = (over: Record<string, unknown> = {}) => ({
  sender: { name: "მარიამ გ", phone: "+995599111111" },
  recipient: { name: "ლევან კ", phone: "+995599222222" },
  pickup: { address: "თბილისი, რუსთაველის 10", lat: 41.72, lng: 44.79 },
  delivery: { address: "თბილისი, ვაკე 25", lat: 41.71, lng: 44.77 },
  weightKg: 3,
  paymentMethod: "CASH",
  ...over,
});

async function newOrder(customerId: string, over: Record<string, unknown> = {}) {
  actAs({ sub: customerId, role: "CUSTOMER", name: "c", email: "c@t.ge" });
  const r = await call(createOrder, { body: orderBody(over) });
  return r.body.order as { id: string; status: string; trackingNumber: string; price: { total: number; driverFee: number } };
}

beforeEach(resetDb);

describe("შეკვეთის შექმნა", () => {
  it("იქმნება PENDING, დათვლილი ფასით, ტრეკინგ-ნომრით, ETA-თი", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    expect(o.status).toBe("PENDING");
    expect(o.trackingNumber).toMatch(/^SKR-/);
    expect(o.price.total).toBe(6); // 5 + 1 cod
    const db = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(db.estimatedDeliveryAt).toBeTruthy();
    expect(db.zone).toBe("TBILISI");
    expect(Number(db.driverFee)).toBe(2);
  });

  it("ავტორიზაციის გარეშე → 401", async () => {
    actAs(null);
    const r = await call(createOrder, { body: orderBody() });
    expect(r.status).toBe(401);
  });
});

describe("წვდომა (scoping)", () => {
  it("მომხმარებელი ხედავს მხოლოდ თავის შეკვეთებს", async () => {
    const a = await makeUser("CUSTOMER");
    const b = await makeUser("CUSTOMER");
    await newOrder(a.id);
    await newOrder(b.id);
    actAs(session(a));
    const r = await call(listOrders, {});
    expect((r.body.orders as unknown[]).length).toBe(1);
  });

  it("სხვისი შეკვეთის ნახვა → 403", async () => {
    const a = await makeUser("CUSTOMER");
    const b = await makeUser("CUSTOMER");
    const o = await newOrder(a.id);
    actAs(session(b));
    const r = await call(getOrder, { params: { id: o.id } });
    expect(r.status).toBe(403);
  });

  it("დისპეჩერი ხედავს ყველა შეკვეთას", async () => {
    const a = await makeUser("CUSTOMER");
    const b = await makeUser("CUSTOMER");
    await newOrder(a.id);
    await newOrder(b.id);
    const d = await makeUser("DISPATCHER");
    actAs(session(d));
    const r = await call(listOrders, {});
    expect((r.body.orders as unknown[]).length).toBe(2);
  });
});

describe("კურიერის მინიჭება", () => {
  it("დისპეჩერი ნიშნავს დამტკიცებულ კურიერს → ASSIGNED, კურიერი BUSY", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const { profile } = await makeDriver({ approved: true });
    const d = await makeUser("DISPATCHER");
    actAs(session(d));
    const r = await call(assign, { params: { id: o.id }, body: { driverId: profile.id } });
    expect(r.status).toBe(200);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(db.status).toBe("ASSIGNED");
    expect(db.driverId).toBe(profile.id);
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(dp.status).toBe("BUSY");
  });

  it("დაუმტკიცებელ კურიერზე მინიჭება → 400", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const { profile } = await makeDriver({ approved: false });
    actAs(session(await makeUser("DISPATCHER")));
    const r = await call(assign, { params: { id: o.id }, body: { driverId: profile.id } });
    expect(r.status).toBe(400);
  });

  it("არა-დისპეჩერი ვერ ნიშნავს → 403", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const { profile } = await makeDriver();
    actAs(session(c));
    const r = await call(assign, { params: { id: o.id }, body: { driverId: profile.id } });
    expect(r.status).toBe(403);
  });
});

describe("სტატუსების მანქანა", () => {
  async function assigned() {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const drv = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });
    return { c, o, drv };
  }

  it("სწორი თანმიმდევრობა ASSIGNED→ACCEPTED→PICKED_UP→IN_TRANSIT→DELIVERED", async () => {
    const { drv, o } = await assigned();
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
      const r = await call(setStatus, { params: { id: o.id }, body: { status: s } });
      expect(r.status, s).toBe(200);
    }
  });

  it("გამოტოვებული გადასვლა ASSIGNED→DELIVERED → 409", async () => {
    const { drv, o } = await assigned();
    actAs(session(drv.user));
    const r = await call(setStatus, { params: { id: o.id }, body: { status: "DELIVERED" } });
    expect(r.status).toBe(409);
  });

  it("კურიერი ვერ ცვლის სხვის შეკვეთას → 403", async () => {
    const { o } = await assigned();
    const other = await makeDriver({ approved: true });
    actAs(session(other.user));
    const r = await call(setStatus, { params: { id: o.id }, body: { status: "ACCEPTED" } });
    expect(r.status).toBe(403);
  });

  it("მომხმარებელი აუქმებს PENDING-ს; ASSIGNED-ს ვეღარ → 403", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    actAs(session(c));
    expect((await call(setStatus, { params: { id: o.id }, body: { status: "CANCELLED" } })).status).toBe(200);

    const { c: c2, o: o2, drv } = await assigned();
    void drv;
    actAs(session(c2));
    expect((await call(setStatus, { params: { id: o2.id }, body: { status: "CANCELLED" } })).status).toBe(403);
  });
});

describe("ჩაბარებისას ფინანსური აღრიცხვა", () => {
  it("DELIVERED (ნაღდი) → earning, unpaidEarnings += driverFee, cashOnHand += codAmount, +1 მიტანა, AVAILABLE", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id); // CASH, total 6, codAmount 6, driverFee 2
    const drv = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
      await call(setStatus, { params: { id: o.id }, body: { status: s } });
    }
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(2);
    expect(Number(dp.cashOnHand)).toBe(6);
    expect(dp.totalDeliveries).toBe(1);
    expect(dp.status).toBe("AVAILABLE");
    const e = await prisma.driverEarning.findUniqueOrThrow({ where: { orderId: o.id } });
    expect(Number(e.driverAmount)).toBe(2);
    expect(e.collectedInCash).toBe(true);
  });

  it("FAILED შეკვეთა ხელახლა მიენიჭება", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const drv = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "PICKED_UP", "IN_TRANSIT", "FAILED"]) {
      await call(setStatus, { params: { id: o.id }, body: { status: s } });
    }
    const drv2 = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    const r = await call(assign, { params: { id: o.id }, body: { driverId: drv2.profile.id } });
    expect(r.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("ASSIGNED");
  });
});
