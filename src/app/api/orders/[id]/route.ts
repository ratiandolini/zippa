import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail } from "@/lib/api";
import { orderInclude, serializeOrder } from "@/lib/serialize";

export function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser();
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: orderInclude,
    });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");

    if (session.role === "CUSTOMER" && order.customerId !== session.sub)
      return fail(403, "წვდომა აკრძალულია");
    if (session.role === "DRIVER") {
      const dp = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
      if (order.driverId !== dp?.id) return fail(403, "წვდომა აკრძალულია");
    }

    return ok({ order: serializeOrder(order) });
  });
}
