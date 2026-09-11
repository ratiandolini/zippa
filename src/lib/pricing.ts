import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/geo";
import type { DeliveryZone, PaymentMethod } from "@prisma/client";

export interface WeightBracket {
  maxKg: number;
  price: number;
}

export interface DriverWeightBracket {
  maxKg: number;
  payout: number;
}

/** ზონა გამორთულია — quote/შეკვეთა უნდა უარყოს */
export class InactiveZoneError extends Error {
  constructor() {
    super("ამ მიმართულებით მომსახურება დროებით მიუწვდომელია.");
    this.name = "InactiveZoneError";
  }
}

/** ამ წონაზე ავტომატური დამუშავება არ ხდება — დისპეჩერი ხელით ადასტურებს */
export const MANUAL_REVIEW_WEIGHT_KG = 20;

export interface PriceInput {
  pickup: { lat: number; lng: number };
  delivery: { lat: number; lng: number };
  weightKg: number;
  paymentMethod: PaymentMethod;
  deliveryCityId?: string | null;
  /** თუ მითითებულია და მას აქვს APPROVED კომპანიის პროფილი აქტიური ტარიფით —
   *  deliveryPrice კომპანიის ტარიფით ჩანაცვლდება. undefined/customer-ის გარეშე —
   *  ცვლილება ნულოვანია, ძველი behavior ხელუხლებელი. */
  customerId?: string | null;
}

export interface PriceBreakdown {
  zone: DeliveryZone;
  distanceKm: number;
  deliveryPrice: number; // წონა-კალათის ფასი
  codFee: number;
  totalPrice: number;
  driverFee: number; // კურიერს ერგება ამ მიტანაზე
  partnerCost: number; // რეგიონული პარტნიორის ხარჯი
  companyMargin: number; // Zippa-ს მარჟა (COD საკომისიოს გარეშე)
  overWeight: boolean; // წონა ბოლო კალათას სცდება
  needsManualReview: boolean; // 20 კგ+ ან რთული — ავტო-მინიჭება იბლოკება
  /** გამოყენებული პარტნიორის ინდივიდუალური ტარიფის id, თუ ასეთი მოქმედებდა */
  companyPricingProfileId?: string;
}

/** APPROVED კომპანიის აქტიური ტარიფი customerId-ით (customerId = User.id, არა CompanyProfile.id) */
async function activeCompanyPricing(customerId: string | null | undefined) {
  if (!customerId) return null;
  const company = await prisma.companyProfile.findUnique({
    where: { ownerUserId: customerId },
    select: { id: true, status: true },
  });
  if (!company || company.status !== "APPROVED") return null;

  const now = new Date();
  const active = await prisma.companyPricingProfile.findFirst({
    where: {
      companyProfileId: company.id,
      active: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  return active;
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

/** კურიერის ანაზღაურება წონა-კალათიდან. null თუ ცხრილი არ არის განსაზღვრული. */
export function driverBracketPayout(
  brackets: DriverWeightBracket[] | null | undefined,
  weightKg: number,
): number | null {
  if (!Array.isArray(brackets) || brackets.length === 0) return null;
  const sorted = [...brackets].sort((a, b) => a.maxKg - b.maxKg);
  for (const b of sorted) if (weightKg <= b.maxKg) return b.payout;
  return sorted[sorted.length - 1]?.payout ?? null;
}

export async function calculatePrice(input: PriceInput): Promise<PriceBreakdown> {
  const zone = await resolveZone(input.deliveryCityId);
  const rule = await prisma.pricingRule.findUnique({ where: { zone } });
  if (!rule) throw new Error(`ტარიფის წესი ვერ მოიძებნა ზონისთვის ${zone}`);
  if (!rule.isActive) throw new InactiveZoneError();

  const brackets = (rule.weightBrackets as unknown as WeightBracket[]) ?? [];
  let { price: deliveryPrice, over } = bracketPrice(brackets, input.weightKg);

  // კომპანიის ინდივიდუალური ტარიფი — მხოლოდ APPROVED კომპანიაზე, deliveryPrice-ს ცვლის.
  // driverFee/partnerCost საჯარო წესიდან უცვლელი რჩება — ფასდაკლებას Zippa-ს მარჟა შთანთქავს.
  const companyPricing = await activeCompanyPricing(input.customerId);
  if (companyPricing) {
    if (companyPricing.pricingMode === "DISCOUNT_PERCENT" && companyPricing.discountPercent != null) {
      const pct = n(companyPricing.discountPercent);
      deliveryPrice = Math.round(deliveryPrice * (1 - pct / 100) * 100) / 100;
    } else if (companyPricing.pricingMode === "CUSTOM_RULES" && companyPricing.customRules) {
      const rules = companyPricing.customRules as unknown as Record<string, WeightBracket[]>;
      const zoneBrackets = rules[zone];
      if (Array.isArray(zoneBrackets) && zoneBrackets.length > 0) {
        const custom = bracketPrice(zoneBrackets, input.weightKg);
        deliveryPrice = custom.price;
        over = custom.over;
      }
    }
  }

  const codFee = input.paymentMethod === "CASH" ? n(rule.codFee) : 0;
  const totalPrice = Math.round((deliveryPrice + codFee) * 100) / 100;

  // სწორ ხაზზე მანძილი × გზის კოეფიციენტი ≈ ფაქტობრივი გავლილი მანძილი (ქუჩების გამო).
  // საკურიერო ინდუსტრიის სტანდარტული მიახლოება — ამცირებს კურიერთან დავებს კმ-ანაზღაურებაზე.
  const straightKm = haversineKm(input.pickup, input.delivery);
  const distanceKm = Math.round(straightKm * ROAD_FACTOR * 100) / 100;

  // კურიერის თანხა: ჯერ წონა-ცხრილი (თბილისის STANDARD), თორემ ბაზისი+კმ / fallback
  const bracketPayout = driverBracketPayout(
    rule.driverWeightBrackets as unknown as DriverWeightBracket[] | null,
    input.weightKg,
  );
  const driverFee =
    bracketPayout != null ? bracketPayout : driverFeeFor(rule, distanceKm, deliveryPrice);

  const partnerCost = n(rule.partnerCost);
  const companyMargin = Math.round((totalPrice - driverFee - partnerCost) * 100) / 100;
  const needsManualReview = over || input.weightKg > MANUAL_REVIEW_WEIGHT_KG;

  return {
    zone,
    distanceKm,
    deliveryPrice,
    codFee,
    totalPrice,
    driverFee,
    partnerCost,
    companyMargin,
    overWeight: over,
    needsManualReview,
    companyPricingProfileId: companyPricing?.id,
  };
}

/** სწორი ხაზი → ფაქტობრივი მარშრუტი (ქალაქის ქუჩების გამო) */
export const ROAD_FACTOR = 1.3;

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
