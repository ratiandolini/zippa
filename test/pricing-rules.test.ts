import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, call, makeUser, actAs, session } from "./helpers";
import { GET as listRules } from "@/app/api/pricing/rules/route";
import { PATCH as patchRule } from "@/app/api/pricing/rules/[id]/route";
import { POST as quote } from "@/app/api/pricing/quote/route";

beforeEach(resetDb);

const quoteBody = {
  pickup: { lat: 41.72, lng: 44.79 },
  delivery: { lat: 41.71, lng: 44.77 },
  weightKg: 3,
  paymentMethod: "CASH" as const,
};

describe("ტარიფის წესები", () => {
  it("დისპეჩერი ხედავს 3 ზონას", async () => {
    actAs(session(await makeUser("DISPATCHER")));
    const r = await call(listRules, {});
    const rules = r.body.rules as { zone: string }[];
    expect(rules.map((x) => x.zone).sort()).toEqual(["REGIONAL_CITY", "TBILISI", "TOWN_VILLAGE"]);
  });

  it("არა-დისპეჩერი → 403", async () => {
    actAs(session(await makeUser("CUSTOMER")));
    expect((await call(listRules, {})).status).toBe(403);
  });

  it("კალათის რედაქტირება აისახება მომდევნო quote-ზე", async () => {
    const disp = await makeUser("DISPATCHER");
    actAs(session(disp));
    const rules = (await call(listRules, {})).body.rules as { id: string; zone: string }[];
    const tb = rules.find((x) => x.zone === "TBILISI")!;

    await call(patchRule, {
      params: { id: tb.id },
      body: { weightBrackets: [{ maxKg: 6, price: 9 }, { maxKg: 51, price: 15 }], codFee: 1, driverFlatFee: 2 },
    });

    actAs(session(await makeUser("CUSTOMER")));
    const q = await call(quote, { body: quoteBody });
    expect((q.body as { deliveryPrice: number }).deliveryPrice).toBe(9);
  });

  it("quote აბრუნებს ETA-ს და overWeight-ს", async () => {
    actAs(session(await makeUser("CUSTOMER")));
    const q = await call(quote, { body: { ...quoteBody, weightKg: 200 } });
    const b = q.body as { estimatedDeliveryAt: string; overWeight: boolean; zone: string };
    expect(b.zone).toBe("TBILISI");
    expect(b.overWeight).toBe(true);
    expect(new Date(b.estimatedDeliveryAt).getTime()).toBeGreaterThan(Date.now());
  });
});
