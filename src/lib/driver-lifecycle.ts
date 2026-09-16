import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ACTIVE_ORDER_STATUSES } from "@/lib/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export type LifecycleTarget = "SUSPENDED" | "ARCHIVED" | "ACTIVE";
const EVENT_ACTION: Record<LifecycleTarget, string> = {
  SUSPENDED: "SUSPENDED",
  ARCHIVED: "ARCHIVED",
  ACTIVE: "REACTIVATED",
};

/**
 * ერთადერთი წერტილი, სადაც lifecycleStatus იცვლება — user.isActive/tokenVersion-ის
 * (login-ბლოკი + სესიის მოკვდინება getSession()-ის მეშვეობით) და DriverLifecycleEvent
 * აუდიტის ჩანაწერთან ერთად, ატომურად. ნებისმიერი მომხმარებელი ამ ფუნქციაზე უნდა
 * გადიოდეს — legacy DELETE-ის ჩათვლით — რომ აუდიტი/mandatory reason/სესია-კვდომა
 * არსად არ გამოტოვდეს.
 */
export async function recordLifecycleTransition(
  db: Db,
  args: {
    driverId: string;
    userId: string;
    target: LifecycleTarget;
    reason: string;
    actorId?: string;
    driverNameSnapshot: string;
    driverPhoneSnapshot: string;
    /** დამატებითი DriverProfile ველები ერთსა და იმავე update-ში (მაგ. status/unpaidEarnings legacy-დან) */
    extraProfileData?: Prisma.DriverProfileUpdateInput;
  },
) {
  await db.driverProfile.update({
    where: { id: args.driverId },
    data: { lifecycleStatus: args.target, ...args.extraProfileData },
  });
  await db.user.update({
    where: { id: args.userId },
    data:
      args.target === "ACTIVE"
        ? { isActive: true }
        : { isActive: false, tokenVersion: { increment: 1 } },
  });
  await db.driverLifecycleEvent.create({
    data: {
      driverId: args.driverId,
      actorId: args.actorId,
      action: EVENT_ACTION[args.target],
      reason: args.reason,
      driverNameSnapshot: args.driverNameSnapshot,
      driverPhoneSnapshot: args.driverPhoneSnapshot,
    },
  });
}

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
