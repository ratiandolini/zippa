import { prisma } from "@/lib/db";
import { ACTIVE_ORDER_STATUSES } from "@/lib/domain";

/** true — კურიერს აქვს მიმდინარე (დაუსრულებელი) შეკვეთა — lifecycle-ქმედება ბლოკავს */
export async function driverHasActiveOrders(driverId: string): Promise<boolean> {
  const count = await prisma.order.count({
    where: { driverId, status: { in: ACTIVE_ORDER_STATUSES } },
  });
  return count > 0;
}

export interface DriverHistoryBlocker {
  category: "orders" | "earnings" | "settlements" | "payouts" | "documents";
  label: string;
  count: number;
}

/**
 * permanent DELETE-ის წინაპირობა — ნებისმიერი (ისტორიული ჩათვლით) ჩანაწერი
 * ერთსაც ბლოკავს. ცარიელი მასივი = კურიერი ნამდვილად გამოუყენებელია.
 */
export async function getDriverHistoryBlockers(driverId: string): Promise<DriverHistoryBlocker[]> {
  const [orders, earnings, settlements, payouts, documents] = await Promise.all([
    prisma.order.count({ where: { driverId } }),
    prisma.driverEarning.count({ where: { driverId } }),
    prisma.cashSettlement.count({ where: { driverId } }),
    prisma.payout.count({ where: { driverId } }),
    prisma.driverDocument.count({ where: { driverVerification: { driverId } } }),
  ]);

  const blockers: DriverHistoryBlocker[] = [];
  if (orders > 0) blockers.push({ category: "orders", label: "შეკვეთები", count: orders });
  if (earnings > 0) blockers.push({ category: "earnings", label: "ანაზღაურებები", count: earnings });
  if (settlements > 0)
    blockers.push({ category: "settlements", label: "ნაღდის ჩაბარებები", count: settlements });
  if (payouts > 0) blockers.push({ category: "payouts", label: "გადახდები", count: payouts });
  if (documents > 0) blockers.push({ category: "documents", label: "დოკუმენტები", count: documents });
  return blockers;
}
