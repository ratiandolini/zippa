import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, handle, ok } from "@/lib/api";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(200) }),
});

export function POST(req: Request) {
  return handle(async () => {
    const session = await requireUser();
    const { endpoint, keys } = schema.parse(await req.json());
    const ua = req.headers.get("user-agent")?.slice(0, 200) ?? null;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: session.sub, endpoint, p256dh: keys.p256dh, auth: keys.auth, ua },
      update: { userId: session.sub, p256dh: keys.p256dh, auth: keys.auth, ua },
    });
    return ok({ ok: true });
  });
}

const delSchema = z.object({ endpoint: z.string().url().max(1000) });

export function DELETE(req: Request) {
  return handle(async () => {
    await requireUser();
    const { endpoint } = delSchema.parse(await req.json());
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return ok({ ok: true });
  });
}
