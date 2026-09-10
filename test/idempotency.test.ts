import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";
import { POST as payout } from "@/app/api/drivers/[id]/payout/route";
import { POST as declareSettle } from "@/app/api/driver/settlement/route";
import { PATCH as reviewSettle } from "@/app/api/settlements/[id]/route";
import { POST as codSettle } from "@/app/api/dispatch/cod/route";
import { POST as adjust } from "@/app/api/orders/[id]/adjust/route";
import { POST as returnRequest } from "@/app/api/orders/[id]/return-request/route";

// C1 — ფინანსური idempotency / race-condition დაცვა.
// თითო flow-ზე ორი პარალელური request; მხოლოდ ერთმა უნდა გაიაროს,
// ფული/ანაზღაურება/ჩანაწერი არ უნდა გაორმაგდეს.

const body = (over: Record<string, unknown> = {}) => ({
  sender: { name: "მა რი", phone: "+995599111111" },
  recipient: { name: "ლე ვა", phone: "+995599222222" },
  pickup: { address: "თბილისი, ა 1", lat: 41.72, lng: 44.79 },
  delivery: { address: "თბილისი, ბ 2", lat: 41.71, lng: 44.77 },
  weightKg: 3, // კლიენტი 5 ₾ / კურიერი 2.5 ₾
  parcelValue: 50,
  paymentMethod: "CASH",
  deliveryProof: "NONE",
  ...over,
});

async function makeOrderTo(status: string[], over: Record<string, unknown> = {}) {
  const customer = await makeUser("CUSTOMER");
  const disp = await makeUser("DISPATCHER");
  const drv = await makeDriver({ approved: true });
  actAs(session(customer));
  const created = await call(createOrder, { body: body(over) });
  const id = (created.body.order as { id: string }).id;
  actAs(session(disp));
  await call(assign, { params: { id }, body: { driverId: drv.profile.id } });
  actAs(session(drv.user));
  for (const s of status) {
    const b: Record<string, unknown> = { status: s };
    if (s === "FAILED") b.failureReason = "RECIPIENT_UNAVAILABLE";
    const r = await call(setStatus, { params: { id }, body: b });
    expect(r.status, `advance ${s}`).toBe(200);
  }
  return { id, customer, disp, drv };
}

const oks = (rs: { status: number }[]) => rs.filter((r) => r.status === 200).length;
const conflicts = (rs: { status: number }[]) => rs.filter((r) => r.status === 409).length;

beforeEach(resetDb);

describe("C1 — ორი DELIVERED request ერთ შეკვეთაზე", () => {
  it("ერთი 200 / ერთი 409; ერთი DriverEarning; totalDeliveries 1", async () => {
    const { id, drv } = await makeOrderTo([
      "ACCEPTED",
      "EN_ROUTE_PICKUP",
      "PICKED_UP",
      "IN_TRANSIT",
    ]);
    actAs(session(drv.user));
    const rs = await Promise.all([
      call(setStatus, { params: { id }, body: { status: "DELIVERED" } }),
      call(setStatus, { params: { id }, body: { status: "DELIVERED" } }),
    ]);
    expect(oks(rs)).toBe(1);
    expect(conflicts(rs)).toBe(1);

    const earnings = await prisma.driverEarning.findMany({ where: { orderId: id } });
    expect(earnings.filter((e) => e.kind === "DELIVERY")).toHaveLength(1);
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(dp.totalDeliveries).toBe(1);
    expect(Number(dp.unpaidEarnings)).toBe(2.5);
    const events = await prisma.orderEvent.count({ where: { orderId: id, status: "DELIVERED" } });
    expect(events).toBe(1);
  });
});

