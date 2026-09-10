import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resetDb, prisma, call, makeUser, makeDriver, actAs, session } from "./helpers";
import { POST as createOrder } from "@/app/api/orders/route";
import { PATCH as assign } from "@/app/api/orders/[id]/assign/route";
import { PATCH as setStatus } from "@/app/api/orders/[id]/status/route";
import { POST as review } from "@/app/api/orders/[id]/review/route";
import { GET as getOrder } from "@/app/api/orders/[id]/route";
import { GET as getPhoto } from "@/app/api/orders/[id]/photo/route";
import { GET as cronGet } from "@/app/api/cron/expire-assignments/route";
import { sendSms } from "@/lib/sms";
import { sendEmail } from "@/lib/email";

beforeEach(resetDb);

const body = (over: Record<string, unknown> = {}) => ({
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

async function deliver(over: Record<string, unknown> = {}) {
  const customer = await makeUser("CUSTOMER");
  const disp = await makeUser("DISPATCHER");
  const drv = await makeDriver({ approved: true });
  actAs(session(customer));
  const created = await call(createOrder, { body: body(over) });
  const id = (created.body.order as { id: string }).id;
  actAs(session(disp));
  await call(assign, { params: { id }, body: { driverId: drv.profile.id } });
  actAs(session(drv.user));
  for (const s of ["ACCEPTED", "EN_ROUTE_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"])
    await call(setStatus, { params: { id }, body: { status: s } });
  return { id, customer, disp, drv };
}

// ─────────────────────────────────────────────
// I3 — reset კოდი / SMS შიგთავსი ლოგებში არ უნდა მოხვდეს
// ─────────────────────────────────────────────
describe("I3 — SMS/email შიგთავსი არ ილოგება (თუ debug ჩართული არაა)", () => {
  const OLD = process.env.AUTH_DEBUG_RESET_CODES;
  afterEach(() => {
    process.env.AUTH_DEBUG_RESET_CODES = OLD;
    vi.restoreAllMocks();
  });

  it("AUTH_DEBUG_RESET_CODES დაყენებული არ არის → console.log არ იძახება", async () => {
    delete process.env.AUTH_DEBUG_RESET_CODES;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendSms("+995599000000", "Zippa — პაროლის აღდგენის კოდი — 123456");
    await sendEmail("x@test.ge", "Reset", "კოდი: 123456");
    expect(spy).not.toHaveBeenCalled();
  });

  it("AUTH_DEBUG_RESET_CODES=true (non-prod) → ლოგდება", async () => {
    process.env.AUTH_DEBUG_RESET_CODES = "true";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendSms("+995599000000", "test 123456");
    expect(spy).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// R2 — cron endpoint fail-closed
// ─────────────────────────────────────────────
describe("R2 — cron endpoint secret-ის გარეშე დაკეტილია", () => {
  const OLD_CRON = process.env.CRON_SECRET;
  const OLD_SETUP = process.env.SETUP_TOKEN;
  afterEach(() => {
    if (OLD_CRON === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = OLD_CRON;
    if (OLD_SETUP === undefined) delete process.env.SETUP_TOKEN;
    else process.env.SETUP_TOKEN = OLD_SETUP;
  });

  it("secret არ არის → 503", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.SETUP_TOKEN;
    const r = await call(cronGet);
    expect(r.status).toBe(503);
  });

  it("secret არის, token არასწორი → 401", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    delete process.env.SETUP_TOKEN;
    const r = await call(cronGet, { query: { token: "wrong" } });
    expect(r.status).toBe(401);
  });

  it("secret არის, token სწორი → 200", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const r = await call(cronGet, { query: { token: "s3cr3t" } });
    expect(r.status).toBe(200);
  });
});

// ─────────────────────────────────────────────
// R3 — rate-limit DB შეცდომაზე fail-CLOSED (მკაცრი in-memory, არა unlimited)
// ─────────────────────────────────────────────
describe("R3 — rate-limit fail-closed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("DB $queryRaw ჩავარდნისას მაინც ბლოკავს ლიმიტს გადაცილებისას", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("db down"));

    const key = `rl-failclosed-${Date.now()}`;
    const r1 = await rateLimit(key, 2, 60);
    const r2 = await rateLimit(key, 2, 60);
    const r3 = await rateLimit(key, 2, 60);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(false); // მე-3 იბლოკება DB-ის გარეშეც — არასდროს unlimited
    expect(r3.degraded).toBe(true);
    expect(r3.retryAfterSec).toBeGreaterThan(0);
  });

  it("throttle() DB შეცდომაზე → 429 login endpoint-ზე ლიმიტის მერე", async () => {
    const { POST: login } = await import("@/app/api/auth/login/route");
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("db down"));
    const ip = `9.9.9.${Math.floor(Math.random() * 250)}`;
    let last = 200;
    for (let i = 0; i < 12; i++) {
      const r = await call(login, {
        body: { emailOrPhone: "x@test.ge", password: "nope-nope" },
        ip,
      });
      last = r.status;
    }
    expect(last).toBe(429); // login limit 10/300წმ — DB-ის გარეშეც ეს ლიმიტი მუშაობს
  });
});

