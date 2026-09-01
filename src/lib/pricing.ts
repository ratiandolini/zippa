import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/geo";
import type { DeliveryKind, PaymentMethod } from "@prisma/client";

export interface PriceInput {
  pickup: { lat: number; lng: number };
  delivery: { lat: number; lng: number };
  weightKg: number;
  paymentMethod: PaymentMethod;
  pickupCityId?: string | null;
  deliveryCityId?: string | null;
}

export interface PriceBreakdown {
  kind: DeliveryKind;
  distanceKm: number;
  basePrice: number;
  distancePrice: number;
  weightPrice: number;
  codFee: number;
  totalPrice: number;
  pricingRuleId: string;
  driverPayoutPercent: number;
}

const n = (v: unknown) => Number(v);

/** ფასის გამოთვლა მოქმედი ტარიფის წესის მიხედვით (სნეპშოტი შეკვეთაზე შესანახად) */
export async function calculatePrice(input: PriceInput): Promise<PriceBreakdown> {
  const kind: DeliveryKind =
    input.pickupCityId && input.deliveryCityId && input.pickupCityId !== input.deliveryCityId
      ? "INTER_CITY"
      : "INTRA_CITY";

  const cityId = kind === "INTRA_CITY" ? input.pickupCityId ?? undefined : undefined;

  // ჯერ ქალაქზე მიბმული წესი, მერე ზოგადი (cityId=null), priority-ის მიხედვით
  const rule =
    (cityId
      ? await prisma.pricingRule.findFirst({
          where: { isActive: true, kind, cityId },
          orderBy: { priority: "desc" },
        })
      : null) ??
    (await prisma.pricingRule.findFirst({
      where: { isActive: true, kind, cityId: null },
      orderBy: { priority: "desc" },
    }));

  if (!rule) throw new Error("ტარიფის წესი ვერ მოიძებნა");

  const distanceKm = Math.round(haversineKm(input.pickup, input.delivery) * 100) / 100;

  const basePrice = n(rule.basePrice);
  const distancePrice = Math.round(distanceKm * n(rule.pricePerKm) * 100) / 100;

  const billableWeight = Math.max(0, input.weightKg - n(rule.freeWeightKg));
  const weightPrice = Math.round(billableWeight * n(rule.pricePerKg) * 100) / 100;

  const codFee = input.paymentMethod === "CASH" ? n(rule.codFee) : 0;

  let totalPrice = basePrice + distancePrice + weightPrice + codFee;
  totalPrice = Math.max(totalPrice, n(rule.minPrice));
  totalPrice = Math.round(totalPrice * 100) / 100;

  return {
    kind,
    distanceKm,
    basePrice,
    distancePrice,
    weightPrice,
    codFee,
    totalPrice,
    pricingRuleId: rule.id,
    driverPayoutPercent: rule.driverPayoutPercent,
  };
}

/** უახლოესი ქალაქის მიხედვით cityId-ის მიახლოებითი დადგენა კოორდინატებიდან */
export async function resolveCityId(pt: { lat: number; lng: number }): Promise<string | null> {
  const cities = await prisma.city.findMany({ where: { isActive: true } });
  if (!cities.length) return null;
  let best = cities[0];
  let bestD = Infinity;
  for (const c of cities) {
    const d = haversineKm(pt, { lat: c.centerLat, lng: c.centerLng });
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  // 40 კმ-ზე შორს — ქალაქს არ ვაბამთ
  return bestD <= 40 ? best.id : null;
}
