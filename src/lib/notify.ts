import { prisma } from "@/lib/db";
import type { NotificationType, Prisma } from "@prisma/client";
import { sendPush } from "@/lib/push";

interface NotifyInput {
  type?: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  /** push-ის დაჭერაზე გასახსნელი გვერდი (ნაგულისხმევი — როლის მთავარი) */
  url?: string;
}

function pushUrl(n: NotifyInput): string | undefined {
  if (n.url) return n.url;
  const d = n.data as { orderId?: string; settlementId?: string } | undefined;
  if (d?.orderId) return `/app/track?id=${d.orderId}`;
  return undefined;
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
  void sendPush(userId, { title: n.title, body: n.body, url: pushUrl(n) }).catch(() => {});
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
  for (const d of dispatchers) {
    void sendPush(d.id, {
      title: n.title,
      body: n.body,
      url: n.url ?? "/dispatch/orders",
    }).catch(() => {});
  }
}

/** კურიერის პროფილის id-დან user-ს */
export async function notifyDriver(driverProfileId: string, n: NotifyInput) {
  const dp = await prisma.driverProfile.findUnique({
    where: { id: driverProfileId },
    select: { userId: true },
  });
  if (dp) await notify(dp.userId, { ...n, url: n.url ?? "/driver" });
}
