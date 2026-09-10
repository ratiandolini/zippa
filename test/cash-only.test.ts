import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, call, makeUser, actAs, session } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { PATCH as editOrder } from "@/app/api/orders/[id]/route";
import { POST as quote } from "@/app/api/pricing/quote/route";

// პირველი გაშვება — მხოლოდ ნაღდი მიტანის საფასური (COD). ბარათით გადახდა არ არსებობს:
// create / edit / quote route-ზე paymentMethod: "CARD" → 422.

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

describe("CASH-only — ბარათით გადახდა აკრძალულია", () => {
  it("create route: paymentMethod CARD → 422", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const r = await call(createOrder, { body: orderBody({ paymentMethod: "CARD" }) });
    expect(r.status).toBe(422);
    // ვალიდური CASH — 201
    const ok = await call(createOrder, { body: orderBody() });
    expect(ok.status).toBe(201);
  });

  it("edit route: paymentMethod CARD → 422", async () => {
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const created = await call(createOrder, { body: orderBody() });
    const id = (created.body.order as { id: string }).id;

    const bad = await call(editOrder, {
      method: "PATCH",
      params: { id },
      body: { paymentMethod: "CARD" },
    });
    expect(bad.status).toBe(422);

    // სხვა ველის რედაქტირება — მუშაობს
    const okEdit = await call(editOrder, {
      method: "PATCH",
      params: { id },
      body: { recipient: { name: "ახალი მიმღები", phone: "+995599333444" } },
    });
    expect(okEdit.status).toBe(200);
  });

  it("quote route: paymentMethod CARD → 422", async () => {
    actAs(session(await makeUser("CUSTOMER")));
    const bad = await call(quote, {
      body: {
        pickup: { lat: 41.72, lng: 44.79 },
        delivery: { lat: 41.71, lng: 44.77 },
        weightKg: 3,
        paymentMethod: "CARD",
      },
    });
    expect(bad.status).toBe(422);

    const okq = await call(quote, {
      body: {
        pickup: { lat: 41.72, lng: 44.79 },
        delivery: { lat: 41.71, lng: 44.77 },
        weightKg: 3,
        paymentMethod: "CASH",
      },
    });
    expect(okq.status).toBe(200);
  });
});
