import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder, GET as listOrders } from "@/app/api/orders/route";
import { GET as getOrder, PATCH as editOrder, DELETE as deleteOrder } from "@/app/api/orders/[id]/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";
import { POST as rejectOrder } from "@/app/api/orders/[id]/reject/route";
import { expireStaleAssignments } from "@/lib/assignments";

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
    expect(o.trackingNumber).toMatch(/^ZP-/);
    expect(o.price.total).toBe(5);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(db.estimatedDeliveryAt).toBeTruthy();
    expect(db.zone).toBe("TBILISI");
    expect(Number(db.driverFee)).toBe(3);
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

describe("შეკვეთის რედაქტირება", () => {
  it("დისპეჩერი ცვლის მიმღების მისამართს — ფასი/ზონა თავიდან იანგარიშება", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id); // თბილისი, total 5
    const d = await makeUser("DISPATCHER");
    actAs(session(d));
    const r = await call(editOrder, {
      method: "PATCH",
      params: { id: o.id },
      body: { delivery: { address: "ბათუმი, ჭავჭავაძის 5", lat: 41.6168, lng: 41.6367 }, weightKg: 3 },
    });
    expect(r.status).toBe(200);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(db.zone).toBe("REGIONAL_CITY");
    expect(db.deliveryAddress).toContain("ბათუმი");
    expect(Number(db.totalPrice)).toBe(7);
  });

  it("მომხმარებელი რედაქტირებს თავის PENDING შეკვეთას", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    actAs(session(c));
    const r = await call(editOrder, {
      method: "PATCH",
      params: { id: o.id },
      body: { recipient: { name: "ახალი მიმღები", phone: "+995599333444" } },
    });
    expect(r.status).toBe(200);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(db.recipientName).toBe("ახალი მიმღები");
  });

  it("სხვისი შეკვეთის რედაქტირება → 403", async () => {
    const a = await makeUser("CUSTOMER");
    const b = await makeUser("CUSTOMER");
    const o = await newOrder(a.id);
    actAs(session(b));
    const r = await call(editOrder, {
      method: "PATCH",
      params: { id: o.id },
      body: { description: "hack" },
    });
    expect(r.status).toBe(403);
  });

  it("მიტანილი შეკვეთის რედაქტირება → 409", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const { profile } = await makeDriver({ approved: true });
    const d = await makeUser("DISPATCHER");
    actAs(session(d));
    await call(assign, { params: { id: o.id }, body: { driverId: profile.id } });
    await prisma.order.update({ where: { id: o.id }, data: { status: "DELIVERED" } });
    const r = await call(editOrder, {
      method: "PATCH",
      params: { id: o.id },
      body: { description: "late" },
    });
    expect(r.status).toBe(409);
  });
});

describe("კურიერის უარი (reject)", () => {
  it("კურიერი უარს ამბობს ASSIGNED-ზე → PENDING, driverId იშლება, კურიერი AVAILABLE", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const drv = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });

    actAs(session(drv.user));
    const r = await call(rejectOrder, { method: "POST", params: { id: o.id }, body: {} });
    expect(r.status).toBe(200);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(db.status).toBe("PENDING");
    expect(db.driverId).toBeNull();
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(dp.status).toBe("AVAILABLE");
  });

  it("სხვისი კურიერი ვერ იტყვის უარს → 403", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const drv = await makeDriver({ approved: true });
    const other = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });
    actAs(session(other.user));
    const r = await call(rejectOrder, { method: "POST", params: { id: o.id }, body: {} });
    expect(r.status).toBe(403);
  });

  it("ACCEPTED-ის შემდეგ უარი → 409", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const drv = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });
    actAs(session(drv.user));
    await call(setStatus, { params: { id: o.id }, body: { status: "ACCEPTED" } });
    const r = await call(rejectOrder, { method: "POST", params: { id: o.id }, body: {} });
    expect(r.status).toBe(409);
  });
});

describe("უპასუხო მიბმის ტაიმაუტი", () => {
  it("90 წამზე ძველი ASSIGNED → PENDING, კურიერი გათავისუფლდა", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const drv = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });

    // ხელოვნურად ვაძველებთ მიბმას
    await prisma.order.update({
      where: { id: o.id },
      data: { assignedAt: new Date(Date.now() - 120_000) },
    });

    const n = await expireStaleAssignments();
    expect(n).toBe(1);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(db.status).toBe("PENDING");
    expect(db.driverId).toBeNull();
    expect(db.assignedAt).toBeNull();
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(dp.status).toBe("AVAILABLE");
  });

  it("ახალი მიბმა არ ითიშება", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const drv = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });
    const n = await expireStaleAssignments();
    expect(n).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("ASSIGNED");
  });

  it("დადასტურების შემდეგ assignedAt ნულდება", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const drv = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });
    actAs(session(drv.user));
    await call(setStatus, { params: { id: o.id }, body: { status: "ACCEPTED" } });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).assignedAt).toBeNull();
  });
});

