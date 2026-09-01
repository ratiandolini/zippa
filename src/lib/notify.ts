import { prisma } from "@/lib/db";
import type { NotificationType, Prisma } from "@prisma/client";

interface NotifyInput {
  type?: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

/** ერთ მომხმარებელს */
export async function notify(userId: string, n: NotifyInput) {
  try {
    await prisma.notification.create({
      data: { userId, type: n.type ?? "ORDER", title: n.title, body: n.body, data: n.data },
    });
  } catch (e) {
    console.error("[notify]", e);
  }
}

/** ყველა დისპეჩერს */
export async function notifyDispatchers(n: NotifyInput) {
  const dispatchers = await prisma.user.findMany({
    where: { role: "DISPATCHER", isActive: true },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: dispatchers.map((d) => ({
      userId: d.id,
      type: n.type ?? "ORDER",
      title: n.title,
      body: n.body,
      data: n.data,
    })),
  });
}

/** კურიერის პროფილის id-დან user-ს */
export async function notifyDriver(driverProfileId: string, n: NotifyInput) {
  const dp = await prisma.driverProfile.findUnique({
    where: { id: driverProfileId },
    select: { userId: true },
  });
  if (dp) await notify(dp.userId, n);
}
