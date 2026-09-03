import { prisma } from "@/lib/db";
import { notifyDispatchers } from "@/lib/notify";
import { streetOf } from "@/lib/domain";

// რამდენ წამში ითვლება მიბმა უპასუხოდ
export const ASSIGN_TIMEOUT_SEC = 90;

/**
 * აბრუნებს „მოლოდინში" იმ შეკვეთებს, რომლებზეც კურიერმა ASSIGN_TIMEOUT_SEC წამში არ უპასუხა.
 * გამოიძახება opportunistically (შეკვეთების სიის წამოღებისას) და cron-იდან.
 */
export async function expireStaleAssignments(): Promise<number> {
  const cutoff = new Date(Date.now() - ASSIGN_TIMEOUT_SEC * 1000);
  const stale = await prisma.order.findMany({
    where: { status: "ASSIGNED", assignedAt: { lt: cutoff } },
    select: { id: true, trackingNumber: true, pickupAddress: true, driverId: true },
  });
  if (stale.length === 0) return 0;

  for (const o of stale) {
    await prisma.$transaction(async (tx) => {
      const cur = await tx.order.findUnique({ where: { id: o.id }, select: { status: true } });
      if (cur?.status !== "ASSIGNED") return; // ამასობაში შეიცვალა
      await tx.order.update({
        where: { id: o.id },
        data: {
          status: "PENDING",
          driverId: null,
          assignedAt: null,
          events: { create: { status: "PENDING", note: "კურიერმა არ უპასუხა — ხელახლა მიბმა საჭიროა" } },
        },
      });
      if (o.driverId) {
        await tx.driverProfile.update({
          where: { id: o.driverId },
          data: { status: "AVAILABLE" },
        });
      }
    });

    await notifyDispatchers({
      title: "კურიერმა არ უპასუხა",
      body: `${o.trackingNumber} — ${streetOf(o.pickupAddress)} · ხელახლა მიაბით`,
      data: { orderId: o.id },
    });
  }
  return stale.length;
}
