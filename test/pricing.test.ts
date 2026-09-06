import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { resetDb, prisma } from "./helpers";
import { calculatePrice, resolveZone, resolveCityId, estimateDelivery, driverFeeFor } from "@/lib/pricing";

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

  it("3 კგ ნაღდი → 5, კურიერს 3", async () => {
    const p = await calculatePrice({
      pickup: TB, delivery: TB2, weightKg: 3, paymentMethod: "CASH", deliveryCityId: await tbId(),
    });
    expect(p.zone).toBe("TBILISI");
    expect(p.deliveryPrice).toBe(5);
    expect(p.codFee).toBe(0);
    expect(p.totalPrice).toBe(5);
    expect(p.driverFee).toBe(3);
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
    [6, 5], [7, 6], [10, 6], [11, 8], [15, 8], [16, 10], [20, 10], [25, 13], [30, 13], [40, 16], [50, 20],
  ])("წონა %d კგ → მიტანა %d ₾", async (kg, expected) => {
    const p = await calculatePrice({
      pickup: TB, delivery: TB2, weightKg: kg, paymentMethod: "CARD", deliveryCityId: await tbId(),
    });
    expect(p.deliveryPrice).toBe(expected);
  });

  it("50 კგ-ზე მეტი → overWeight true, ბოლო კალათის ფასი", async () => {
    const p = await calculatePrice({
      pickup: TB, delivery: TB2, weightKg: 80, paymentMethod: "CARD", deliveryCityId: await tbId(),
    });
    expect(p.overWeight).toBe(true);
    expect(p.deliveryPrice).toBe(20);
  });
});

describe("calculatePrice — რეგიონი / სოფელი", () => {
  it("ბათუმი 3 კგ → 7 ₾, კურიერს 5", async () => {
    const ba = await prisma.city.findUniqueOrThrow({ where: { name: "ბათუმი" } });
    const p = await calculatePrice({
      pickup: TB, delivery: BATUMI, weightKg: 3, paymentMethod: "CASH", deliveryCityId: ba.id,
    });
    expect(p.zone).toBe("REGIONAL_CITY");
    expect(p.totalPrice).toBe(7);
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

describe("driverFeeFor — ბაზისი + კმ", () => {
  it("ბაზისი + (მანძილი − უფასო კმ) × ₾/კმ", () => {
    const rule = { driverBaseFee: 2.5, driverPerKm: 0.5, driverFreeKm: 5, driverFlatFee: 3 };
    expect(driverFeeFor(rule, 3, 5)).toBe(2.5); // უფასო ზონაში
    expect(driverFeeFor(rule, 5, 5)).toBe(2.5); // ზუსტად ზღვარზე
    expect(driverFeeFor(rule, 9, 5)).toBe(4.5); // 2.5 + 4×0.5
    expect(driverFeeFor(rule, 15, 5)).toBe(7.5); // 2.5 + 10×0.5
  });
  it("driverBaseFee = 0 → fallback ფიქსირებულ driverFlatFee-ზე", () => {
    expect(driverFeeFor({ driverBaseFee: 0, driverFlatFee: 3 }, 20, 5)).toBe(3);
  });
  it("calculatePrice იყენებს ბაზისი+კმ-ს როცა rule ასეა კონფიგურირებული", async () => {
    await prisma.pricingRule.update({
      where: { zone: "TBILISI" },
      data: { driverBaseFee: "2.50", driverPerKm: "0.50", driverFreeKm: "5" },
    });
    const tb = await prisma.city.findUniqueOrThrow({ where: { name: "თბილისი" } });
    const near = await calculatePrice({
      pickup: TB, delivery: TB2, weightKg: 3, paymentMethod: "CASH", deliveryCityId: tb.id,
    });
    expect(near.driverFee).toBe(2.5); // TB↔TB2 ახლოსაა (< 5 კმ)
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
