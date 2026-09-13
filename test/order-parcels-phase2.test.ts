import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";
import { GET as getOrder } from "@/app/api/orders/[id]/route";

beforeEach(resetDb);

const orderBody = (over: Record<string, unknown> = {}) => ({
  sender: { name: "მა რი", phone: "+995599111111" },
  recipient: { name: "ლე ვა", phone: "+995599222222" },
  pickup: { address: "თბილისი, ა 1", lat: 41.72, lng: 44.79 },
  delivery: { address: "თბილისი, ბ 2", lat: 41.71, lng: 44.77 },
  weightKg: 3, // 0–6 კგ კალათა → კლიენტი 5 ₾, კურიერს 2.5 ₾
  paymentMethod: "CASH",
  deliveryProof: "NONE",
  ...over,
});

/** flags.ts მოდულის-დონეზე კითხულობს env-ს — Phase 2-ის endpoint-ები ცალკე,
 *  იზოლირებულ მოდულ-ასლში ვტესტავთ ჩართული flag-ით (production default = false). */
async function withMultiParcelEnabled<T>(fn: (mods: {
  createOrder: typeof import("@/app/api/orders/route").POST;
  pickup: typeof import("@/app/api/orders/[id]/parcels/pickup/route").PATCH;
  deliver: typeof import("@/app/api/orders/[id]/parcels/deliver/route").PATCH;
}) => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_MULTI_PARCEL_ORDERS_ENABLED", "true");
  const { POST: createOrder } = await import("@/app/api/orders/route");
  const { PATCH: pickup } = await import("@/app/api/orders/[id]/parcels/pickup/route");
  const { PATCH: deliver } = await import("@/app/api/orders/[id]/parcels/deliver/route");
  try {
    return await fn({ createOrder, pickup, deliver });
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
}

async function toEnRoutePickup(orderId: string, drv: Awaited<ReturnType<typeof makeDriver>>) {
  actAs(session(await makeUser("DISPATCHER")));
  await call(assign, { params: { id: orderId }, body: { driverId: drv.profile.id } });
  actAs(session(drv.user));
  await call(setStatus, { params: { id: orderId }, body: { status: "ACCEPTED" } });
  await call(setStatus, { params: { id: orderId }, body: { status: "EN_ROUTE_PICKUP" } });
}

describe("მრავალამანათიანი შეკვეთა — Phase 2 (რაოდენობრივი დადასტურება)", () => {
  it("flag გამორთულია → parcelCount უგულებელყოფილია, ჩვეულებრივი ერთამანათიანი შეკვეთა იქმნება", async () => {
    const { POST: createOrder } = await import("@/app/api/orders/route");
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const r = await call(createOrder, { body: orderBody({ parcelCount: 12 }) });
    expect(r.status).toBe(201);
    expect(r.body.order.isMultiParcel).toBe(false);
    expect(r.body.order.parcelCount).toBe(1);
    expect(r.body.order.parcels).toEqual([]);
  });

  it("flag ჩართულია, parcelCount=12 → 12 OrderParcel იქმნება, ალოკაცია ჯამდება ორიგინალ ფასზე", async () => {
    await withMultiParcelEnabled(async ({ createOrder }) => {
      const c = await makeUser("CUSTOMER");
      actAs(session(c));
      const r = await call(createOrder, {
        body: orderBody({ parcelCount: 12, collectAmount: 100 }),
      });
      expect(r.status).toBe(201);
      const order = r.body.order as {
        id: string;
        isMultiParcel: boolean;
        parcelCount: number;
        price: { delivery: number; driverFee: number };
        parcels: { allocatedDeliveryPrice?: number }[];
      };
      expect(order.isMultiParcel).toBe(true);
      expect(order.parcelCount).toBe(12);
      expect(order.parcels).toHaveLength(12);

      const raw = await prisma.orderParcel.findMany({ where: { orderId: order.id } });
      const sumDelivery = raw.reduce((s, p) => s + Number(p.allocatedDeliveryPrice), 0);
      const sumDriverFee = raw.reduce((s, p) => s + Number(p.allocatedDriverFee), 0);
      const sumCod = raw.reduce((s, p) => s + Number(p.codAmount), 0);
      expect(Math.round(sumDelivery * 100) / 100).toBe(5); // deliveryPrice
      expect(Math.round(sumDriverFee * 100) / 100).toBe(2.5); // driverFee
      expect(Math.round(sumCod * 100) / 100).toBe(100); // collectAmount
    });
  });

  it("პარტიალური აღება: ნაკლების აღებისას მიზეზი სავალდებულოა; დარჩენილი NOT_PICKED_UP-ზე რჩება, არ უქმდება", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 5 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);

      actAs(session(drv.user));
      const noReason = await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 3 } });
      expect(noReason.status).toBe(422);

      const r = await call(pickup, {
        params: { id: orderId },
        body: { pickedUpCount: 3, reason: "ორი დაკეტილი იყო" },
      });
      expect(r.status).toBe(200);
      expect(r.body.order.status).toBe("PICKED_UP");

      const parcels = await prisma.orderParcel.findMany({
        where: { orderId },
        orderBy: { sequenceNo: "asc" },
      });
      expect(parcels.filter((p) => p.status === "PICKED_UP")).toHaveLength(3);
      const retried = parcels.filter((p) => p.status === "NOT_PICKED_UP");
      expect(retried).toHaveLength(2);
      expect(retried[0].pickupAttempts).toBe(1);
      expect(retried[0].failureNote).toBe("ორი დაკეტილი იყო");
    });
  });

  it("ხელახლა აღება: NOT_PICKED_UP ამანათების მომდევნო მცდელობაზე წარმატებით აღება", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 3 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);

      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 1, reason: "მისამართი დაკეტილი" } });
      // მეორე მცდელობა — დანარჩენი 2-იც აიღო
      const r2 = await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 2 } });
      expect(r2.status).toBe(200);
      const parcels = await prisma.orderParcel.findMany({ where: { orderId } });
      expect(parcels.every((p) => p.status === "PICKED_UP")).toBe(true);
    });
  });

  it("ჩაბარება — სრული (5/5): status DELIVERED, ფასი უცვლელი, driverEarning სრული", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, deliver }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 5 }) });
      const orderId = created.body.order.id as string;
      const originalDeliveryPrice = created.body.order.price.delivery as number;
      await toEnRoutePickup(orderId, drv);

      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 5 } });
      await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });

      const r = await call(deliver, { params: { id: orderId }, body: { deliveredCount: 5 } });
      expect(r.status).toBe(200);
      expect(r.body.order.status).toBe("DELIVERED");
      expect(r.body.order.price.delivery).toBe(originalDeliveryPrice);
      expect(r.body.order.paymentStatus).toBe("PAID");

      const earning = await prisma.driverEarning.findFirst({ where: { orderId } });
      expect(earning).toBeTruthy();
      expect(Number(earning!.driverAmount)).toBe(2.5);
    });
  });

  it("ჩაბარება — ნაწილობრივი (3/5): პროპორციული ფასი/COD/driverFee, CustomerAdjustment თითო ვერ-ჩაბარებულზე", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, deliver }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, {
        body: orderBody({ parcelCount: 5, collectAmount: 100 }),
      });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);

      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 5 } });
      await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });

      const noReason = await call(deliver, { params: { id: orderId }, body: { deliveredCount: 3 } });
      expect(noReason.status).toBe(422);

      const r = await call(deliver, {
        params: { id: orderId },
        body: { deliveredCount: 3, reason: "RECIPIENT_REFUSED", note: "არ იყო სახლში" },
      });
      expect(r.status).toBe(200);
      expect(r.body.order.status).toBe("DELIVERED");
      // deliveryPrice 5 → 3/5-ის წილი = 3
      expect(r.body.order.price.delivery).toBe(3);
      expect(r.body.order.collectAmount).toBe(60); // 100 * 3/5
      expect(r.body.order.price.driverFee).toBe(1.5); // 2.5 * 3/5

      const parcels = await prisma.orderParcel.findMany({ where: { orderId }, orderBy: { sequenceNo: "asc" } });
      expect(parcels.filter((p) => p.status === "DELIVERED")).toHaveLength(3);
      expect(parcels.filter((p) => p.status === "REFUSED")).toHaveLength(2);

      const adjustments = await prisma.customerAdjustment.findMany({ where: { orderId } });
      expect(adjustments).toHaveLength(2);
      expect(adjustments.every((a) => a.parcelId != null)).toBe(true);
      const sumAdjust = adjustments.reduce((s, a) => s + Number(a.amount), 0);
      expect(Math.round(sumAdjust * 100) / 100).toBe(2); // 5 - 3 = 2
    });
  });

  it("ჩაბარება — 0/5 → status FAILED, driverEarning არ იქმნება", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, deliver }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 5 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);

      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 5 } });
      await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });

      const r = await call(deliver, {
        params: { id: orderId },
        body: { deliveredCount: 0, reason: "RECIPIENT_UNAVAILABLE" },
      });
      expect(r.status).toBe(200);
      expect(r.body.order.status).toBe("FAILED");
      expect(r.body.order.price.delivery).toBe(0);

      const earning = await prisma.driverEarning.findFirst({ where: { orderId } });
      expect(earning).toBeNull();
    });
  });

  it("ლეგასი (isMultiParcel=false) შეკვეთაზე /status route-ით PICKED_UP/DELIVERED კვლავ მუშაობს უცვლელად", async () => {
    const c = await makeUser("CUSTOMER");
    const drv = await makeDriver({ approved: true });
    actAs(session(c));
    const created = await call((await import("@/app/api/orders/route")).POST, { body: orderBody() });
    const orderId = created.body.order.id as string;
    await toEnRoutePickup(orderId, drv);
    actAs(session(drv.user));
    const r1 = await call(setStatus, { params: { id: orderId }, body: { status: "PICKED_UP" } });
    expect(r1.status).toBe(200);
    const r2 = await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });
    expect(r2.status).toBe(200);
    const r3 = await call(setStatus, { params: { id: orderId }, body: { status: "DELIVERED" } });
    expect(r3.status).toBe(200);
  });

  it("მრავალამანათიან შეკვეთაზე /status route PICKED_UP-ს 409-ით უარყოფს — მხოლოდ /parcels/pickup", async () => {
    await withMultiParcelEnabled(async ({ createOrder }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 3 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);
      actAs(session(drv.user));
      const r = await call(setStatus, { params: { id: orderId }, body: { status: "PICKED_UP" } });
      expect(r.status).toBe(409);
    });
  });

  it("Phase 2 endpoint-ები flag გამორთვისას 404-ს აბრუნებენ", async () => {
    const { PATCH: pickup } = await import("@/app/api/orders/[id]/parcels/pickup/route");
    const r = await call(pickup, { params: { id: "nonexistent" }, body: { pickedUpCount: 1 } });
    expect(r.status).toBe(404);
  });
});
