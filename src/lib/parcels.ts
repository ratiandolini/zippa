import type { OrderFailureReason, ParcelStatus } from "@prisma/client";

/** ორნიშნა დამრგვალება Decimal-თან თანმიმდევრული float-არითმეტიკისთვის */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * ჯამის თანაბარი გაყოფა N ნაწილად ისე, რომ ჯამი ზუსტად დარჩეს უცვლელი —
 * დამრგვალების ნაშთი ბოლო ნაწილს ემატება. გამოიყენება Order.deliveryPrice/
 * driverFee/collectAmount-ის თითო OrderParcel-ზე ალოკაციისთვის შექმნისას.
 */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor((total / count) * 100) / 100;
  const amounts = Array(count).fill(base) as number[];
  const distributed = round2(base * count);
  const remainder = round2(total - distributed);
  amounts[count - 1] = round2(amounts[count - 1] + remainder);
  return amounts;
}

// Phase 2 — ჩაბარების ეტაპზე ვერ-ჩაბარებული ამანათის მიზეზი → ParcelStatus/failureReason
export const DELIVERY_REASON_TO_STATUS: Record<string, ParcelStatus> = {
  RECIPIENT_REFUSED: "REFUSED",
  RECIPIENT_UNAVAILABLE: "FAILED",
  RETURN: "RETURN_REQUESTED",
  OTHER: "FAILED",
};

export const DELIVERY_REASON_TO_FAILURE: Record<string, OrderFailureReason> = {
  RECIPIENT_REFUSED: "RECIPIENT_REFUSED",
  RECIPIENT_UNAVAILABLE: "RECIPIENT_UNAVAILABLE",
  RETURN: "RETURN",
  OTHER: "OTHER",
};
