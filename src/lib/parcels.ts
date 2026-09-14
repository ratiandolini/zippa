import type { OrderFailureReason, Prisma } from "@prisma/client";

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

/**
 * Audit fix (B3) — დისპეჩერის ფასის ცვლილების შემდეგ თითო OrderParcel-ის
 * ალოკაცია (allocatedDeliveryPrice/allocatedDriverFee/codAmount) ხელახლა
 * ითვლება, რომ ჯამი ყოველთვის ზუსტად ორდერის ახალ totalPrice-ს/collectAmount-ს
 * უტოლდებოდეს. მხოლოდ იქ გამოსაძახია, სადაც წინასწარ დამტკიცებულია, რომ
 * ყველა ამანათი კვლავ PENDING-ია (pickup-ის დაწყებამდე) — status/route.ts-ის
 * გამომძახებელი ამას ცალკე ამოწმებს.
 */
export async function reallocateParcels(
  tx: Prisma.TransactionClient,
  parcels: { id: string }[],
  totals: { deliveryPrice: number; driverFee: number; collectAmount: number },
): Promise<void> {
  const n = parcels.length;
  if (n === 0) return;
  const deliveryShares = splitEvenly(totals.deliveryPrice, n);
  const driverShares = splitEvenly(totals.driverFee, n);
  const codShares = splitEvenly(totals.collectAmount, n);
  for (let i = 0; i < n; i++) {
    await tx.orderParcel.update({
      where: { id: parcels[i].id },
      data: {
        allocatedDeliveryPrice: deliveryShares[i],
        allocatedDriverFee: driverShares[i],
        codAmount: codShares[i],
      },
    });
  }
}

// Phase 2 fix — ჩაბარების ეტაპზე ვერ-ჩაბარებული ამანათი ფიზიკურად კურიერთანვე
// რჩება მიზეზის მიუხედავად (უარი/ვერ დაუკავშირდნენ/დაბრუნება/სხვა) — ამიტომ
// ყველა შემთხვევაში სტატუსი ერთია: RETURN_REQUESTED. კონკრეტული მიზეზი მხოლოდ
// failureReason-შია. დაბრუნება საბოლოოდ დახურულად ითვლება მხოლოდ მას შემდეგ,
// რაც კურიერი/დისპეჩერი /parcels/return-confirm-ით ცალკე დაადასტურებს.
export const DELIVERY_REASON_TO_FAILURE: Record<string, OrderFailureReason> = {
  RECIPIENT_REFUSED: "RECIPIENT_REFUSED",
  RECIPIENT_UNAVAILABLE: "RECIPIENT_UNAVAILABLE",
  RETURN: "RETURN",
  OTHER: "OTHER",
};
