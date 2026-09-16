import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, throttle, ApiError } from "@/lib/api";
import { driverLifecycleActionSchema } from "@/lib/validation";
import {
  driverHasActiveOrders,
  getDriverHistoryBlockers,
  recordLifecycleTransition,
  type LifecycleTarget,
} from "@/lib/driver-lifecycle";

// დისპეჩერის მართული კურიერის lifecycle: SUSPEND/ARCHIVE/REACTIVATE/DELETE.
// ეს ცალკეა isApproved-გან (ვერიფიკაცია) და status-გან (ონლაინ/ოფლაინ) —
// ორივე უცვლელი რჩება ACTIVE კურიერისთვის.
export function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireRole("DISPATCHER");

    const driver = await prisma.driverProfile.findUnique({
      where: { id: params.id },
      select: { id: true, lifecycleStatus: true, isApproved: true },
    });
    if (!driver) return fail(404, "კურიერი ვერ მოიძებნა");

    const [events, hasActiveOrders, blockers] = await Promise.all([
      prisma.driverLifecycleEvent.findMany({
        where: { driverId: params.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      driverHasActiveOrders(driver.id),
      getDriverHistoryBlockers(driver.id),
    ]);

    return ok({
      lifecycleStatus: driver.lifecycleStatus,
      isApproved: driver.isApproved,
      hasActiveOrders,
      canDelete: blockers.length === 0 && !hasActiveOrders,
      blockers,
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  });
}

export function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    await throttle(req, "driver-lifecycle", 30, 60);
    const body = driverLifecycleActionSchema.parse(await req.json());

    const driver = await prisma.driverProfile.findUnique({
      where: { id: params.id },
      include: { user: { select: { name: true, phone: true } } },
    });
    if (!driver) return fail(404, "კურიერი ვერ მოიძებნა");

    // idempotent — უკვე იმ სტატუსში მდგომ კურიერზე იმავე action-ის გამოძახება 409-ს აბრუნებს
    const TARGET_STATUS: Record<string, string> = {
      SUSPEND: "SUSPENDED",
      ARCHIVE: "ARCHIVED",
      REACTIVATE: "ACTIVE",
    };
    if (body.action !== "DELETE" && TARGET_STATUS[body.action] === driver.lifecycleStatus) {
      return fail(409, `კურიერი უკვე ${TARGET_STATUS[body.action]}-ია`);
    }

    if (body.action === "SUSPEND" || body.action === "ARCHIVE" || body.action === "DELETE") {
      if (await driverHasActiveOrders(driver.id)) {
        throw new ApiError(
          409,
          "კურიერს აქვს მიმდინარე შეკვეთა — ჯერ გადაანაწილე ან დაასრულე, შემდეგ სცადე ხელახლა",
        );
      }
    }

    if (body.action === "REACTIVATE" && !driver.isApproved) {
      throw new ApiError(
        422,
        "აღდგენა შესაძლებელია მხოლოდ დამტკიცებული (ვერიფიცირებული) კურიერისთვის — ჯერ დაამტკიცე ვერიფიკაცია",
      );
    }

    if (body.action === "DELETE") {
      const blockers = await getDriverHistoryBlockers(driver.id);
      if (blockers.length > 0) {
        return fail(
          409,
          `წაშლა შეუძლებელია — კურიერს აქვს ისტორიული ჩანაწერები (${blockers
            .map((b) => `${b.label}: ${b.count}`)
            .join(", ")}). სამაგიეროდ დააარქივე.`,
        );
      }
    }

    if (body.action === "SUSPEND" || body.action === "ARCHIVE" || body.action === "REACTIVATE") {
      const target: LifecycleTarget = body.action === "REACTIVATE" ? "ACTIVE" : TARGET_STATUS[body.action] as LifecycleTarget;
      await prisma.$transaction((tx) =>
        recordLifecycleTransition(tx, {
          driverId: driver.id,
          userId: driver.userId,
          target,
          reason: body.reason,
          actorId: session.sub,
          driverNameSnapshot: driver.user.name,
          driverPhoneSnapshot: driver.user.phone,
        }),
      );
      return ok({ lifecycleStatus: target });
    }

    // DELETE — permanent. Event პირველად იწერება (driverId ჯერ კიდევ ვალიდურია),
    // შემდეგ User-ის წაშლა cascade-ით შლის DriverProfile/DriverVerification/
    // DriverDocument-ს (ყველა უკვე ცარიელია — ზემოთ blockers-ით დადასტურებული).
    // DriverLifecycleEvent.driverId → SetNull, snapshot ველები ვინაობას ინახავს.
    await prisma.$transaction([
      prisma.driverLifecycleEvent.create({
        data: {
          driverId: driver.id,
          actorId: session.sub,
          action: "DELETED",
          reason: body.reason,
          driverNameSnapshot: driver.user.name,
          driverPhoneSnapshot: driver.user.phone,
        },
      }),
      prisma.user.delete({ where: { id: driver.userId } }),
    ]);
    return ok({ lifecycleStatus: null, deleted: true });
  });
}
