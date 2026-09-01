import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { resetDb, prisma } from "./helpers";
import { calculatePrice, resolveZone, resolveCityId, estimateDelivery } from "@/lib/pricing";

const TB = { lat: 41.72, lng: 44.79 };
const TB2 = { lat: 41.71, lng: 44.77 };
const BATUMI = { lat: 41.6168, lng: 41.6367 };
const REMOTE = { lat: 42.9, lng: 43.5 };

beforeAll(resetDb);
beforeEach(resetDb);

describe("resolveZone / resolveCityId", () => {
  it("თბილისი → TBILISI", async () => {
    const tb = await prisma.city.findUniqueOrThrow({ where: { name: "თბილისი" } });
    expect(await resolveZone(tb.id)).toBe("TBILISI");
  });
  it("სხვა ქალაქი → REGIONAL_CITY", async () => {
    const ba = await prisma.city.findUniqueOrThrow({ where: { name: "ბათუმი" } });
    expect(await resolveZone(ba.id)).toBe("REGIONAL_CITY");
  });
  it("null → TOWN_VILLAGE", async () => {
    expect(await resolveZone(null)).toBe("TOWN_VILLAGE");
  });
  it("resolveCityId — თბილისის კოორდინატი აბრუნებს თბილისს", async () => {
    const id = await resolveCityId(TB);
    const c = await prisma.city.findUniqueOrThrow({ where: { id: id! } });
    expect(c.name).toBe("თბილისი");
  });
  it("resolveCityId — შორეული წერტილი აბრუნებს null", async () => {
    expect(await resolveCityId(REMOTE)).toBeNull();
  });
});

describe("calculatePrice — თბილისი", () => {
  const tbId = () => prisma.city.findUniqueOrThrow({ where: { name: "თბილისი" } }).then((c) => c.id);

  it("3 კგ ნაღდი → 5 + 1 = 6, კურიერს 2", async () => {
    const p = await calculatePrice({
      pickup: TB, delivery: TB2, weightKg: 3, paymentMethod: "CASH", deliveryCityId: await tbId(),
    });
    expect(p.zone).toBe("TBILISI");
    expect(p.deliveryPrice).toBe(5);
    expect(p.codFee).toBe(1);
    expect(p.totalPrice).toBe(6);
    expect(p.driverFee).toBe(2);
    expect(p.overWeight).toBe(false);
  });

  it("ბარათი → codFee 0", async () => {
    const p = await calculatePrice({
      pickup: TB, delivery: TB2, weightKg: 3, paymentMethod: "CARD", deliveryCityId: await tbId(),
    });
    expect(p.codFee).toBe(0);
    expect(p.totalPrice).toBe(5);
  });

  it.each([
    [6, 5], [7, 5], [11, 5], [12, 7], [16, 7], [20, 10], [30, 13], [40, 16], [50, 20],
  ])("წონა %d კგ → მიტანა %d ₾", async (kg, expected) => {
    const p = await calculatePrice({
      pickup: TB, delivery: TB2, weightKg: kg, paymentMethod: "CARD", deliveryCityId: await tbId(),
    });
    expect(p.deliveryPrice).toBe(expected);
  });

  it("51 კგ-ზე მეტი → overWeight true, ბოლო კალათის ფასი", async () => {
    const p = await calculatePrice({
      pickup: TB, delivery: TB2, weightKg: 80, paymentMethod: "CARD", deliveryCityId: await tbId(),
    });
    expect(p.overWeight).toBe(true);
    expect(p.deliveryPrice).toBe(20);
  });
});

describe("calculatePrice — რეგიონი / სოფელი", () => {
  it("ბათუმი 3 კგ ნაღდი → 7 + 2, კურიერს 5", async () => {
    const ba = await prisma.city.findUniqueOrThrow({ where: { name: "ბათუმი" } });
    const p = await calculatePrice({
      pickup: TB, delivery: BATUMI, weightKg: 3, paymentMethod: "CASH", deliveryCityId: ba.id,
    });
    expect(p.zone).toBe("REGIONAL_CITY");
    expect(p.totalPrice).toBe(9);
    expect(p.driverFee).toBe(5);
  });

  it("შორეული სოფელი 3 კგ → 11 ₾, კურიერს 7", async () => {
    const p = await calculatePrice({
      pickup: TB, delivery: REMOTE, weightKg: 3, paymentMethod: "CARD", deliveryCityId: null,
    });
    expect(p.zone).toBe("TOWN_VILLAGE");
    expect(p.deliveryPrice).toBe(11);
    expect(p.driverFee).toBe(7);
  });
});

describe("estimateDelivery — 16:00 წესი", () => {
  it("თბილისი, 10:00 → იმ დღესვე", async () => {
    const at = new Date("2026-09-02T06:00:00.000Z"); // 10:00 თბილისში
    const eta = await estimateDelivery("TBILISI", at);
    expect(eta.getUTCDate()).toBe(at.getUTCDate());
  });
  it("თბილისი, 18:00 → მეორე დღეს", async () => {
    const at = new Date("2026-09-02T14:00:00.000Z"); // 18:00 თბილისში
    const eta = await estimateDelivery("TBILISI", at);
    expect(eta.getUTCDate()).toBe(at.getUTCDate() + 1);
  });
  it("რეგიონი → +1 დღე მინიმუმ", async () => {
    const at = new Date("2026-09-02T06:00:00.000Z");
    const eta = await estimateDelivery("REGIONAL_CITY", at);
    expect(eta.getUTCDate()).toBe(at.getUTCDate() + 1);
  });
});
