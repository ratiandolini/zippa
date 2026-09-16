import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { GET as lifecycleGet, POST as lifecyclePost } from "@/app/api/dispatch/drivers/[id]/lifecycle/route";
import { PATCH as assignOrder } from "@/app/api/orders/[id]/assign/route";
import { GET as listDrivers } from "@/app/api/drivers/route";
import { POST as login } from "@/app/api/auth/login/route";

beforeEach(resetDb);

async function makeDispatcher() {
  return makeUser("DISPATCHER");
}

async function makePendingOrder(customerId: string) {
  return prisma.order.create({
    data: {
      trackingNumber: `ZP-TEST-${Math.random().toString(36).slice(2, 8)}`,
      customerId,
      status: "PENDING",
      senderName: "გამგზავნი",
      senderPhone: "+995599000111",
      pickupAddress: "საიდან",
      pickupLat: 41.7,
      pickupLng: 44.8,
      recipientName: "მიმღები",
      recipientPhone: "+995599000112",
      deliveryAddress: "სად",
      deliveryLat: 41.71,
      deliveryLng: 44.81,
      weightKg: 2,
      deliveryPrice: 5,
      totalPrice: 5,
      driverFee: 2.5,
    },
  });
}

describe("driver lifecycle — authorization + validation", () => {
  it("არა-დისპეჩერი → 403", async () => {
    const { profile } = await makeDriver();
    const customer = await makeUser("CUSTOMER");
    actAs(session(customer));
    const r = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "SUSPEND", reason: "ტესტი" },
    });
    expect(r.status).toBe(403);
  });

  it("reason-ის გარეშე/მოკლე → 422", async () => {
    const dispatcher = await makeDispatcher();
    const { profile } = await makeDriver();
    actAs(session(dispatcher));
    const r1 = await call(lifecyclePost, { params: { id: profile.id }, body: { action: "SUSPEND" } });
    expect(r1.status).toBe(422);
    const r2 = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "SUSPEND", reason: "ა" },
    });
    expect(r2.status).toBe(422);
  });
});

describe("driver lifecycle — active driver assignment unchanged", () => {
  it("ACTIVE + isApproved კურიერზე assign ჯერაც მუშაობს", async () => {
    const dispatcher = await makeDispatcher();
    const { profile } = await makeDriver({ approved: true });
    const customer = await makeUser("CUSTOMER");
    const order = await makePendingOrder(customer.id);

    actAs(session(dispatcher));
    const r = await call(assignOrder, {
      params: { id: order.id },
      body: { driverId: profile.id },
    });
    expect(r.status).toBe(200);
    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("ASSIGNED");
    expect(updated.driverId).toBe(profile.id);
  });
});

describe("driver lifecycle — suspend/archive blocks assignment and offer queries", () => {
  it("SUSPENDED კურიერზე assign → 400", async () => {
    const dispatcher = await makeDispatcher();
    const { profile } = await makeDriver({ approved: true });
    await prisma.driverProfile.update({ where: { id: profile.id }, data: { lifecycleStatus: "SUSPENDED" } });
    const customer = await makeUser("CUSTOMER");
    const order = await makePendingOrder(customer.id);

    actAs(session(dispatcher));
    const r = await call(assignOrder, { params: { id: order.id }, body: { driverId: profile.id } });
    expect(r.status).toBe(400);
  });

  it("ARCHIVED კურიერზე assign → 400", async () => {
    const dispatcher = await makeDispatcher();
    const { profile } = await makeDriver({ approved: true });
    await prisma.driverProfile.update({ where: { id: profile.id }, data: { lifecycleStatus: "ARCHIVED" } });
    const customer = await makeUser("CUSTOMER");
    const order = await makePendingOrder(customer.id);

    actAs(session(dispatcher));
    const r = await call(assignOrder, { params: { id: order.id }, body: { driverId: profile.id } });
    expect(r.status).toBe(400);
  });

  it("/api/drivers ნაგულისხმევად არ აბრუნებს SUSPENDED/ARCHIVED კურიერს", async () => {
    const dispatcher = await makeDispatcher();
    const { profile: active } = await makeDriver({ approved: true });
    const { profile: suspended } = await makeDriver({ approved: true });
    await prisma.driverProfile.update({ where: { id: suspended.id }, data: { lifecycleStatus: "SUSPENDED" } });

    actAs(session(dispatcher));
    const r = await call(listDrivers);
    expect(r.status).toBe(200);
    const ids = (r.body.drivers as { id: string }[]).map((d) => d.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(suspended.id);

    const rAll = await call(listDrivers, { query: { lifecycle: "all" } });
    const idsAll = (rAll.body.drivers as { id: string }[]).map((d) => d.id);
    expect(idsAll).toContain(suspended.id);
  });

  it("SUSPENDED კურიერს login ეკრძალება (isActive=false)", async () => {
    const dispatcher = await makeDispatcher();
    const { user, profile } = await makeDriver({ approved: true });

    actAs(session(dispatcher));
    const sr = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "SUSPEND", reason: "დისციპლინური დარღვევა" },
    });
    expect(sr.status).toBe(200);

    const lr = await call(login, { body: { emailOrPhone: user.email, password: "password123" } });
    expect(lr.status).toBe(401);
  });
});