describe("გაუქმებული შეკვეთის წაშლა", () => {
  it("დისპეჩერი შლის CANCELLED შეკვეთას", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    await prisma.order.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
    actAs(session(await makeUser("DISPATCHER")));
    const r = await call(deleteOrder, { method: "DELETE", params: { id: o.id } });
    expect(r.status).toBe(200);
    expect(await prisma.order.findUnique({ where: { id: o.id } })).toBeNull();
  });

  it("აქტიური შეკვეთის წაშლა → 409", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    actAs(session(await makeUser("DISPATCHER")));
    const r = await call(deleteOrder, { method: "DELETE", params: { id: o.id } });
    expect(r.status).toBe(409);
  });

  it("მომხმარებელი ვერ შლის → 403", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    await prisma.order.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
    actAs(session(c));
    const r = await call(deleteOrder, { method: "DELETE", params: { id: o.id } });
    expect(r.status).toBe(403);
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
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
      const r = await call(setStatus, { params: { id: o.id }, body: { status: s } });
      expect(r.status, s).toBe(200);
    }
  });

  it("გამოტოვებული გადასვლა ACCEPTED→PICKED_UP → 409 (EN_ROUTE_PICKUP გამოტოვებული)", async () => {
    const { drv, o } = await assigned();
    actAs(session(drv.user));
    await call(setStatus, { params: { id: o.id }, body: { status: "ACCEPTED" } });
    const r = await call(setStatus, { params: { id: o.id }, body: { status: "PICKED_UP" } });
    expect(r.status).toBe(409);
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

  it("მომხმარებელი აუქმებს PENDING-სა და ASSIGNED-ს; PICKED_UP-ს ვეღარ", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    actAs(session(c));
    expect((await call(setStatus, { params: { id: o.id }, body: { status: "CANCELLED" } })).status).toBe(200);

    // ASSIGNED — ჯერ კიდევ შეიძლება
    const { c: c2, o: o2, drv } = await assigned();
    actAs(session(c2));
    expect((await call(setStatus, { params: { id: o2.id }, body: { status: "CANCELLED" } })).status).toBe(200);
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(dp.status).toBe("AVAILABLE"); // კურიერი გათავისუფლდა

    // PICKED_UP — უკვე გვიანია
    const a3 = await assigned();
    actAs(session(a3.drv.user));
    await call(setStatus, { params: { id: a3.o.id }, body: { status: "ACCEPTED" } });
    await call(setStatus, { params: { id: a3.o.id }, body: { status: "EN_ROUTE_PICKUP" } });
    await call(setStatus, { params: { id: a3.o.id }, body: { status: "PICKED_UP" } });
    actAs(session(a3.c));
    expect((await call(setStatus, { params: { id: a3.o.id }, body: { status: "CANCELLED" } })).status).toBe(403);
  });

  it("EN_ROUTE_PICKUP-ზე მომხმარებლის გაუქმებას 2 ₾ ერიცხება", async () => {
    const { c, o, drv } = await assigned();
    actAs(session(drv.user));
    await call(setStatus, { params: { id: o.id }, body: { status: "ACCEPTED" } });
    await call(setStatus, { params: { id: o.id }, body: { status: "EN_ROUTE_PICKUP" } });
    actAs(session(c));
    const r = await call(setStatus, { params: { id: o.id }, body: { status: "CANCELLED" } });
    expect(r.status).toBe(200);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(db.status).toBe("CANCELLED");
    expect(Number(db.cancelFee)).toBe(2);
  });

  it("PENDING-ზე გაუქმებას საფასური არ ერიცხება", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    actAs(session(c));
    await call(setStatus, { params: { id: o.id }, body: { status: "CANCELLED" } });
    const db = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(Number(db.cancelFee)).toBe(0);
  });

  it("დისპეჩერის გაუქმებას საფასური არასდროს ერიცხება", async () => {
    const { o, drv } = await assigned();
    actAs(session(drv.user));
    await call(setStatus, { params: { id: o.id }, body: { status: "ACCEPTED" } });
    await call(setStatus, { params: { id: o.id }, body: { status: "EN_ROUTE_PICKUP" } });
    actAs(session(await makeUser("DISPATCHER")));
    const r = await call(setStatus, { params: { id: o.id }, body: { status: "CANCELLED" } });
    expect(r.status).toBe(200);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(Number(db.cancelFee)).toBe(0);
  });
});

describe("ჩაბარებისას ფინანსური აღრიცხვა", () => {
  it("DELIVERED (ნაღდი) → earning, unpaidEarnings += driverFee, cashOnHand += codAmount, +1 მიტანა, AVAILABLE", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id); // CASH, total 5, codAmount 5, driverFee 3
    const drv = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
      await call(setStatus, { params: { id: o.id }, body: { status: s } });
    }
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
    expect(Number(dp.unpaidEarnings)).toBe(3);
    expect(Number(dp.cashOnHand)).toBe(5);
    expect(dp.totalDeliveries).toBe(1);
    expect(dp.status).toBe("AVAILABLE");
    const e = await prisma.driverEarning.findUniqueOrThrow({ where: { orderId: o.id } });
    expect(Number(e.driverAmount)).toBe(3);
    expect(e.collectedInCash).toBe(true);
  });

  it("FAILED შეკვეთა ხელახლა მიენიჭება", async () => {
    const c = await makeUser("CUSTOMER");
    const o = await newOrder(c.id);
    const drv = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    await call(assign, { params: { id: o.id }, body: { driverId: drv.profile.id } });
    actAs(session(drv.user));
    for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "FAILED"]) {
      await call(setStatus, { params: { id: o.id }, body: { status: s } });
    }
    const drv2 = await makeDriver({ approved: true });
    actAs(session(await makeUser("DISPATCHER")));
    const r = await call(assign, { params: { id: o.id }, body: { driverId: drv2.profile.id } });
    expect(r.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("ASSIGNED");
  });
});