describe("C1 — ორი payout ერთ კურიერზე", () => {
  it("ერთი 200 / ერთი 409; ერთი Payout; unpaidEarnings 0 (არა უარყოფითი)", async () => {
    const first = await makeOrderTo([
      "ACCEPTED",
      "EN_ROUTE_PICKUP",
      "PICKED_UP",
      "IN_TRANSIT",
      "DELIVERED",
    ]);
    // მეორე მიტანა იმავე კურიერზე
    const c2 = first.customer;
    actAs(session(c2));
    const o2 = await call(createOrder, { body: body() });
    const id2 = (o2.body.order as { id: string }).id;
    actAs(session(first.disp));
    await call(assign, { params: { id: id2 }, body: { driverId: first.drv.profile.id } });
    actAs(session(first.drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"])
      await call(setStatus, { params: { id: id2 }, body: { status: s } });

    const dpBefore = await prisma.driverProfile.findUniqueOrThrow({
      where: { id: first.drv.profile.id },
    });
    expect(Number(dpBefore.unpaidEarnings)).toBe(5);

    actAs(session(first.disp));
    const rs = await Promise.all([
      call(payout, { params: { id: first.drv.profile.id }, body: { amount: 5 } }),
      call(payout, { params: { id: first.drv.profile.id }, body: { amount: 5 } }),
    ]);
    expect(oks(rs)).toBe(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(1);

    expect(await prisma.payout.count({ where: { driverId: first.drv.profile.id } })).toBe(1);
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: first.drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(0);
  });
});

describe("C1 — ორი CONFIRM ერთ ნაღდის ჩაბარებაზე", () => {
  it("ერთი 200 / ერთი 409; cashOnHand ერთხელ მცირდება", async () => {
    const { drv, disp } = await makeOrderTo([
      "ACCEPTED",
      "EN_ROUTE_PICKUP",
      "PICKED_UP",
      "IN_TRANSIT",
      "DELIVERED",
    ]); // CASH → cashOnHand 5
    actAs(session(drv.user));
    const declared = await call(declareSettle, { body: { amount: 5 } });
    const sid = (declared.body.settlement as { id: string }).id;

    actAs(session(disp));
    const rs = await Promise.all([
      call(reviewSettle, { params: { id: sid }, body: { action: "CONFIRM" } }),
      call(reviewSettle, { params: { id: sid }, body: { action: "CONFIRM" } }),
    ]);
    expect(oks(rs)).toBe(1);
    expect(conflicts(rs)).toBe(1);
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.cashOnHand)).toBe(0);
  });
});

describe("C1 — ორი COD ანგარიშსწორება ერთ გამგზავნზე", () => {
  it("ერთი 200 / ერთი 409; ერთი CodRemittance", async () => {
    const { customer } = await makeOrderTo(
      ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"],
      { collectAmount: 40 },
    );
    const disp = await makeUser("DISPATCHER");
    actAs(session(disp));
    const rs = await Promise.all([
      call(codSettle, { body: { customerId: customer.id, method: "ბანკი" } }),
      call(codSettle, { body: { customerId: customer.id, method: "ბანკი" } }),
    ]);
    expect(oks(rs)).toBe(1);
    expect(rs.filter((r) => r.status >= 400)).toHaveLength(1);
    expect(await prisma.codRemittance.count({ where: { customerId: customer.id } })).toBe(1);
  });
});

describe("C1 — ორი იდენტური ანაზღაურება (adjust) ერთ შეკვეთაზე", () => {
  it("მხოლოდ ერთი CustomerAdjustment იქმნება", async () => {
    const { id, disp } = await makeOrderTo(
      ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "FAILED"],
      {},
    );
    actAs(session(disp));
    const payload = { amount: 10, kind: "GOODWILL", reason: "დაგვიანება" };
    const rs = await Promise.all([
      call(adjust, { params: { id }, body: payload }),
      call(adjust, { params: { id }, body: payload }),
    ]);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(2); // ორივე „წარმატებაა", მაგრამ ჩანაწერი ერთი
    expect(await prisma.customerAdjustment.count({ where: { orderId: id } })).toBe(1);
  });
});

describe("C1 — ორი post-pickup გაუქმება ერთ შეკვეთაზე (დისპეჩერი)", () => {
  it("ერთი 200 / ერთი 409; ერთი CANCELLED_AFTER_PICKUP earning; returnFee ერთხელ", async () => {
    const { id, disp, drv } = await makeOrderTo([
      "ACCEPTED",
      "EN_ROUTE_PICKUP",
      "PICKED_UP",
      "IN_TRANSIT",
    ]);
    actAs(session(disp));
    const rs = await Promise.all([
      call(setStatus, { params: { id }, body: { status: "CANCELLED", note: "დაბრუნება" } }),
      call(setStatus, { params: { id }, body: { status: "CANCELLED", note: "დაბრუნება" } }),
    ]);
    expect(oks(rs)).toBe(1);
    expect(conflicts(rs)).toBe(1);

    const earnings = await prisma.driverEarning.findMany({ where: { orderId: id } });
    expect(earnings.filter((e) => e.kind === "CANCELLED_AFTER_PICKUP")).toHaveLength(1);
    const o = await prisma.order.findUniqueOrThrow({ where: { id } });
    // returnFee = deliveryPrice(5) × 0.5 = 2.5 — ერთხელ
    expect(Number(o.returnFee)).toBe(2.5);
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(2.5); // სრული driverFee, ერთხელ
  });
});

describe("C1 — ორი დაბრუნების მოთხოვნა ერთ შეკვეთაზე", () => {
  it("ერთი 200 / ერთი 409; returnRequestedAt ერთხელ", async () => {
    const { id, customer } = await makeOrderTo([
      "ACCEPTED",
      "EN_ROUTE_PICKUP",
      "PICKED_UP",
    ]);
    actAs(session(customer));
    const rs = await Promise.all([
      call(returnRequest, { params: { id }, body: { reason: "აღარ მჭირდება" } }),
      call(returnRequest, { params: { id }, body: { reason: "აღარ მჭირდება" } }),
    ]);
    expect(oks(rs)).toBe(1);
    expect(conflicts(rs)).toBe(1);
    const evs = await prisma.orderEvent.count({
      where: { orderId: id, note: { startsWith: "დაბრუნების მოთხოვნა" } },
    });
    expect(evs).toBe(1);
  });
});
