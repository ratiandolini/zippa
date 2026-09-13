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
  resolvePickup: typeof import("@/app/api/orders/[id]/parcels/resolve-pickup/route").PATCH;
  returnConfirm: typeof import("@/app/api/orders/[id]/parcels/return-confirm/route").PATCH;
}) => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_MULTI_PARCEL_ORDERS_ENABLED", "true");
  const { POST: createOrder } = await import("@/app/api/orders/route");
  const { PATCH: pickup } = await import("@/app/api/orders/[id]/parcels/pickup/route");
  const { PATCH: deliver } = await import("@/app/api/orders/[id]/parcels/deliver/route");
  const { PATCH: resolvePickup } = await import("@/app/api/orders/[id]/parcels/resolve-pickup/route");
  const { PATCH: returnConfirm } = await import("@/app/api/orders/[id]/parcels/return-confirm/route");
  try {
    return await fn({ createOrder, pickup, deliver, resolvePickup, returnConfirm });
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

  it("ჩაბარება — სრული (5/5): status DELIVERED, snapshot ფასი უცვლელი, driverEarning სრული", async () => {
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
      // snapshot (price.*) არასდროს არ იცვლება — ესეც სრულ ჩაბარებაზეც
      expect(r.body.order.price.delivery).toBe(originalDeliveryPrice);
      expect(r.body.order.paymentStatus).toBe("PAID");
      expect(r.body.order.parcelFinance.finalPayable).toBe(r.body.order.parcelFinance.originalTotal);
      expect(r.body.order.parcelFinance.waivedAmount).toBe(0);

      // ledger — ერთი DELIVERY_CHARGE ჩანაწერი, არა UI-გამოთვლა
      const adj = await prisma.customerAdjustment.findMany({ where: { orderId } });
      expect(adj).toHaveLength(1);
      expect(adj[0].kind).toBe("DELIVERY_CHARGE");
      expect(Number(adj[0].amount)).toBe(-5);

      const earning = await prisma.driverEarning.findFirst({ where: { orderId } });
      expect(earning).toBeTruthy();
      expect(Number(earning!.driverAmount)).toBe(2.5);
    });
  });

  it("ჩაბარება — ნაწილობრივი (3/5): PARTIALLY_COMPLETED, snapshot ფასი უცვლელი, parcelFinance პროპორციული, CustomerAdjustment თითო ვერ-ჩაბარებულზე", async () => {
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
      expect(r.body.order.status).toBe("PARTIALLY_COMPLETED");
      // snapshot (price.delivery/driverFee) არასდროს არ იცვლება — მაშინაც, თუ ნაწილობრივია
      expect(r.body.order.price.delivery).toBe(5);
      expect(r.body.order.price.driverFee).toBe(2.5);
      // COD/collectAmount ოპერაციულად საჭიროა (remittance) — ეს განახლდება ფაქტობრივზე
      expect(r.body.order.collectAmount).toBe(60); // 100 * 3/5
      // parcelFinance — ledger-based (CustomerAdjustment-ის ჯამი), არა UI-გამოთვლა
      expect(r.body.order.parcelFinance.originalTotal).toBe(5);
      expect(r.body.order.parcelFinance.finalPayable).toBe(3);
      expect(r.body.order.parcelFinance.unsettledPayable).toBe(3);
      expect(r.body.order.parcelFinance.earnedDriverFee).toBe(1.5);
      expect(r.body.order.parcelFinance.waivedAmount).toBe(2);

      const parcels = await prisma.orderParcel.findMany({ where: { orderId }, orderBy: { sequenceNo: "asc" } });
      expect(parcels.filter((p) => p.status === "DELIVERED")).toHaveLength(3);
      // ვერ-ჩაბარებული ფიზიკურად კვლავ კურიერთანაა — RETURN_REQUESTED, არა REFUSED/FAILED
      expect(parcels.filter((p) => p.status === "RETURN_REQUESTED")).toHaveLength(2);

      // ერთი ledger ჩანაწერი მთელი ფინალიზაციისთვის — DELIVERY_CHARGE, არა REFUND-per-parcel
      const adjustments = await prisma.customerAdjustment.findMany({ where: { orderId } });
      expect(adjustments).toHaveLength(1);
      expect(adjustments[0].kind).toBe("DELIVERY_CHARGE");
      expect(adjustments[0].parcelId).toBeNull();
      expect(Number(adjustments[0].amount)).toBe(-3); // კლიენტი ევალება ზუსტად 3-ს

      // COD remittance query ხედავს PARTIALLY_COMPLETED-საც და ledger-charge-საც
      const { GET: codView } = await import("@/app/api/dispatch/cod/route");
      actAs(session(await makeUser("DISPATCHER")));
      const codRes = await call(codView, {});
      const row = (codRes.body.outstanding as {
        customerId: string;
        gross: number;
        commission: number;
        credits: number;
        net: number;
      }[]).find((rr) => rr.customerId === c.id);
      expect(row?.gross).toBe(60);
      expect(row?.credits).toBe(-3); // DELIVERY_CHARGE — კლიენტს აკლდება
      // net = gross − commission − charges + credits (codCommission earned proportionally: 2*3/5=1.2)
      expect(row?.net).toBe(Math.round((60 - (row?.commission ?? 0) + -3) * 100) / 100);
    });
  });

  it("ჩაბარება — 0/5 → status FAILED, snapshot ფასი უცვლელი, driverEarning არ იქმნება", async () => {
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
      // snapshot (price.delivery) უცვლელია FAILED-ზეც
      expect(r.body.order.price.delivery).toBe(5);
      expect(r.body.order.parcelFinance.finalPayable).toBe(0);
      expect(r.body.order.parcelFinance.waivedAmount).toBe(5);

      // 0 ჩაბარებულზე DELIVERY_CHARGE არ იქმნება — არაფერი არ ერიცხება კლიენტს
      const adj = await prisma.customerAdjustment.findMany({ where: { orderId } });
      expect(adj).toHaveLength(0);

      const earning = await prisma.driverEarning.findFirst({ where: { orderId } });
      expect(earning).toBeNull();
    });
  });

  it("დისპეჩერის resolve-pickup: WRITE_OFF მხოლოდ დარჩენილს (NOT_PICKED_UP) ჩამოწერს, PICKED_UP ხელუხლებელია", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, resolvePickup }) => {
      const c = await makeUser("CUSTOMER");
      const disp = await makeUser("DISPATCHER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 5 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);
      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 3, reason: "ორი არავინ იყო" } });

      actAs(session(disp));
      const noReason = await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "WRITE_OFF", reason: "" },
      });
      expect(noReason.status).toBe(422);

      const r = await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "WRITE_OFF", reason: "მომხმარებელმა თქვა აღარ სჭირდება" },
      });
      expect(r.status).toBe(200);

      const parcels = await prisma.orderParcel.findMany({ where: { orderId }, orderBy: { sequenceNo: "asc" } });
      expect(parcels.filter((p) => p.status === "PICKED_UP")).toHaveLength(3);
      expect(parcels.filter((p) => p.status === "CANCELLED")).toHaveLength(2);
      expect(parcels.find((p) => p.status === "CANCELLED")?.failureNote).toBe(
        "მომხმარებელმა თქვა აღარ სჭირდება",
      );

      // parcelSummary.pickedUp — ჩამოწერილი (CANCELLED, ფაქტობრივად არასდროს აღებული)
      // არ უნდა ითვლებოდეს "აღებულში"
      const after = await call(getOrder, { params: { id: orderId } });
      expect(after.body.order.parcelSummary).toEqual({
        total: 5,
        pickedUp: 3,
        delivered: 0,
        awaitingReturn: 0,
        returned: 0,
        notPickedUp: 0,
        cancelled: 2,
      });

      const events = await prisma.orderParcelEvent.findMany({
        where: { parcelId: { in: parcels.filter((p) => p.status === "CANCELLED").map((p) => p.id) } },
      });
      expect(events.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("დისპეჩერის resolve-pickup: REASSIGN მხოლოდ PICKED_UP-დან დაშვებული, აბრუნებს EN_ROUTE_PICKUP-ზე", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, resolvePickup }) => {
      const c = await makeUser("CUSTOMER");
      const disp = await makeUser("DISPATCHER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 4 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);

      actAs(session(disp));
      const tooEarly = await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "REASSIGN", reason: "ცდა" },
      });
      expect(tooEarly.status).toBe(409); // ჯერ არაფერი აღებულა — order.status EN_ROUTE_PICKUP

      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 2, reason: "ორი დაკეტილი" } });

      actAs(session(disp));
      const r = await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "REASSIGN", reason: "კურიერს ვთხოვე კიდევ სცადოს" },
      });
      expect(r.status).toBe(200);
      expect(r.body.order.status).toBe("EN_ROUTE_PICKUP");

      // PICKED_UP პარსელები არ შეცვლილა
      const parcels = await prisma.orderParcel.findMany({ where: { orderId } });
      expect(parcels.filter((p) => p.status === "PICKED_UP")).toHaveLength(2);
      expect(parcels.filter((p) => p.status === "NOT_PICKED_UP")).toHaveLength(2);
    });
  });

  it("0 ჩაბარდა, მაგრამ NOT_PICKED_UP დარჩა → deliver დაბლოკილია (409), FAILED ვერ დაინიშნება ვერ-გადაწყვეტილი პრობლემით", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, deliver, resolvePickup }) => {
      const c = await makeUser("CUSTOMER");
      const disp = await makeUser("DISPATCHER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 5 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);

      actAs(session(drv.user));
      // 3/5 აღებული, 2 დარჩა NOT_PICKED_UP
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 3, reason: "ორი დაკეტილი" } });
      await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });

      // driver-ს არაფერი აქვს ჩასაბარებელი 3-დან — ცდილობს 0/3-ს დაადასტუროს,
      // მაგრამ 2 ამანათის ბედი ჯერ არ არის დახურული → დაბლოკილია
      const blocked = await call(deliver, {
        params: { id: orderId },
        body: { deliveredCount: 0, reason: "RECIPIENT_UNAVAILABLE" },
      });
      expect(blocked.status).toBe(409);

      const midway = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(midway.status).toBe("IN_TRANSIT"); // არ დაფინალდა, არ გამხდარა FAILED

      // დისპეჩერი წყვეტს დარჩენილი 2-ის ბედს (ჩამოწერა)
      actAs(session(disp));
      const resolved = await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "WRITE_OFF", reason: "მომხმარებელი ვეღარ დაუკავშირდა" },
      });
      expect(resolved.status).toBe(200);

      // ახლა ყველა ამანათის ბედი დახურულია (3 PICKED_UP + 2 CANCELLED) — deliver დაშვებულია
      actAs(session(drv.user));
      const r = await call(deliver, {
        params: { id: orderId },
        body: { deliveredCount: 0, reason: "RECIPIENT_UNAVAILABLE" },
      });
      expect(r.status).toBe(200);
      expect(r.body.order.status).toBe("FAILED");
    });
  });

  it("driver ვერ ჩააბარებს NOT_PICKED_UP ან უკვე საბოლოო სტატუსის ამანათს — eligible მხოლოდ PICKED_UP-ია", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, deliver, resolvePickup }) => {
      const c = await makeUser("CUSTOMER");
      const disp = await makeUser("DISPATCHER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 3 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);
      actAs(session(drv.user));
      // მხოლოდ 1 აიღო — 2 დარჩა NOT_PICKED_UP
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 1, reason: "ორი დაკეტილი" } });
      await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });
      // დისპეჩერი ჩამოწერს დარჩენილ 2-ს (ბედი დახურულია), ისე რომ eligible-ს
      // მხოლოდ PICKED_UP (1) დარჩეს
      actAs(session(disp));
      await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "WRITE_OFF", reason: "ვეღარ დაუკავშირდნენ" },
      });
      // 2 ჩაბარებულის მოთხოვნა, როცა eligible მხოლოდ 1-ია (2 უკვე CANCELLED) → 422
      actAs(session(drv.user));
      const r = await call(deliver, { params: { id: orderId }, body: { deliveredCount: 2 } });
      expect(r.status).toBe(422);
    });
  });

  it("ორმაგი deliver request ვერ შექმნის ორმაგ CustomerAdjustment/DriverEarning-ს — მეორე 409-ია", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, deliver }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, {
        body: orderBody({ parcelCount: 4, collectAmount: 40 }),
      });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);
      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 4 } });
      await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });

      const body = { deliveredCount: 2, reason: "RECIPIENT_REFUSED" as const };
      const r1 = await call(deliver, { params: { id: orderId }, body });
      expect(r1.status).toBe(200);
      expect(r1.body.order.status).toBe("PARTIALLY_COMPLETED");

      // იმავე request-ის განმეორება — order აღარ არის IN_TRANSIT → 409, არაფერი ორმაგდება
      const r2 = await call(deliver, { params: { id: orderId }, body });
      expect(r2.status).toBe(409);

      const adjustments = await prisma.customerAdjustment.findMany({ where: { orderId } });
      expect(adjustments).toHaveLength(1); // ერთი DELIVERY_CHARGE ჩანაწერი, და არა ორმაგად 2

      const earnings = await prisma.driverEarning.findMany({ where: { orderId } });
      expect(earnings).toHaveLength(1); // და არა 2

      // codAmount = (CASH ? earnedTotalPrice : 0) + earnedCollect = 2.5 + (40 * 2/4) = 22.5 — ერთხელ დაერიცხა
      const drvProfile = await prisma.driverProfile.findUniqueOrThrow({ where: { id: drv.profile.id } });
      expect(Number(drvProfile.cashOnHand)).toBe(22.5);
    });
  });

  it("resolve-pickup — მხოლოდ DISPATCHER-ს აქვს წვდომა; ყველა მოქმედება OrderEvent-შიც ჩაიწერება", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, resolvePickup }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 3 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);
      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 1, reason: "ორი დაკეტილი" } });

      // კურიერი ვერ ხმარობს resolve-pickup-ს
      const asDriver = await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "WRITE_OFF", reason: "ცდა" },
      });
      expect(asDriver.status).toBe(403);

      // კლიენტიც ვერ
      actAs(session(c));
      const asCustomer = await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "WRITE_OFF", reason: "ცდა" },
      });
      expect(asCustomer.status).toBe(403);

      const disp = await makeUser("DISPATCHER");
      actAs(session(disp));
      const r = await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "WRITE_OFF", reason: "საბოლოოდ ჩამოწერილია" },
      });
      expect(r.status).toBe(200);

      const events = await prisma.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } });
      expect(events[0].note).toContain("ჩამოწერილია");
      expect(events[0].actorId).toBe(disp.id);
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

  it("დაბრუნების ნამდვილი flow: RETURN_REQUESTED → return-confirm → RETURNED, RETURN_FEE ლეჯერით, idempotent", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, deliver, returnConfirm }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 4 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);
      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 4 } });
      await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });

      const del = await call(deliver, {
        params: { id: orderId },
        body: { deliveredCount: 2, reason: "RECIPIENT_REFUSED" },
      });
      expect(del.status).toBe(200);
      expect(del.body.order.parcelSummary.awaitingReturn).toBe(2);
      expect(del.body.order.parcelSummary.returned).toBe(0);
      // ჯერ არაფერი დაბრუნებულა — returnFee ჯერ არ დარიცხულა
      let adj = await prisma.customerAdjustment.findMany({ where: { orderId } });
      expect(adj.filter((a) => a.kind === "RETURN_FEE")).toHaveLength(0);

      const noneYet = await call(returnConfirm, {
        params: { id: orderId },
        body: { returnedCount: 1 },
      });
      expect(noneYet.status).toBe(200);
      expect(noneYet.body.order.parcelSummary.awaitingReturn).toBe(1);
      expect(noneYet.body.order.parcelSummary.returned).toBe(1);

      adj = await prisma.customerAdjustment.findMany({ where: { orderId, kind: "RETURN_FEE" } });
      expect(adj).toHaveLength(1);
      expect(adj[0].parcelId).not.toBeNull();
      // allocatedDeliveryPrice თითო ამანათზე = 5/4 = 1.25; returnFee = 1.25*0.5 = 0.625 → 0.63
      expect(Number(adj[0].amount)).toBeCloseTo(-0.63, 2);

      // დანარჩენი 1-იც დაბრუნდა
      const rest = await call(returnConfirm, { params: { id: orderId }, body: { returnedCount: 1 } });
      expect(rest.status).toBe(200);
      expect(rest.body.order.parcelSummary.awaitingReturn).toBe(0);
      expect(rest.body.order.parcelSummary.returned).toBe(2);

      // idempotent — აღარაფერია დასაბრუნებელი, მესამე request 409-ია, ორმაგი დარიცხვა არ ხდება
      const again = await call(returnConfirm, { params: { id: orderId }, body: { returnedCount: 1 } });
      expect(again.status).toBe(409);

      const finalAdj = await prisma.customerAdjustment.findMany({ where: { orderId, kind: "RETURN_FEE" } });
      expect(finalAdj).toHaveLength(2); // ზუსტად ორი — თითო ამანათზე ერთხელ
    });
  });

  it("resolve-pickup REASSIGN — სხვა კურიერზე მინიჭება დაბლოკილია (409), იგივე კურიერზე დაშვებული", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, resolvePickup }) => {
      const c = await makeUser("CUSTOMER");
      const disp = await makeUser("DISPATCHER");
      const drv = await makeDriver({ approved: true });
      const otherDrv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 4 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);
      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 2, reason: "ორი დაკეტილი" } });

      actAs(session(disp));
      const blocked = await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "REASSIGN", reason: "სცადე", driverId: otherDrv.profile.id },
      });
      expect(blocked.status).toBe(409);

      const same = await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "REASSIGN", reason: "სცადე", driverId: drv.profile.id },
      });
      expect(same.status).toBe(200);
      expect(same.body.order.driverId).toBe(drv.profile.id);
    });
  });

  it("12-ამანათიანი მაგალითი: 9 აღებული, 7 ჩაბარებული, 2 დაბრუნებული, 3 ვერ აღებული", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, deliver, resolvePickup, returnConfirm }) => {
      const c = await makeUser("CUSTOMER");
      const disp = await makeUser("DISPATCHER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 12 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);

      actAs(session(drv.user));
      // 9/12 აღებული, 3 დარჩა NOT_PICKED_UP
      const p1 = await call(pickup, {
        params: { id: orderId },
        body: { pickedUpCount: 9, reason: "3 მისამართზე ვერ დაუკავშირდა" },
      });
      expect(p1.status).toBe(200);
      expect(p1.body.order.parcelSummary).toMatchObject({ total: 12, pickedUp: 9, notPickedUp: 3 });

      await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });

      // ვერ დაფინალდება — 3 ჯერ კიდევ NOT_PICKED_UP
      const blocked = await call(deliver, { params: { id: orderId }, body: { deliveredCount: 7, reason: "RECIPIENT_REFUSED" } });
      expect(blocked.status).toBe(409);

      // დისპეჩერი წერს ჩამოწერაზე დარჩენილ 3-ს
      actAs(session(disp));
      await call(resolvePickup, {
        params: { id: orderId },
        body: { action: "WRITE_OFF", reason: "3 დღეზე მეტია ვერ აუღიათ" },
      });

      // 7 ჩაბარებული, 2 უარი (RETURN_REQUESTED)
      actAs(session(drv.user));
      const del = await call(deliver, {
        params: { id: orderId },
        body: { deliveredCount: 7, reason: "RECIPIENT_REFUSED", note: "2 მისამართზე უარი თქვეს" },
      });
      expect(del.status).toBe(200);
      expect(del.body.order.status).toBe("PARTIALLY_COMPLETED");
      expect(del.body.order.parcelSummary).toEqual({
        total: 12,
        pickedUp: 9,
        delivered: 7,
        awaitingReturn: 2,
        returned: 0,
        notPickedUp: 0,
        cancelled: 3,
      });

      // ორივე უარი-თქმული ბრუნდება გამგზავნთან
      const ret = await call(returnConfirm, { params: { id: orderId }, body: { returnedCount: 2 } });
      expect(ret.status).toBe(200);
      expect(ret.body.order.parcelSummary).toEqual({
        total: 12,
        pickedUp: 9,
        delivered: 7,
        awaitingReturn: 0,
        returned: 2,
        notPickedUp: 0,
        cancelled: 3,
      });

      // ფინანსები: deliveryPrice 5₾ → allocated 12-ზე; 7 ჩაბარებულზე earnedDeliveryPrice
      const parcels = await prisma.orderParcel.findMany({ where: { orderId } });
      const sumAll = parcels.reduce((s, p) => s + Number(p.allocatedDeliveryPrice), 0);
      expect(Math.round(sumAll * 100) / 100).toBe(5); // ჯამი ყოველთვის ორიგინალს უტოლდება

      const chargeAdj = await prisma.customerAdjustment.findMany({ where: { orderId, kind: "DELIVERY_CHARGE" } });
      expect(chargeAdj).toHaveLength(1);
      const returnAdj = await prisma.customerAdjustment.findMany({ where: { orderId, kind: "RETURN_FEE" } });
      expect(returnAdj).toHaveLength(2);

      const finalOrder = await call(getOrder, { params: { id: orderId } });
      const pf = finalOrder.body.order.parcelFinance;
      expect(pf.originalTotal).toBe(5);
      // snapshot ველები არასდროს იცვლება
      expect(finalOrder.body.order.price.delivery).toBe(5);
      expect(finalOrder.body.order.price.driverFee).toBe(2.5);
      // საბოლოო გადასახდელი = DELIVERY_CHARGE + RETURN_FEE-ების ჯამი ლეჯერიდან
      const expectedFinal =
        Math.round((-Number(chargeAdj[0].amount) + returnAdj.reduce((s, a) => s - Number(a.amount), 0)) * 100) / 100;
      expect(pf.finalPayable).toBe(expectedFinal);
    });
  });

  it("Phase 2 endpoint-ები flag გამორთვისას 404-ს აბრუნებენ", async () => {
    const { PATCH: pickup } = await import("@/app/api/orders/[id]/parcels/pickup/route");
    const r = await call(pickup, { params: { id: "nonexistent" }, body: { pickedUpCount: 1 } });
    expect(r.status).toBe(404);

    const { PATCH: returnConfirm } = await import("@/app/api/orders/[id]/parcels/return-confirm/route");
    const r2 = await call(returnConfirm, { params: { id: "nonexistent" }, body: { returnedCount: 1 } });
    expect(r2.status).toBe(404);

    const { PATCH: resolvePickup } = await import("@/app/api/orders/[id]/parcels/resolve-pickup/route");
    const r3 = await call(resolvePickup, {
      params: { id: "nonexistent" },
      body: { action: "WRITE_OFF", reason: "x" },
    });
    expect(r3.status).toBe(404);
  });
});
