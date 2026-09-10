import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder, GET as listOrders } from "@/app/api/orders/route";
import { GET as getOrder } from "@/app/api/orders/[id]/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { POST as reject } from "@/app/api/orders/[id]/reject/route";
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

async function scenario(over: Record<string, unknown> = {}) {
  const customer = await makeUser("CUSTOMER");
  const disp = await makeUser("DISPATCHER");
  const drv = await makeDriver({ approved: true });
  actAs(session(customer));
  const created = await call(createOrder, { body: orderBody(over) });
  const order = created.body.order as { id: string };
  return { customer, disp, drv, order };
}

async function assignTo(orderId: string, disp: Awaited<ReturnType<typeof makeUser>>, drv: Awaited<ReturnType<typeof makeDriver>>) {
  actAs(session(disp));
  const r = await call(assign, { params: { id: orderId }, body: { driverId: drv.profile.id } });
  expect(r.status).toBe(200);
}

// ─────────────────────────────────────────────────────────
describe("სტატუსების გარდამავალი წესები — კურიერი", () => {
  it("სრული სწორი ციკლი ASSIGNED→ACCEPTED→EN_ROUTE_PICKUP→PICKED_UP→IN_TRANSIT→DELIVERED", async () => {
    const { order, disp, drv } = await scenario();
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
      const r = await call(setStatus, { params: { id: order.id }, body: { status: s } });
      expect(r.status, s).toBe(200);
    }
  });

  it.each([
    ["ASSIGNED", "PICKED_UP"],
    ["ASSIGNED", "DELIVERED"],
    ["ACCEPTED", "PICKED_UP"],
    ["ACCEPTED", "IN_TRANSIT"],
    ["EN_ROUTE_PICKUP", "IN_TRANSIT"],
    ["EN_ROUTE_PICKUP", "DELIVERED"],
    ["PICKED_UP", "DELIVERED"],
  ])("გამოტოვებული გადასვლა %s → %s → 409", async (reach, target) => {
    const { order, disp, drv } = await scenario();
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    const path = ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT"];
    for (const s of path) {
      if (reach === "ASSIGNED") break;
      await call(setStatus, { params: { id: order.id }, body: { status: s } });
      if (s === reach) break;
    }
    const r = await call(setStatus, { params: { id: order.id }, body: { status: target } });
    expect(r.status).toBe(409);
  });

  it("კურიერი ვერ ცვლის სხვის შეკვეთას → 403", async () => {
    const { order, disp, drv } = await scenario();
    await assignTo(order.id, disp, drv);
    const other = await makeDriver({ approved: true });
    actAs(session(other.user));
    const r = await call(setStatus, { params: { id: order.id }, body: { status: "ACCEPTED" } });
    expect(r.status).toBe(403);
  });

  it("კურიერი ვერ აბრუნებს სტატუსს (PICKED_UP → ACCEPTED) → 409/422", async () => {
    const { order, disp, drv } = await scenario();
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP"])
      await call(setStatus, { params: { id: order.id }, body: { status: s } });
    const r = await call(setStatus, { params: { id: order.id }, body: { status: "ACCEPTED" } });
    expect([409, 422]).toContain(r.status);
  });
});

// ─────────────────────────────────────────────────────────
describe("კურიერის უარი და ხელახალი მინიჭება", () => {
  it("ASSIGNED-ზე უარი → PENDING; მინიჭებამდე მარტო ASSIGNED-ზე", async () => {
    const { order, disp, drv } = await scenario();
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    const r = await call(reject, { params: { id: order.id }, body: {} });
    expect(r.status).toBe(200);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(db.status).toBe("PENDING");
    expect(db.driverId).toBeNull();
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(dp.status).toBe("AVAILABLE");
  });

  it("ACCEPTED-ის შემდეგ უარი აღარ შეიძლება → 409", async () => {
    const { order, disp, drv } = await scenario();
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    await call(setStatus, { params: { id: order.id }, body: { status: "ACCEPTED" } });
    const r = await call(reject, { params: { id: order.id }, body: {} });
    expect(r.status).toBe(409);
  });

  it("უარის მერე დისპეჩერი ხელახლა ანიჭებს", async () => {
    const { order, disp, drv } = await scenario();
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    await call(reject, { params: { id: order.id }, body: {} });
    const drv2 = await makeDriver({ approved: true });
    await assignTo(order.id, disp, drv2);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(db.status).toBe("ASSIGNED");
    expect(db.driverId).toBe(drv2.profile.id);
  });
});

