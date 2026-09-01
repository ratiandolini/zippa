import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, handle, ok } from "@/lib/api";

export function GET() {
  return handle(async () => {
    const session = await requireUser();
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: session.sub },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notification.count({ where: { userId: session.sub, isRead: false } }),
    ]);
    return ok({
      unread,
      notifications: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  });
}

const patchSchema = z.object({ id: z.string().cuid().optional() });

export function PATCH(req: Request) {
  return handle(async () => {
    const session = await requireUser();
    const { id } = patchSchema.parse(await req.json().catch(() => ({})));
    await prisma.notification.updateMany({
      where: { userId: session.sub, ...(id ? { id } : {}), isRead: false },
      data: { isRead: true },
    });
    return ok({ ok: true });
  });
}
