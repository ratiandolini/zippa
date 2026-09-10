import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";
import { GET as listOrders } from "@/app/api/orders/route";
import { GET as getOrder } from "@/app/api/orders/[id]/route";
import { GET as payroll } from "@/app/api/dispatch/payroll/route";
import { GET as codView, POST as codSettle } from "@/app/api/dispatch/cod/route";

async function finance(id: string) {
  const r = await call(getOrder, { params: { id } });
  return (r.body.order as { finance: { status: string | null; customerOwed: number; chargeReceived: boolean; driverPayable: number } })
    .finance;
}

beforeEach(resetDb);

const body = (over: Record<string, unknown> = {}) => ({
  sender: { name: "მა რი", phone: "+995599111111" },
  recipient: { name: "ლე ვა", phone: "+995599222222" },
  pickup: { address: "თბილისი, ა 1", lat: 41.72, lng: 44.79 },
  delivery: { address: "თბილისი, ბ 2", lat: 41.71, lng: 44.77 },
  weightKg: 3, // 0–6 კგ კალათა → კლიენტი 5 ₾, კურიერს 2.5 ₾
  parcelValue: 50,
  paymentMethod: "CASH",
  deliveryProof: "NONE",
  ...over,
});

type OrderRes = {
  id: string;
  price: { total: number; delivery: number; driverFee: number; partnerCost: number; companyMargin: number };
};

async function setup(orderOver: Record<string, unknown> = {}) {
  const customer = await makeUser("CUSTOMER");
  const disp = await makeUser("DISPATCHER");
  const drv = await makeDriver({ approved: true });
  actAs(session(customer));
  const created = await call(createOrder, { body: body(orderOver) });
  return { customer, disp, drv, order: created.body.order as OrderRes };
}

const advance = async (id: string, drv: Awaited<ReturnType<typeof makeDriver>>, steps: string[]) => {
  actAs(session(drv.user));
  for (const s of steps) {
    const r = await call(setStatus, { params: { id }, body: { status: s } });
    expect(r.status).toBe(200);
  }
};

// ── 1. მინიჭება + ავტომატური ფინანსური სნეპშოტი ──
describe("1. დისპეჩერი ანიჭებს კურიერს — ფასები ავტომატურად ითვლება", () => {
  it("შექმნისას სნეპშოტდება კლიენტის ფასი, კურიერის ანაზღაურება, partnerCost, Zippa-ს სხვაობა", async () => {
    const { order, disp, drv } = await setup();
    // კლიენტი ხედავს მხოლოდ თავის ფასს; კურიერის ანაზღაურება/მარჟა დაფარულია
    expect(order.price.total).toBe(5);
    expect(order.price.driverFee).toBe(0);
    expect(order.price.companyMargin).toBe(0);
    // სნეპშოტი ბაზაში სწორად ჩაიწერა
    const snap = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(snap.driverFee)).toBe(2.5);
    expect(Number(snap.partnerCost)).toBe(0);
    expect(Number(snap.companyMargin)).toBe(2.5); // 5 − 2.5 − 0

    // მინიჭება არ ცვლის სნეპშოტს
    actAs(session(disp));
    const a = await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });
    expect(a.status).toBe(200);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(db.driverFee)).toBe(2.5);
    expect(Number(db.companyMargin)).toBe(2.5);
    expect(db.driverId).toBe(drv.profile.id);
  });
});

// ── 2. კურიერი ხედავს ანაზღაურებას მიღებამდე ──
describe("2. კურიერი ხედავს ანაზღაურებას შეკვეთის მიღებამდე", () => {
  it("ASSIGNED შეკვეთა კურიერისთვის შეიცავს driverFee-ს (ჯერ არ მიუღია)", async () => {
    const { order, disp, drv } = await setup();
    actAs(session(disp));
    await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });

    actAs(session(drv.user));
    const r = await call(listOrders, { query: { status: "ASSIGNED" } });
    const o = (r.body.orders as { id: string; status: string; price: { driverFee: number } }[]).find(
      (x) => x.id === order.id,
    );
    expect(o).toBeTruthy();
    expect(o!.status).toBe("ASSIGNED"); // ჯერ არ დაუდასტურებია
    expect(o!.price.driverFee).toBe(2.5);
  });
});

