import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, call, makeUser, actAs, session } from "./helpers";

beforeEach(resetDb);

// flags.ts მოდულის-დონეზე კითხულობს process.env-ს იმპორტისას — ამ ტესტში ვქმნით
// მოდულის იზოლირებულ ასლს გამორთული flag-ებით (test/env.ts default-ად ჩართავს მათ
// ყველა სხვა ტესტისთვის — production-ის ნაგულისხმევი false აქ იზოლირებულად ვამოწმებთ).
describe("feature flags — გამორთვისას ახალი endpoint-ები არსად ჩანს", () => {
  it("PARTNER_ONBOARDING_ENABLED=false → /api/company 404-ს აბრუნებს", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_PARTNER_ONBOARDING_ENABLED", "false");
    const { GET } = await import("@/app/api/company/route");
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const r = await call(GET);
    expect(r.status).toBe(404);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("DRIVER_VERIFICATION_ENABLED=false → /api/driver/verification 404-ს აბრუნებს", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DRIVER_VERIFICATION_ENABLED", "false");
    const { GET } = await import("@/app/api/driver/verification/route");
    const d = await makeUser("DRIVER");
    actAs(session(d));
    const r = await call(GET);
    expect(r.status).toBe(404);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("15. RETAIL_PRICE_MARKUP_ENABLED=false → ჩვეულებრივი CUSTOMER-ის ფასი ზუსტად ისეთია, როგორიც markup-ის დამატებამდე", async () => {
    vi.resetModules();
    vi.stubEnv("RETAIL_PRICE_MARKUP_ENABLED", "false");
    const { POST: quote } = await import("@/app/api/pricing/quote/route");
    const c = await makeUser("CUSTOMER");
    actAs(session(c));
    const r = await call(quote, {
      body: {
        pickup: { address: "თბილისი, ა 1", lat: 41.72, lng: 44.79 },
        delivery: { address: "თბილისი, ბ 2", lat: 41.71, lng: 44.77 },
        weightKg: 3,
        paymentMethod: "CASH",
      },
    });
    expect(r.status).toBe(200);
    expect(r.body.deliveryPrice).toBe(5); // markup გამორთული — ძველი საჯარო ტარიფი უცვლელი
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
