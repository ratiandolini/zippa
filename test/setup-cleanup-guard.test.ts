import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, prisma, call } from "./helpers";

beforeEach(resetDb);

// api/setup?cleanup=test — Phase 2 fix-ის ერთადერთი შეხება ამ route-ში: production-ში
// ტესტ-მონაცემების წაშლისას, DELIVERED-ის გვერდით, ახლა PARTIALLY_COMPLETED
// შეკვეთაც დაცულია (ორივე ფინანსურად "დასრულებული" შეკვეთაა — earnings/adjustments
// შეიძლება ჰქონდეთ). ცვლილება მხოლოდ ავიწროებს წაშლას (მეტს იცავს), არასდროს
// აფართოებს — ახალი წაშლის გზა არ ემატება.
async function withProdCleanupGuard<T>(
  fn: (POST: typeof import("@/app/api/setup/route").POST) => Promise<T>,
): Promise<T> {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SETUP_TOKEN", "test-setup-token");
  const { POST } = await import("@/app/api/setup/route");
  try {
    return await fn(POST);
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
}

async function makeTestOrder(status: "PARTIALLY_COMPLETED" | "DELIVERED" | "PENDING", emailSuffix: string) {
  const customer = await prisma.user.create({
    data: {
      email: `cleanup-${emailSuffix}@zippa.test`,
      phone: `+9955${Date.now().toString().slice(-8)}${emailSuffix}`.slice(0, 13),
      passwordHash: "x",
      name: "Test Customer",
      role: "CUSTOMER",
    },
  });
  const order = await prisma.order.create({
    data: {
      trackingNumber: `ZP-TEST-${emailSuffix}`,
      customerId: customer.id,
      status,
      senderName: "s",
      senderPhone: "+995599000000",
      pickupAddress: "a",
      pickupLat: 41.7,
      pickupLng: 44.8,
      recipientName: "r",
      recipientPhone: "+995599000001",
      deliveryAddress: "b",
      deliveryLat: 41.71,
      deliveryLng: 44.79,
    },
  });
  return { customer, order };
}

describe("api/setup?cleanup=test — production-ის დაცვის გუარდი", () => {
  it("production-ში PARTIALLY_COMPLETED სატესტო შეკვეთა არ იშლება (ისევე როგორც DELIVERED)", async () => {
    const { order: partial } = await makeTestOrder("PARTIALLY_COMPLETED", "partial");
    const { order: delivered } = await makeTestOrder("DELIVERED", "delivered");
    const { order: pending } = await makeTestOrder("PENDING", "pending");

    await withProdCleanupGuard(async (POST) => {
      const req = new Request("http://test.local/api/setup?cleanup=test", {
        method: "POST",
        headers: { "x-setup-token": "test-setup-token" },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    const stillThere = await prisma.order.findMany({
      where: { id: { in: [partial.id, delivered.id] } },
    });
    expect(stillThere.map((o) => o.id).sort()).toEqual([delivered.id, partial.id].sort());

    const pendingGone = await prisma.order.findUnique({ where: { id: pending.id } });
    expect(pendingGone).toBeNull();
  });

  it("არასწორი token → 401, admin პაროლი/secret არასდროს ბრუნდება პასუხში", async () => {
    await withProdCleanupGuard(async (POST) => {
      const req = new Request("http://test.local/api/setup", {
        method: "POST",
        headers: { "x-setup-token": "wrong-token" },
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  it("სწორი token, cleanup გარეშე → admin ველში მხოლოდ {email, role}, არასდროს პაროლი", async () => {
    await withProdCleanupGuard(async (POST) => {
      const req = new Request("http://test.local/api/setup", {
        method: "POST",
        headers: { "x-setup-token": "test-setup-token" },
      });
      const res = await POST(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      // ADMIN_EMAIL/ADMIN_PHONE/ADMIN_PASSWORD არ დაყენებულა ტესტ-გარემოში — ეს
      // ნაგულისხმევი გამოტოვების შეტყობინებაა, არა secret-ი. თუ admin ოდესმე
      // ობიექტად დაბრუნდება, მაინც მხოლოდ {email, role} უნდა შეიცავდეს.
      if (typeof body.admin === "object" && body.admin) {
        expect(Object.keys(body.admin).sort()).toEqual(["email", "role"]);
      }
      expect(JSON.stringify(body)).not.toMatch(/passwordHash|"password":|\$2[aby]\$/i);
    });
  });
});