describe("driver lifecycle — active-order safety", () => {
  it("მიმდინარე შეკვეთის მქონე კურიერზე SUSPEND/ARCHIVE/DELETE → 409, ორდერი უცვლელი", async () => {
    const dispatcher = await makeDispatcher();
    const { profile } = await makeDriver({ approved: true });
    const customer = await makeUser("CUSTOMER");
    const order = await makePendingOrder(customer.id);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "ASSIGNED", driverId: profile.id, assignedAt: new Date() },
    });

    actAs(session(dispatcher));
    for (const action of ["SUSPEND", "ARCHIVE", "DELETE"] as const) {
      const r = await call(lifecyclePost, {
        params: { id: profile.id },
        body: { action, reason: "ტესტის მცდელობა" },
      });
      expect(r.status).toBe(409);
    }

    const stillDriver = await prisma.driverProfile.findUnique({ where: { id: profile.id } });
    expect(stillDriver?.lifecycleStatus).toBe("ACTIVE");
    const untouchedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouchedOrder.status).toBe("ASSIGNED");
    expect(untouchedOrder.driverId).toBe(profile.id);
  });
});

describe("driver lifecycle — deletion", () => {
  it("ისტორიის მქონე კურიერის წაშლა → 409, offer archive instead", async () => {
    const dispatcher = await makeDispatcher();
    const { profile } = await makeDriver({ approved: true });
    const customer = await makeUser("CUSTOMER");
    const order = await makePendingOrder(customer.id);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "DELIVERED", driverId: profile.id },
    });

    actAs(session(dispatcher));
    const r = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "DELETE", reason: "ტესტი — ისტორია არსებობს" },
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/დააარქივე/);
    const stillExists = await prisma.driverProfile.findUnique({ where: { id: profile.id } });
    expect(stillExists).not.toBeNull();
  });

  it("გამოუყენებელი კურიერის წაშლა ნამდვილად შლის User/DriverProfile-ს", async () => {
    const dispatcher = await makeDispatcher();
    const { user, profile } = await makeDriver({ approved: true });

    actAs(session(dispatcher));
    const r = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "DELETE", reason: "გამოუყენებელი ტესტ-ანგარიში" },
    });
    expect(r.status).toBe(200);

    expect(await prisma.driverProfile.findUnique({ where: { id: profile.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();

    // აუდიტი გადარჩენილია driverId=null-ით, snapshot-ით
    const event = await prisma.driverLifecycleEvent.findFirstOrThrow({
      where: { driverNameSnapshot: user.name },
    });
    expect(event.driverId).toBeNull();
    expect(event.action).toBe("DELETED");
  });

  it("lifecycle GET-ის canDelete სწორად ასახავს ისტორიის არსებობას", async () => {
    const dispatcher = await makeDispatcher();
    const { profile } = await makeDriver({ approved: true });
    actAs(session(dispatcher));

    const before = await call(lifecycleGet, { params: { id: profile.id } });
    expect(before.body.canDelete).toBe(true);

    const customer = await makeUser("CUSTOMER");
    const order = await makePendingOrder(customer.id);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "DELIVERED", driverId: profile.id },
    });

    const after = await call(lifecycleGet, { params: { id: profile.id } });
    expect(after.body.canDelete).toBe(false);
    expect(after.body.blockers.some((b: { category: string }) => b.category === "orders")).toBe(true);
  });
});

describe("driver lifecycle — reactivation", () => {
  it("SUSPENDED → REACTIVATE (isApproved) → ACTIVE, login ხელახლა შესაძლებელია", async () => {
    const dispatcher = await makeDispatcher();
    const { user, profile } = await makeDriver({ approved: true });

    actAs(session(dispatcher));
    await call(lifecyclePost, { params: { id: profile.id }, body: { action: "SUSPEND", reason: "ტესტი" } });

    const r = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "REACTIVATE", reason: "საკითხი მოგვარებულია" },
    });
    expect(r.status).toBe(200);

    const lr = await call(login, { body: { emailOrPhone: user.email, password: "password123" } });
    expect(lr.status).toBe(200);
  });

  it("REACTIVATE დაუმტკიცებელ (isApproved=false) კურიერზე → 422", async () => {
    const dispatcher = await makeDispatcher();
    const { profile } = await makeDriver({ approved: false });
    await prisma.driverProfile.update({ where: { id: profile.id }, data: { lifecycleStatus: "SUSPENDED" } });

    actAs(session(dispatcher));
    const r = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "REACTIVATE", reason: "ტესტი" },
    });
    expect(r.status).toBe(422);
  });

  it("იმავე სტატუსში ხელახლა ერთი და იმავე action → 409 (idempotent)", async () => {
    const dispatcher = await makeDispatcher();
    const { profile } = await makeDriver({ approved: true });
    actAs(session(dispatcher));

    await call(lifecyclePost, { params: { id: profile.id }, body: { action: "ARCHIVE", reason: "ტესტი" } });
    const r = await call(lifecyclePost, {
      params: { id: profile.id },
      body: { action: "ARCHIVE", reason: "ხელახლა" },
    });
    expect(r.status).toBe(409);
  });
});
