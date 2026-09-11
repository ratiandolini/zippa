import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { GET as getOrder } from "@/app/api/orders/[id]/route";

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

// ─────────────────────────────────────────────────────────
// Phase 1 — additive schema + read-only serialization. ეს ტესტები ამოწმებს:
// 1. ძველი (isMultiParcel=false) შეკვეთა byte-compatible რჩება (parcels: []);
// 2. ხელით შექმნილი OrderParcel-row-ები სწორად სერიალიზდება, sequenceNo-ს მიხედვით დალაგებული;
// 3. declaredValue==null parcel-ზე კლიენტს/დისპეჩერს/კურიერს ერთნაირად უბრუნებს null-ს
//    (100 ₾ ლიმიტის ახსნა UI-ის პასუხისმგებლობაა, არა serialize-ის).
// ─────────────────────────────────────────────────────────

describe("მრავალამანათიანი შეკვეთა — Phase 1 (schema + read-only)", () => {
  it("ძველი ერთამანათიანი შეკვეთა byte-compatible რჩება — parcels ყოველთვის ცარიელი მასივია", async () => {
    const customer = await makeUser("CUSTOMER");
    actAs(session(customer));
    const created = await call(createOrder, { body: orderBody() });
    expect(created.status).toBe(201);
    const order = created.body.order as { id: string; isMultiParcel: boolean; parcelCount: number; parcels: unknown[] };

    expect(order.isMultiParcel).toBe(false);
    expect(order.parcelCount).toBe(1);
    expect(order.parcels).toEqual([]);

    const r = await call(getOrder, { params: { id: order.id } });
    expect(r.status).toBe(200);
    const fetched = r.body.order as { parcels: unknown[]; isMultiParcel: boolean };
    expect(fetched.parcels).toEqual([]);
    expect(fetched.isMultiParcel).toBe(false);
  });

  it("ხელით შექმნილი OrderParcel-ები სწორად სერიალიზდება sequenceNo-ს მიხედვით დალაგებული", async () => {
    const customer = await makeUser("CUSTOMER");
    actAs(session(customer));
    const created = await call(createOrder, { body: orderBody() });
    const orderId = (created.body.order as { id: string }).id;

    await prisma.order.update({
      where: { id: orderId },
      data: { isMultiParcel: true, parcelCount: 2 },
    });
    // განზრახ საწინააღმდეგო sequenceNo-ს რიგით შევქმენი — დალაგება serialize-ის პასუხისმგებლობაა
    await prisma.orderParcel.create({
      data: {
        orderId,
        sequenceNo: 2,
        weightKg: 4,
        description: "მეორე ყუთი",
        declaredValue: 200,
        status: "PENDING",
      },
    });
    await prisma.orderParcel.create({
      data: {
        orderId,
        sequenceNo: 1,
        weightKg: 1.5,
        description: "პირველი ყუთი",
        declaredValue: null, // ღირებულება არ მითითებულა — 100 ₾ ლიმიტი
        status: "PENDING",
      },
    });

    const r = await call(getOrder, { params: { id: orderId } });
    expect(r.status).toBe(200);
    const order = r.body.order as {
      isMultiParcel: boolean;
      parcelCount: number;
      parcels: { sequenceNo: number; description: string | null; declaredValue: number | null; status: string }[];
    };

    expect(order.isMultiParcel).toBe(true);
    expect(order.parcelCount).toBe(2);
    expect(order.parcels).toHaveLength(2);
    expect(order.parcels[0].sequenceNo).toBe(1);
    expect(order.parcels[0].description).toBe("პირველი ყუთი");
    expect(order.parcels[0].declaredValue).toBeNull();
    expect(order.parcels[1].sequenceNo).toBe(2);
    expect(order.parcels[1].declaredValue).toBe(200);
  });

  it("proofPhotoUrl parcel-ზე ყოველთვის null-ია Phase 1-ში — დაცული proxy ჯერ არ არსებობს", async () => {
    const customer = await makeUser("CUSTOMER");
    actAs(session(customer));
    const created = await call(createOrder, { body: orderBody() });
    const orderId = (created.body.order as { id: string }).id;

    await prisma.orderParcel.create({
      data: {
        orderId,
        sequenceNo: 1,
        weightKg: 2,
        status: "DELIVERED",
        proofPhotoUrl: "https://blob.example/raw-secret-url.jpg",
      },
    });

    const r = await call(getOrder, { params: { id: orderId } });
    const order = r.body.order as { parcels: { proofPhotoUrl: string | null }[] };
    expect(order.parcels[0].proofPhotoUrl).toBeNull();
  });
});
