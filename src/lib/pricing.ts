import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/geo";
import type { DeliveryZone, PaymentMethod } from "@prisma/client";
import { RETAIL_PRICE_MARKUP_ENABLED, RETAIL_PRICE_MARKUP_GEL } from "@/lib/flags";

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
  /** შეკვეთის/quote-ის მფლობელი CUSTOMER-ის id (არა inициаторის/დისპეჩერის) — ბაზიდან
   *  ეამოწმება, აქვს თუ არა APPROVED CompanyProfile. undefined/customer-ის გარეშე ან
   *  RETAIL_PRICE_MARKUP_ENABLED=false — ცვლილება ნულოვანია, ძველი behavior ხელუხლებელი. */
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
  /** RETAIL — ჩვეულებრივი მომხმარებელი (+markup, თუ flag ჩართულია); PARTNER — APPROVED კომპანია (მოქმედი საბაზო ტარიფი, markup-ის გარეშე) */
  priceCategory: "RETAIL" | "PARTNER";
}

/**
 * მხოლოდ ორი კატეგორია: APPROVED CompanyProfile → PARTNER (მოქმედი საბაზო ტარიფი),
 * ყველა სხვა (DRAFT/SUBMITTED/CHANGES_REQUESTED/REJECTED/SUSPENDED/პროფილის გარეშე) → RETAIL.
 * CompanyPricingProfile (pricingMode/discountPercent/customRules) აქ განზრახ არ იკითხება —
 * ძველი onboarding-ის რთული ტარიფის მექანიზმი disabled-ია, მოდელი/მონაცემები არ წაშლილა.
 */
async function isApprovedPartner(customerId: string | null | undefined): Promise<boolean> {
  if (!customerId) return false;
  const company = await prisma.companyProfile.findUnique({
    where: { ownerUserId: customerId },
    select: { status: true },
  });
  return company?.status === "APPROVED";
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
  const { price: companyDeliveryPrice, over } = bracketPrice(brackets, input.weightKg);

  // ორი კატეგორია: APPROVED პარტნიორი კომპანია → მოქმედი საბაზო ტარიფი (markup-ის გარეშე).
  // ყველა სხვა (ჩვეულებრივი CUSTOMER, ან ჯერ არ დამტკიცებული კომპანია) → +RETAIL_PRICE_MARKUP_GEL,
  // ერთხელ, მთლიან deliveryPrice-ზე (არა კგ/ზონა/collectAmount-ზე) — Decimal, არა float.
  const partner = await isApprovedPartner(input.customerId);
  const deliveryPrice =
    !partner && RETAIL_PRICE_MARKUP_ENABLED
      ? new Prisma.Decimal(companyDeliveryPrice)
          .plus(new Prisma.Decimal(RETAIL_PRICE_MARKUP_GEL))
          .toDecimalPlaces(2)
          .toNumber()
      : companyDeliveryPrice;
  const priceCategory: "RETAIL" | "PARTNER" = partner ? "PARTNER" : "RETAIL";

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
    priceCategory,
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