// ─────────────────────────────────────────────
// R5 — review-ის მეორე გაგზავნა → 409, არა 500
// ─────────────────────────────────────────────
describe("R5 — ორმაგი review", () => {
  it("პარალელური ორი review → ერთი 201, ერთი 409", async () => {
    const { id, customer } = await deliver();
    actAs(session(customer));
    const rs = await Promise.all([
      call(review, { params: { id }, body: { rating: 5, comment: "კარგი" } }),
      call(review, { params: { id }, body: { rating: 4, comment: "ასე ასე" } }),
    ]);
    const codes = rs.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]);
    expect(await prisma.review.count({ where: { orderId: id } })).toBe(1);
  });

  it("თანმიმდევრული მეორე review → 409", async () => {
    const { id, customer } = await deliver();
    actAs(session(customer));
    expect((await call(review, { params: { id }, body: { rating: 5 } })).status).toBe(201);
    const second = await call(review, { params: { id }, body: { rating: 1 } });
    expect(second.status).toBe(409);
  });
});

// ─────────────────────────────────────────────
// I2 — მიტანის ფოტო: serialize-ში ნედლი URL აღარ ჩანს + view წვდომაზეა დაცული
// ─────────────────────────────────────────────
describe("I2 — მიტანის ფოტოს დაცული view", () => {
  const rel = "/uploads/proofs/sec-test.jpg";
  const abs = path.join(process.cwd(), "public", "uploads", "proofs", "sec-test.jpg");

  beforeEach(async () => {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  });
  afterEach(async () => {
    await fs.rm(abs, { force: true });
  });

  async function orderWithPhoto() {
    const customer = await makeUser("CUSTOMER");
    const drv = await makeDriver({ approved: true });
    const other = await makeUser("CUSTOMER");
    const otherDrv = await makeDriver({ approved: true });
    const o = await prisma.order.create({
      data: {
        trackingNumber: `ZP-SEC-${Math.random().toString(36).slice(2, 7)}`,
        customerId: customer.id,
        driverId: drv.profile.id,
        status: "DELIVERED",
        senderName: "ა", senderPhone: "+995599000001",
        pickupAddress: "თბ", pickupLat: 41.7, pickupLng: 44.8,
        recipientName: "ბ", recipientPhone: "+995599000002",
        deliveryAddress: "თბ 2", deliveryLat: 41.71, deliveryLng: 44.79,
        weightKg: 2,
        proofPhotoUrl: rel,
      },
    });
    return { o, customer, drv, other, otherDrv };
  }

  it("serialize აბრუნებს ავტ. endpoint-ის მისამართს, არა ნედლ URL-ს", async () => {
    const { o, customer } = await orderWithPhoto();
    actAs(session(customer));
    const r = await call(getOrder, { params: { id: o.id } });
    expect((r.body.order as { proofPhotoUrl: string }).proofPhotoUrl).toBe(
      `/api/orders/${o.id}/photo`,
    );
    expect(JSON.stringify(r.body)).not.toContain("/uploads/proofs/");
  });

  it("მფლობელი კლიენტი → 200", async () => {
    const { o, customer } = await orderWithPhoto();
    actAs(session(customer));
    const res = await getPhoto(new Request("http://t.local"), { params: { id: o.id } });
    expect(res.status).toBe(200);
  });

  it("სხვისი კლიენტი → 403", async () => {
    const { o, other } = await orderWithPhoto();
    actAs(session(other));
    const res = await getPhoto(new Request("http://t.local"), { params: { id: o.id } });
    expect(res.status).toBe(403);
  });

  it("სხვისი კურიერი → 403", async () => {
    const { o, otherDrv } = await orderWithPhoto();
    actAs(session(otherDrv.user));
    const res = await getPhoto(new Request("http://t.local"), { params: { id: o.id } });
    expect(res.status).toBe(403);
  });

  it("ავტორიზაციის გარეშე → 401", async () => {
    actAs(null);
    const { o } = await orderWithPhoto();
    const res = await getPhoto(new Request("http://t.local"), { params: { id: o.id } });
    expect(res.status).toBe(401);
  });
});