// ── 3. EN_ROUTE_PICKUP-ზე გაუქმება: 2 ₾ კლიენტს, 1 ₾ კურიერს, 1 ₾ Zippa ──
describe("3. კურიერი „გზაშია ასაღებად“ — მომხმარებელი აუქმებს", () => {
  it("კლიენტს 2 ₾, კურიერს 1 ₾, Zippa-ს 1 ₾", async () => {
    const { order, customer, disp, drv } = await setup();
    actAs(session(disp));
    await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });
    await advance(order.id, drv, ["ACCEPTED", "EN_ROUTE_PICKUP"]);

    actAs(session(customer));
    const r = await call(setStatus, { params: { id: order.id }, body: { status: "CANCELLED" } });
    expect(r.status).toBe(200);

    const db = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(db.cancelFee)).toBe(2);
    expect(Number(db.returnFee)).toBe(0); // ამანათი ჯერ არ აღებულა

    const e = await prisma.driverEarning.findFirstOrThrow({
      where: { orderId: order.id, kind: "CANCELLED_EN_ROUTE" },
    });
    expect(Number(e.driverAmount)).toBe(1);
    expect(Number(e.companyAmount)).toBe(1); // 2 − 1
    expect(e.collectedInCash).toBe(false);

    // ── 4. კურიერის ბალანსი + დისპეჩერის ხედი ──
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(1);
    expect(dp.status).toBe("AVAILABLE");

    // ფინანსური სტატუსი — კლიენტს გადასახდელი, ჯერ არ მიღებული
    actAs(session(disp));
    const f = await finance(order.id);
    expect(f.status).toBe("OWED");
    expect(f.customerOwed).toBe(2);
    expect(f.chargeReceived).toBe(false);
    expect(f.driverPayable).toBe(1);

    const pr = await call(payroll, { query: { period: "all" } });
    const row = (pr.body.rows as Record<string, number>[]).find(
      (x) => (x.driverId as never) === drv.profile.id,
    );
    expect(row!.deliveries).toBe(0); // გაუქმებული სვლა არ ითვლება მიტანად
    expect(row!.earnedInPeriod).toBe(1);
    expect(row!.companyInPeriod).toBe(1);
    expect(row!.unpaidEarnings).toBe(1);

    // გამგზავნის დავალიანება დისპეჩერის COD ხედში
    const cod = await call(codView, {});
    const crow = (cod.body.outstanding as { customerId: string; charges: number }[]).find(
      (x) => x.customerId === customer.id,
    );
    expect(crow!.charges).toBe(2);
  });
});

// ── 5. ამანათის აღების შემდეგ გაუქმება: მიტანის ფასი არ ბრუნდება + დაბრუნების ტარიფი ──
describe("5. კურიერმა უკვე აიღო ამანათი — გაუქმება", () => {
  it("PICKED_UP: cancelFee = მიტანის ფასი, returnFee = 50%, კურიერს სრული driverFee, მიტანის ანაზღაურება ცალკე არ ერიცხება", async () => {
    const { order, customer, disp, drv } = await setup();
    actAs(session(disp));
    await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });
    await advance(order.id, drv, ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP"]);

    actAs(session(disp));
    const r = await call(setStatus, { params: { id: order.id }, body: { status: "CANCELLED" } });
    expect(r.status).toBe(200);

    const db = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(db.cancelFee)).toBe(5); // მთელი მიტანის ფასი რჩება
    expect(Number(db.returnFee)).toBe(2.5); // 5 × 0.5
    expect(db.status).toBe("CANCELLED");
    expect(db.chargeSettledAt).toBeNull(); // ჯერ არ მიგვიღია

    // მიტანის ანაზღაურება (DELIVERY) არ შექმნილა — მხოლოდ CANCELLED_AFTER_PICKUP
    expect(await prisma.driverEarning.count({ where: { orderId: order.id, kind: "DELIVERY" } })).toBe(0);
    const e = await prisma.driverEarning.findFirstOrThrow({
      where: { orderId: order.id, kind: "CANCELLED_AFTER_PICKUP" },
    });
    expect(Number(e.driverAmount)).toBe(2.5); // საწყისი სრული driverFee
    expect(Number(e.companyAmount)).toBe(5); // (5 + 2.5) − 2.5

    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(2.5);
    expect(Number(dp.cashOnHand)).toBe(0);
    expect(dp.status).toBe("AVAILABLE");

    // ── ფინანსური სტატუსი: „გადასახდელი“ → მიღების შემდეგ „კურიერისთვის გადასახდელი“ ──
    let f = await finance(order.id);
    expect(f.status).toBe("OWED");
    expect(f.customerOwed).toBe(7.5); // 5 + 2.5
    expect(f.driverPayable).toBe(2.5);

    // დისპეჩერი აღრიცხავს, რომ თანხა მიღებულია (COD/charge გასწორება)
    const paid = await call(codSettle, { body: { customerId: customer.id, method: "ნაღდი" } });
    expect(paid.status).toBe(200);

    f = await finance(order.id);
    expect(f.status).toBe("DRIVER_PAYABLE"); // კლიენტისგან მიღებულია, კურიერს ჯერ არ გადახდილა
    expect(f.customerOwed).toBe(0);
    expect(f.chargeReceived).toBe(true);
    expect(f.driverPayable).toBe(2.5);
  });

  it("IN_TRANSIT-ზეც იგივე ლოგიკა", async () => {
    const { order, disp, drv } = await setup();
    actAs(session(disp));
    await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });
    await advance(order.id, drv, ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT"]);

    actAs(session(disp));
    await call(setStatus, { params: { id: order.id }, body: { status: "CANCELLED" } });

    const db = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(db.cancelFee)).toBe(5);
    expect(Number(db.returnFee)).toBe(2.5);
    const e = await prisma.driverEarning.findFirstOrThrow({
      where: { orderId: order.id, kind: "CANCELLED_AFTER_PICKUP" },
    });
    expect(Number(e.driverAmount)).toBe(2.5); // სრული driverFee
  });

  it("ACCEPTED-ზე გაუქმება უფასოა (ამანათი ჯერ არ აღებულა)", async () => {
    const { order, customer, disp, drv } = await setup();
    actAs(session(disp));
    await call(assign, { params: { id: order.id }, body: { driverId: drv.profile.id } });
    await advance(order.id, drv, ["ACCEPTED"]);

    actAs(session(customer));
    await call(setStatus, { params: { id: order.id }, body: { status: "CANCELLED" } });
    const db = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(db.cancelFee)).toBe(0);
    expect(Number(db.returnFee)).toBe(0);
    expect(await prisma.driverEarning.count({ where: { orderId: order.id } })).toBe(0);
  });
});
