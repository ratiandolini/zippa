import { describe, it, expect, beforeEach, vi } from "vitest";
import sharp from "sharp";
import { resetDb, prisma, makeUser, makeDriver, actAs, session } from "./helpers";

vi.mock("@/lib/storage", () => ({
  putFile: vi.fn(async (key: string) => ({ url: `/uploads/${key}` })),
}));

import { POST as uploadPhoto } from "@/app/api/orders/[id]/photo/route";

beforeEach(resetDb);

async function pngBuffer() {
  return sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer();
}

async function callUpload(orderId: string, buf: Buffer, type = "image/png") {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type }), "photo.png");
  const req = new Request("http://test.local/api", {
    method: "POST",
    body: fd,
    headers: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.1` },
  });
  const res = await uploadPhoto(req, { params: { id: orderId } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function makeOrder(customerId: string, driverId: string, status: string) {
  return prisma.order.create({
    data: {
      trackingNumber: `ZP-TEST-${Math.random().toString(36).slice(2, 8)}`,
      customerId,
      driverId,
      status: status as never,
      senderName: "ა", senderPhone: "+995599000001",
      pickupAddress: "თბ", pickupLat: 41.7, pickupLng: 44.8,
      recipientName: "ბ", recipientPhone: "+995599000002",
      deliveryAddress: "თბ 2", deliveryLat: 41.71, deliveryLng: 44.79,
      weightKg: 2,
    },
  });
}

describe("მიტანის ფოტო", () => {
  it("კურიერი ტვირთავს ფოტოს IN_TRANSIT-ზე", async () => {
    const c = await makeUser("CUSTOMER");
    const { user: dUser, profile } = await makeDriver({ approved: true });
    const o = await makeOrder(c.id, profile.id, "IN_TRANSIT");

    actAs(session(dUser));
    const r = await callUpload(o.id, await pngBuffer());
    expect(r.status).toBe(200);
    const db = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(db.proofPhotoUrl).toContain("/uploads/proofs/");
  });

  it("სხვისი შეკვეთის კურიერი → 403", async () => {
    const c = await makeUser("CUSTOMER");
    const { profile } = await makeDriver({ approved: true });
    const other = await makeDriver({ approved: true });
    const o = await makeOrder(c.id, profile.id, "IN_TRANSIT");

    actAs(session(other.user));
    const r = await callUpload(o.id, await pngBuffer());
    expect(r.status).toBe(403);
  });

  it("აღებამდე (ASSIGNED) → 409", async () => {
    const c = await makeUser("CUSTOMER");
    const { user: dUser, profile } = await makeDriver({ approved: true });
    const o = await makeOrder(c.id, profile.id, "ASSIGNED");

    actAs(session(dUser));
    const r = await callUpload(o.id, await pngBuffer());
    expect(r.status).toBe(409);
  });

  it("ფაილის გარეშე → 422", async () => {
    const c = await makeUser("CUSTOMER");
    const { user: dUser, profile } = await makeDriver({ approved: true });
    const o = await makeOrder(c.id, profile.id, "DELIVERED");

    actAs(session(dUser));
    const req = new Request("http://test.local/api", {
      method: "POST",
      body: new FormData(),
      headers: { "x-forwarded-for": "10.9.1.1" },
    });
    const res = await uploadPhoto(req, { params: { id: o.id } });
    expect(res.status).toBe(422);
  });
});
