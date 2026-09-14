import { describe, it, expect, beforeEach, vi } from "vitest";
import sharp from "sharp";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";
import { GET as getOrder } from "@/app/api/orders/[id]/route";

vi.mock("@/lib/storage", () => ({
  putProofFile: vi.fn(async (key: string) => ({ url: `/uploads/${key}` })),
  getProofFile: vi.fn(async () => ({ body: new Uint8Array([255, 216, 255, 217]), contentType: "image/jpeg" })),
}));

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

async function withMultiParcelEnabled<T>(fn: (mods: {
  createOrder: typeof import("@/app/api/orders/route").POST;
  editOrder: typeof import("@/app/api/orders/[id]/route").PATCH;
  fixPrice: typeof import("@/app/api/orders/[id]/price/route").PATCH;
  pickup: typeof import("@/app/api/orders/[id]/parcels/pickup/route").PATCH;
  deliver: typeof import("@/app/api/orders/[id]/parcels/deliver/route").PATCH;
  resolvePickup: typeof import("@/app/api/orders/[id]/parcels/resolve-pickup/route").PATCH;
  returnConfirm: typeof import("@/app/api/orders/[id]/parcels/return-confirm/route").PATCH;
  adjust: typeof import("@/app/api/orders/[id]/adjust/route").POST;
}) => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_MULTI_PARCEL_ORDERS_ENABLED", "true");
  const { POST: createOrder } = await import("@/app/api/orders/route");
  const { PATCH: editOrder } = await import("@/app/api/orders/[id]/route");
  const { PATCH: fixPrice } = await import("@/app/api/orders/[id]/price/route");
  const { PATCH: pickup } = await import("@/app/api/orders/[id]/parcels/pickup/route");
  const { PATCH: deliver } = await import("@/app/api/orders/[id]/parcels/deliver/route");
  const { PATCH: resolvePickup } = await import("@/app/api/orders/[id]/parcels/resolve-pickup/route");
  const { PATCH: returnConfirm } = await import("@/app/api/orders/[id]/parcels/return-confirm/route");
  const { POST: adjust } = await import("@/app/api/orders/[id]/adjust/route");
  try {
    return await fn({ createOrder, editOrder, fixPrice, pickup, deliver, resolvePickup, returnConfirm, adjust });
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

async function callReturnConfirm(
  handler: typeof import("@/app/api/orders/[id]/parcels/return-confirm/route").PATCH,
  orderId: string,
  opts: { returnedCount: number; note?: string; reason?: string; withPhoto?: boolean },
) {
  const fd = new FormData();
  fd.append("returnedCount", String(opts.returnedCount));
  if (opts.note) fd.append("note", opts.note);
  if (opts.reason) fd.append("reason", opts.reason);
  if (opts.withPhoto) {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    fd.append("file", new Blob([png], { type: "image/png" }), "r.png");
  }
  const req = new Request("http://test.local/api", { method: "PATCH", body: fd });
  const res = await handler(req, { params: { id: orderId } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe("Release-audit fixes — B1/B2/B3/R1/R2/R3", () => {
  // ── B3 — ალოკაციების სინქრონიზაცია ფასის ცვლილებაზე ──
  it("B3: PENDING-ზე weight-ის რედაქტირება ხელახლა ანაწილებს ყველა parcel-ის allocated*-ს", async () => {
    await withMultiParcelEnabled(async ({ createOrder, editOrder }) => {
      const c = await makeUser("CUSTOMER");
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 4 }) });
      const orderId = created.body.order.id as string;
      expect(created.body.order.price.delivery).toBe(5);

      const r = await call(editOrder, { params: { id: orderId }, body: { weightKg: 8 } }); // 6-11კგ კალათა → 6₾
      expect(r.status).toBe(200);
      const newDeliveryPrice = r.body.order.price.delivery as number;
      expect(newDeliveryPrice).not.toBe(5);

      const parcels = await prisma.orderParcel.findMany({ where: { orderId } });
      const sumDelivery = Math.round(parcels.reduce((s, p) => s + Number(p.allocatedDeliveryPrice), 0) * 100) / 100;
      const sumDriverFee = Math.round(parcels.reduce((s, p) => s + Number(p.allocatedDriverFee), 0) * 100) / 100;
      // driverFee CUSTOMER-ის პასუხში დაფარულია (0) — ნამდვილი მნიშვნელობა ბაზიდან ვამოწმებთ
      const dbOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(sumDelivery).toBe(newDeliveryPrice);
      expect(sumDriverFee).toBe(Number(dbOrder.driverFee));

      const events = await prisma.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } });
      expect(events[0].note).toContain("ალოკაცია");
    });
  });

  it("B3: PATCH /price ხელახლა ანაწილებს allocated*-ს (მრავალამანათიან შეკვეთაზეც)", async () => {
    await withMultiParcelEnabled(async ({ createOrder, fixPrice }) => {
      const c = await makeUser("CUSTOMER");
      const disp = await makeUser("DISPATCHER");
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 3 }) });
      const orderId = created.body.order.id as string;

      actAs(session(disp));
      const r = await call(fixPrice, {
        params: { id: orderId },
        body: { deliveryPrice: 9, driverFee: 4.5, reason: "შორეული/რთული მისამართი" },
      });
      expect(r.status).toBe(200);

      const parcels = await prisma.orderParcel.findMany({ where: { orderId } });
      const sumDelivery = Math.round(parcels.reduce((s, p) => s + Number(p.allocatedDeliveryPrice), 0) * 100) / 100;
      const sumDriverFee = Math.round(parcels.reduce((s, p) => s + Number(p.allocatedDriverFee), 0) * 100) / 100;
      expect(sumDelivery).toBe(9);
      expect(sumDriverFee).toBe(4.5);
    });
  });

  it("B3: pickup დაწყების შემდეგ ფასის/წონის ცვლილება დაბლოკილია (409) — allocated* არ ფუჭდება", async () => {
    await withMultiParcelEnabled(async ({ createOrder, editOrder, pickup }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 3 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);
      actAs(session(drv.user));
      // 0 აღებული, ყველა NOT_PICKED_UP — Order.status EN_ROUTE_PICKUP-ზე რჩება
      // (ჯერ კიდევ ტექნიკურად "EDITABLE" სტატუსია), მაგრამ ამანათები აღარაა PENDING
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 0, reason: "სამივე დაკეტილი" } });
      const midOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(midOrder.status).toBe("EN_ROUTE_PICKUP");

      const before = await prisma.orderParcel.findMany({ where: { orderId }, orderBy: { sequenceNo: "asc" } });
      expect(before.every((p) => p.status === "NOT_PICKED_UP")).toBe(true);

      actAs(session(await makeUser("DISPATCHER")));
      const r = await call(editOrder, { params: { id: orderId }, body: { weightKg: 20 } });
      expect(r.status).toBe(409);

      const after = await prisma.orderParcel.findMany({ where: { orderId }, orderBy: { sequenceNo: "asc" } });
      expect(after.map((p) => Number(p.allocatedDeliveryPrice))).toEqual(
        before.map((p) => Number(p.allocatedDeliveryPrice)),
      );
    });
  });

  // ── B2 — pickup-ზე ვერ ჩაირიცხება ორმაგად ──
  it("B2: pickup/en-route ეტაპებზე Order.codAmount/collectAmount ხელუხლებელია — ფული მხოლოდ ფინალიზაციაზე მოძრაობს", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, {
        body: orderBody({ parcelCount: 4, collectAmount: 40, payerSide: "SENDER" }),
      });
      const orderId = created.body.order.id as string;
      const originalCodAmount = Number(
        (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).codAmount,
      );

      await toEnRoutePickup(orderId, drv);
      const afterEnRoute = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(Number(afterEnRoute.codAmount)).toBe(originalCodAmount); // არაფერი შეცვლილა

      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 4 } });
      const afterPickup = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(Number(afterPickup.codAmount)).toBe(originalCodAmount); // pickup-ს ფული არ გადაუნაცვლებია

      const adjBeforeFinalize = await prisma.customerAdjustment.count({ where: { orderId } });
      expect(adjBeforeFinalize).toBe(0); // ჯერ ლეჯერზე არაფერი დარიცხულა
    });
  });

  it("B2: ფინალიზაციამდე ერთხელაც არ იქმნება DELIVERY_CHARGE — მხოლოდ ჩაბარების დადასტურებისას, ერთხელ", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, deliver }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, {
        body: orderBody({ parcelCount: 4, collectAmount: 40, payerSide: "SENDER" }),
      });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);
      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 4 } });
      await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });

      expect(await prisma.customerAdjustment.count({ where: { orderId } })).toBe(0);

      const del = await call(deliver, { params: { id: orderId }, body: { deliveredCount: 4 } });
      expect(del.status).toBe(200);

      // ერთადერთი DELIVERY_CHARGE — ეს არის ერთადერთი ადგილი, სადაც ეს კლიენტს ერიცხება
      const adj = await prisma.customerAdjustment.findMany({ where: { orderId } });
      expect(adj.filter((a) => a.kind === "DELIVERY_CHARGE")).toHaveLength(1);
    });
  });

  // ── R2 — pickup-მდელი გაუქმება ──
  it("R2: pickup-მდელი გაუქმება ყველა PENDING/NOT_PICKED_UP ამანათს ხურავს CANCELLED-ით, ფინანსური ჩანაწერის გარეშე", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup }) => {
      const c = await makeUser("CUSTOMER");
      const disp = await makeUser("DISPATCHER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 5 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);

      // ერთი მცდელობა — 0 აღებული, 5 NOT_PICKED_UP
      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 0, reason: "ვერ დაუკავშირდა" } });

      actAs(session(disp));
      const r = await call(setStatus, { params: { id: orderId }, body: { status: "CANCELLED" } });
      expect(r.status).toBe(200);

      const parcels = await prisma.orderParcel.findMany({ where: { orderId } });
      expect(parcels.every((p) => p.status === "CANCELLED")).toBe(true);
      expect(parcels.every((p) => p.cancelledAt != null)).toBe(true);

      const events = await prisma.orderParcelEvent.findMany({
        where: { parcelId: { in: parcels.map((p) => p.id) }, status: "CANCELLED" },
      });
      expect(events).toHaveLength(5);

      // მიტანის/დაბრუნების/COD-ის ლეჯერი — არასდროს, ეს ამანათი არასდროს ჩაბარებულა
      expect(await prisma.customerAdjustment.count({ where: { orderId } })).toBe(0);
      // შენიშვნა: EN_ROUTE_PICKUP-ზე გაუქმებისას კურიერს ერიცხება ცალკე, ამ ფუნქციისგან
      // დამოუკიდებელი ფიქს. კომპენსაცია უკვე-გავლილი სვლისთვის (CANCELLED_EN_ROUTE,
      // არსებული ლოგიკა single-parcel-ზეც) — ეს არ არის "delivery"-earning და R2-ის
      // მოთხოვნას არ ეხება (DELIVERY_CHARGE/RETURN_FEE/COD ვერ შეიქმნა — ეს დამოწმებულია ზემოთ).
      const earnings = await prisma.driverEarning.findMany({ where: { orderId } });
      expect(earnings.every((e) => e.kind !== "DELIVERY")).toBe(true);
    });
  });

  it("R2: pickup-მდელი (PENDING, ჯერ arc EN_ROUTE_PICKUP) გაუქმებაც ცალკე ხურავს ამანათებს", async () => {
    await withMultiParcelEnabled(async ({ createOrder }) => {
      const c = await makeUser("CUSTOMER");
      const disp = await makeUser("DISPATCHER");
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 3 }) });
      const orderId = created.body.order.id as string;

      actAs(session(disp));
      const r = await call(setStatus, { params: { id: orderId }, body: { status: "CANCELLED" } });
      expect(r.status).toBe(200);

      const parcels = await prisma.orderParcel.findMany({ where: { orderId } });
      expect(parcels.every((p) => p.status === "CANCELLED")).toBe(true);
      expect(await prisma.customerAdjustment.count({ where: { orderId } })).toBe(0);
      expect(await prisma.driverEarning.count({ where: { orderId } })).toBe(0);
    });
  });

  // ── R1 — ledger-based დაბრუნების საფასურის გაუქმება ──
  it("R1: დაბრუნების საფასურის ledger-გაუქმება — მიზეზი სავალდებულო, ორიგინალი row უცვლელი, append-only reversal, idempotent", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, deliver, returnConfirm, adjust }) => {
      const c = await makeUser("CUSTOMER");
      const disp = await makeUser("DISPATCHER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 4 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);
      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 4 } });
      await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });
      await call(deliver, { params: { id: orderId }, body: { deliveredCount: 2, reason: "RECIPIENT_REFUSED" } });
      await callReturnConfirm(returnConfirm, orderId, { returnedCount: 2, withPhoto: true });

      const beforeWaive = await prisma.customerAdjustment.findMany({ where: { orderId, kind: "RETURN_FEE" } });
      expect(beforeWaive).toHaveLength(2);
      const originalAmounts = beforeWaive.map((a) => Number(a.amount)).sort();

      actAs(session(disp));
      const noReason = await call(adjust, { params: { id: orderId }, body: { waiveReturnFee: true } });
      expect(noReason.status).toBe(422);

      const r = await call(adjust, {
        params: { id: orderId },
        body: { waiveReturnFee: true, reason: "მომხმარებელთან შევთანხმდით — არ დაერიცხოს" },
      });
      expect(r.status).toBe(200);
      expect(r.body.waived).toBe(true);

      // ორიგინალი RETURN_FEE row-ები უცვლელია (amount/kind ხელუხლებელი), მხოლოდ settledAt დაინიშნა
      const afterWaive = await prisma.customerAdjustment.findMany({ where: { orderId, kind: "RETURN_FEE" } });
      expect(afterWaive).toHaveLength(2);
      expect(afterWaive.map((a) => Number(a.amount)).sort()).toEqual(originalAmounts);
      expect(afterWaive.every((a) => a.settledAt != null)).toBe(true);

      // append-only reversal — ახალი, დადებითი ჩანაწერი
      const reversal = await prisma.customerAdjustment.findMany({ where: { orderId, kind: "RETURN_FEE_WAIVED" } });
      expect(reversal).toHaveLength(2);
      expect(reversal.every((a) => Number(a.amount) > 0)).toBe(true);

      // parcelFinance — დაბრუნების საფასური საბოლოო ჯამში აღარ ითვლება
      const final = await call(getOrder, { params: { id: orderId } });
      expect(final.body.order.parcelFinance.returnFeeWaived).toBeCloseTo(
        Math.abs(originalAmounts.reduce((s: number, a: number) => s + a, 0)),
        2,
      );

      // idempotent — მეორედ გაშვება არაფერს არ დაარიცხავს ხელახლა
      const again = await call(adjust, {
        params: { id: orderId },
        body: { waiveReturnFee: true, reason: "ხელახლა ვცადოთ" },
      });
      const reversalAfterAgain = await prisma.customerAdjustment.findMany({
        where: { orderId, kind: "RETURN_FEE_WAIVED" },
      });
      expect(reversalAfterAgain).toHaveLength(2); // და არა 4 — ვერ დარიცხა ხელახლა
      expect(again.status).toBe(400); // "არაფერი შესაცვლელი" — ყველაფერი უკვე settled
    });
  });

  // ── R3 — ledger ხილვადობა დისპეჩერისთვის, customer/driver-ს დამალული ──
  it("R3: parcelLedger მხოლოდ დისპეჩერს ჩანს — customer/driver ცარიელს იღებენ", async () => {
    await withMultiParcelEnabled(async ({ createOrder, pickup, deliver }) => {
      const c = await makeUser("CUSTOMER");
      const drv = await makeDriver({ approved: true });
      actAs(session(c));
      const created = await call(createOrder, { body: orderBody({ parcelCount: 2 }) });
      const orderId = created.body.order.id as string;
      await toEnRoutePickup(orderId, drv);
      actAs(session(drv.user));
      await call(pickup, { params: { id: orderId }, body: { pickedUpCount: 2 } });
      await call(setStatus, { params: { id: orderId }, body: { status: "IN_TRANSIT" } });
      await call(deliver, { params: { id: orderId }, body: { deliveredCount: 2 } });

      const asDriver = await call(getOrder, { params: { id: orderId } });
      expect(asDriver.body.order.parcelLedger).toEqual([]);

      actAs(session(c));
      const asCustomer = await call(getOrder, { params: { id: orderId } });
      expect(asCustomer.body.order.parcelLedger).toEqual([]);

      actAs(session(await makeUser("DISPATCHER")));
      const asDispatcher = await call(getOrder, { params: { id: orderId } });
      expect(asDispatcher.body.order.parcelLedger.length).toBeGreaterThan(0);
      expect(asDispatcher.body.order.parcelLedger[0]).toHaveProperty("reason");
    });
  });
});