// ─────────────────────────────────────────────────────────
describe("როლების ღილაკები / უფლებები", () => {
  it("დისპეჩერს ამ endpoint-იდან მხოლოდ CANCELLED შეუძლია", async () => {
    const { order, disp, drv } = await scenario();
    await assignTo(order.id, disp, drv);
    actAs(session(disp));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "FAILED"]) {
      const r = await call(setStatus, { params: { id: order.id }, body: { status: s, failureReason: "OTHER" } });
      expect(r.status, s).toBe(409);
    }
    const ok = await call(setStatus, { params: { id: order.id }, body: { status: "CANCELLED" } });
    expect(ok.status).toBe(200);
  });

  it("ტერმინალურ სტატუსზე ცვლილება იბლოკება", async () => {
    const { order, disp, drv } = await scenario();
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"])
      await call(setStatus, { params: { id: order.id }, body: { status: s } });
    // DELIVERED — ტერმინალური
    for (const actor of [drv.user, disp]) {
      actAs(session(actor));
      const r = await call(setStatus, { params: { id: order.id }, body: { status: "CANCELLED" } });
      expect(r.status).toBe(409);
    }
  });

  it("მომხმარებელი აუქმებს PENDING/ASSIGNED/ACCEPTED-ს უფასოდ, PICKED_UP-ს ვეღარ", async () => {
    // ACCEPTED — უფასო
    const a = await scenario();
    await assignTo(a.order.id, a.disp, a.drv);
    actAs(session(a.drv.user));
    await call(setStatus, { params: { id: a.order.id }, body: { status: "ACCEPTED" } });
    actAs(session(a.customer));
    const r1 = await call(setStatus, { params: { id: a.order.id }, body: { status: "CANCELLED" } });
    expect(r1.status).toBe(200);
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } })).cancelFee)).toBe(0);

    // PICKED_UP — 403
    const b = await scenario();
    await assignTo(b.order.id, b.disp, b.drv);
    actAs(session(b.drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP"])
      await call(setStatus, { params: { id: b.order.id }, body: { status: s } });
    actAs(session(b.customer));
    const r2 = await call(setStatus, { params: { id: b.order.id }, body: { status: "CANCELLED" } });
    expect(r2.status).toBe(403);
  });

  it("EN_ROUTE_PICKUP-ზე მომხმარებლის გაუქმება: 2 ₾ / კურიერს 1 ₾", async () => {
    const { order, customer, disp, drv } = await scenario();
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    await call(setStatus, { params: { id: order.id }, body: { status: "ACCEPTED" } });
    await call(setStatus, { params: { id: order.id }, body: { status: "EN_ROUTE_PICKUP" } });
    actAs(session(customer));
    await call(setStatus, { params: { id: order.id }, body: { status: "CANCELLED" } });
    const db = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(db.cancelFee)).toBe(2);
    const e = await prisma.driverEarning.findFirstOrThrow({ where: { orderId: order.id, kind: "CANCELLED_EN_ROUTE" } });
    expect(Number(e.driverAmount)).toBe(1);
    expect(Number(e.companyAmount)).toBe(1);
  });

  it("20 კგ+ → needsManualReview, მინიჭება იბლოკება", async () => {
    const { order, disp, drv } = await scenario({ weightKg: 25 });
    const db = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(db.needsManualReview).toBe(true);
    actAs(session(disp));
    const r = await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });
    expect(r.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────
describe("ჩაბარების დადასტურება — deliveryProof", () => {
  it("PHOTO: ფოტოს გარეშე DELIVERED → 422; ფოტოთი → 200", async () => {
    const { order, disp, drv } = await scenario({ deliveryProof: "PHOTO" });
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT"])
      await call(setStatus, { params: { id: order.id }, body: { status: s } });
    const blocked = await call(setStatus, { params: { id: order.id }, body: { status: "DELIVERED" } });
    expect(blocked.status).toBe(422);

    await prisma.order.update({ where: { id: order.id }, data: { proofPhotoUrl: "/uploads/x.jpg" } });
    const ok = await call(setStatus, { params: { id: order.id }, body: { status: "DELIVERED" } });
    expect(ok.status).toBe(200);
  });

  it("PIN: არასწორი კოდით → 422; სწორით → 200", async () => {
    const { order, disp, drv } = await scenario({ deliveryProof: "PIN" });
    const db = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(db.deliveryPin).toMatch(/^\d{4}$/);
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT"])
      await call(setStatus, { params: { id: order.id }, body: { status: s } });
    const wrong = await call(setStatus, { params: { id: order.id }, body: { status: "DELIVERED", pin: "0000" } });
    expect(wrong.status).toBe(422);
    const noPin = await call(setStatus, { params: { id: order.id }, body: { status: "DELIVERED" } });
    expect(noPin.status).toBe(422);
    const ok = await call(setStatus, { params: { id: order.id }, body: { status: "DELIVERED", pin: db.deliveryPin! } });
    expect(ok.status).toBe(200);
  });

  it("NONE: პირდაპირ DELIVERED → 200", async () => {
    const { order, disp, drv } = await scenario({ deliveryProof: "NONE" });
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
      const r = await call(setStatus, { params: { id: order.id }, body: { status: s } });
      expect(r.status, s).toBe(200);
    }
  });

  it("PIN ჩანს კლიენტთან, არა კურიერთან", async () => {
    const { order, customer, disp, drv } = await scenario({ deliveryProof: "PIN" });
    await assignTo(order.id, disp, drv);

    actAs(session(customer));
    const cust = await call(getOrder, { params: { id: order.id } });
    expect((cust.body.order as { deliveryPin: string | null }).deliveryPin).toMatch(/^\d{4}$/);

    actAs(session(drv.user));
    const drvView = await call(getOrder, { params: { id: order.id } });
    expect((drvView.body.order as { deliveryPin: string | null }).deliveryPin).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
describe("Privacy — serializeOrder role-scoping", () => {
  it("კლიენტი ვერ ხედავს კურიერის ანაზღაურებას/მარჟას", async () => {
    const { order, customer } = await scenario();
    actAs(session(customer));
    const r = await call(getOrder, { params: { id: order.id } });
    const o = r.body.order as { price: { driverFee: number; companyMargin: number; partnerCost: number }; finance: { driverPayable: number } };
    expect(o.price.driverFee).toBe(0);
    expect(o.price.companyMargin).toBe(0);
    expect(o.price.partnerCost).toBe(0);
    expect(o.finance.driverPayable).toBe(0);
  });

  it("კურიერი ხედავს თავის ანაზღაურებას, ვერ ხედავს მარჟას / კლიენტის PII / PIN-ს", async () => {
    const { order, disp, drv } = await scenario({ deliveryProof: "PIN" });
    await assignTo(order.id, disp, drv);
    actAs(session(drv.user));
    const r = await call(getOrder, { params: { id: order.id } });
    const o = r.body.order as {
      price: { driverFee: number; companyMargin: number };
      customer: { email: string; phone: string; taxId: string | null };
      deliveryPin: string | null;
      finance: { status: string | null; driverPayable: number };
    };
    expect(o.price.driverFee).toBeGreaterThan(0);
    expect(o.price.companyMargin).toBe(0);
    expect(o.customer.email).toBe("");
    expect(o.customer.phone).toBe("");
    expect(o.customer.taxId).toBeNull();
    expect(o.deliveryPin).toBeNull();
    expect(o.finance.status).toBeNull();
    expect(o.finance.driverPayable).toBe(0);
  });

  it("დისპეჩერი ხედავს ყველაფერს", async () => {
    const { order, disp } = await scenario();
    actAs(session(disp));
    const r = await call(getOrder, { params: { id: order.id } });
    const o = r.body.order as { price: { driverFee: number; companyMargin: number } };
    expect(o.price.driverFee).toBe(2.5);
    expect(o.price.companyMargin).toBe(2.5);
  });

  it("კურიერი ვერ ხედავს სხვის შეკვეთას სიაშიც", async () => {
    const { order, disp, drv } = await scenario();
    await assignTo(order.id, disp, drv);
    const other = await makeDriver({ approved: true });
    actAs(session(other.user));
    const r = await call(listOrders, {});
    const ids = (r.body.orders as { id: string }[]).map((x) => x.id);
    expect(ids).not.toContain(order.id);
  });
});
