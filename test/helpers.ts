import { vi } from "vitest";
import type { Role } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth/jwt";

// ─── სესიის mock ───
export let currentSession: SessionPayload | null = null;
export function actAs(s: SessionPayload | null) {
  currentSession = s;
}

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => currentSession,
  createSession: vi.fn(async () => {}),
  clearSessionCookie: vi.fn(() => {}),
  AUTH_COOKIE_NAME: "skr_session",
}));

// prisma-ს იმპორტი mock-ის შემდეგ
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

export { prisma };

const TABLES = [
  "PasswordReset", "Review", "DriverEarning", "CashSettlement", "Payout",
  "CustomerAdjustment", "CodRemittance", "Payment", "OrderEvent", "Order", "Notification",
  "PushSubscription", "DriverProfile", "PricingRule", "Zone", "City", "User", "Setting",
];

const B = (rows: [number, number][]) => rows.map(([maxKg, price]) => ({ maxKg, price }));

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`,
  );
  await prisma.city.createMany({
    data: [
      { name: "თბილისი", centerLat: 41.7151, centerLng: 44.8271 },
      { name: "ბათუმი", centerLat: 41.6168, centerLng: 41.6367 },
      { name: "ქუთაისი", centerLat: 42.2679, centerLng: 42.7181 },
    ],
  });
  await prisma.pricingRule.createMany({
    data: [
      {
        zone: "TBILISI",
        weightBrackets: B([[6, 5], [10, 6], [15, 8], [20, 10], [30, 13], [40, 16], [50, 20]]),
        codFee: "0", driverFlatFee: "3.00", sameDayCutoffHour: 16, deliveryDays: 0,
      },
      {
        zone: "REGIONAL_CITY",
        weightBrackets: B([[6, 7], [10, 9], [15, 12], [20, 15], [30, 19], [40, 28], [50, 38]]),
        codFee: "0", driverFlatFee: "5.00", deliveryDays: 1,
      },
      {
        zone: "TOWN_VILLAGE",
        weightBrackets: B([[6, 11], [10, 13], [15, 16], [20, 19], [30, 23], [40, 33], [50, 43]]),
        codFee: "0", driverFlatFee: "7.00", deliveryDays: 2,
      },
    ],
  });
}

let seq = 0;
const uniq = () => `${Date.now()}${seq++}`;

export async function makeUser(role: Role, over: Partial<{ email: string; phone: string; name: string; password: string; isActive: boolean }> = {}) {
  const u = uniq();
  const user = await prisma.user.create({
    data: {
      email: over.email ?? `u${u}@test.ge`,
      phone: over.phone ?? `+9955${u.slice(-8)}`,
      passwordHash: await hashPassword(over.password ?? "password123"),
      name: over.name ?? `User ${u}`,
      role,
      isActive: over.isActive ?? true,
    },
  });
  return user;
}

export async function makeDriver(opts: { approved?: boolean; status?: "OFFLINE" | "AVAILABLE" | "BUSY" } = {}) {
  const user = await makeUser("DRIVER");
  const profile = await prisma.driverProfile.create({
    data: {
      userId: user.id,
      isApproved: opts.approved ?? true,
      status: opts.status ?? "AVAILABLE",
      currentLat: 41.72,
      currentLng: 44.79,
    },
  });
  return { user, profile };
}

export function session(user: { id: string; role: Role; name: string; email: string }): SessionPayload {
  return { sub: user.id, role: user.role, name: user.name, email: user.email };
}

// ─── route handler-ის გამოძახება ───
interface CallOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string>;
  params?: Record<string, string>;
  ip?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => Promise<Response> | Response;

export async function call(handler: Handler, opts: CallOpts = {}) {
  const url = new URL("http://test.local/api");
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const req = new Request(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": opts.ip ?? `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await handler(req, { params: opts.params ?? {} });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (json ?? {}) as any };
}
