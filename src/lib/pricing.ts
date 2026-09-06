import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/geo";
import type { DeliveryZone, PaymentMethod } from "@prisma/client";

export interface WeightBracket {
  maxKg: number;
  price: number;
}

export interface PriceInput {
  pickup: { lat: number; lng: number };
  delivery: { lat: number; lng: number };
  weightKg: number;
  paymentMethod: PaymentMethod;
  deliveryCityId?: string | null;
}

export interface PriceBreakdown {
  zone: DeliveryZone;
  distanceKm: number;
  deliveryPrice: number; // წონა-კალათის ფასი
  codFee: number;
  totalPrice: number;
  driverFee: number; // კურიერს ერგება ამ მიტანაზე
  overWeight: boolean; // წონა ბოლო კალათას სცდება
}

const n = (v: unknown) => Number(v);

/** მიტანის ზონა — მიტანის მისამართის ქალაქის მიხედვით */
export async function resolveZone(deliveryCityId: string | null | undefined): Promise<DeliveryZone> {
  if (!deliveryCityId) return "TOWN_VILLAGE";
  const tbilisi = await prisma.city.findUnique({ where: { name: "თბილისი" }, select: { id: true } });
  if (deliveryCityId === tbilisi?.id) return "TBILISI";
  return "REGIONAL_CITY";
}

/** უახლოესი ქალაქის id კოორდინატებიდან (40 კმ-მდე), თორემ null */
export async function resolveCityId(pt: { lat: number; lng: number }): Promise<string | null> {
  const cities = await prisma.city.findMany({ where: { isActive: true } });
  let best: (typeof cities)[number] | null = null;
  let bestD = Infinity;
  for (const c of cities) {
    const d = haversineKm(pt, { lat: c.centerLat, lng: c.centerLng });
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best && bestD <= 40 ? best.id : null;
}

function bracketPrice(brackets: WeightBracket[], weightKg: number): { price: number; over: boolean } {
  const sorted = [...brackets].sort((a, b) => a.maxKg - b.maxKg);
  for (const b of sorted) if (weightKg <= b.maxKg) return { price: b.price, over: false };
  const last = sorted[sorted.length - 1];
  return { price: last?.price ?? 0, over: true };
}

export async function calculatePrice(input: PriceInput): Promise<PriceBreakdown> {
  const zone = await resolveZone(input.deliveryCityId);
  const rule = await prisma.pricingRule.findUnique({ where: { zone } });
  if (!rule) throw new Error(`ტარიფის წესი ვერ მოიძებნა ზონისთვის ${zone}`);

  const brackets = (rule.weightBrackets as unknown as WeightBracket[]) ?? [];
  const { price: deliveryPrice, over } = bracketPrice(brackets, input.weightKg);

  const codFee = input.paymentMethod === "CASH" ? n(rule.codFee) : 0;
  const totalPrice = Math.round((deliveryPrice + codFee) * 100) / 100;

  const distanceKm = Math.round(haversineKm(input.pickup, input.delivery) * 100) / 100;
  const driverFee = driverFeeFor(rule, distanceKm, deliveryPrice);

  return { zone, distanceKm, deliveryPrice, codFee, totalPrice, driverFee, overWeight: over };
}

/**
 * კურიერის ანაზღაურება ერთ მიტანაზე:
 *  1. ბაზისი + კმ-თარიფი (driverFreeKm-ის მერე) — ახალი მოდელი
 *  2. fallback: ფიქსირებული driverFlatFee
 *  3. fallback: შემოსავლის %
 */
export function driverFeeFor(
  rule: {
    driverBaseFee?: unknown;
    driverPerKm?: unknown;
    driverFreeKm?: unknown;
    driverFlatFee?: unknown;
    driverPayoutPercent?: number | null;
  },
  distanceKm: number,
  deliveryPrice: number,
): number {
  const base = n(rule.driverBaseFee);
  if (base > 0) {
    const freeKm = n(rule.driverFreeKm);
    const perKm = n(rule.driverPerKm);
    const billableKm = Math.max(0, distanceKm - freeKm);
    return Math.round((base + billableKm * perKm) * 100) / 100;
  }
  if (n(rule.driverFlatFee) > 0) return n(rule.driverFlatFee);
  return Math.round(deliveryPrice * ((rule.driverPayoutPercent ?? 70) / 100) * 100) / 100;
}

/** სავარაუდო მიტანის დრო ზონის წესის მიხედვით (თბილისის დროით) */
export async function estimateDelivery(zone: DeliveryZone, from = new Date()): Promise<Date> {
  const rule = await prisma.pricingRule.findUnique({ where: { zone } });
  const cutoff = rule?.sameDayCutoffHour ?? null;
  const days = rule?.deliveryDays ?? 1;

  // თბილისის დრო (UTC+4)
  const tb = new Date(from.getTime() + 4 * 3600 * 1000);
  const hour = tb.getUTCHours();

  let addDays = days;
  if (days === 0) {
    addDays = cutoff != null && hour < cutoff ? 0 : 1;
  }

  const target = new Date(from);
  target.setDate(target.getDate() + addDays);
  target.setHours(21, 0, 0, 0); // დღის ბოლომდე
  return target;
}
