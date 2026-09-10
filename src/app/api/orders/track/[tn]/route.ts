import { prisma } from "@/lib/db";
import { handle, ok, fail, throttle } from "@/lib/api";
import { DELIVERY_ZONE_LABEL } from "@/lib/domain";

// საჯარო ტრეკინგი ნომრით — ავტორიზაციის გარეშე.
// მინიმალური, უსაფრთხო მონაცემები: არც მისამართი, არც კურიერი/ტელეფონი/GPS,
// არც ფასი/PIN, არც event note-ები ან კოორდინატები.
export function GET(req: Request, { params }: { params: { tn: string } }) {
  return handle(async () => {
    await throttle(req, "track", 60, 60); // 60 მოთხოვნა/წუთში თითო IP-ზე
    const order = await prisma.order.findUnique({
      where: { trackingNumber: params.tn.toUpperCase().trim() },
      select: {
        trackingNumber: true,
        status: true,
        kind: true,
        zone: true,
        createdAt: true,
        updatedAt: true,
        estimatedDeliveryAt: true,
        deliveredAt: true,
        events: {
          orderBy: { createdAt: "asc" },
          select: { status: true, createdAt: true },
        },
      },
    });
    if (!order) return fail(404, "ასეთი ტრეკინგ-ნომერი ვერ მოიძებნა");

    return ok({
      tracking: {
        trackingNumber: order.trackingNumber,
        status: order.status,
        kind: order.kind,
        area: DELIVERY_ZONE_LABEL[order.zone], // ზოგადი ზონა, არა ზუსტი მისამართი
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        estimatedDeliveryAt: order.estimatedDeliveryAt?.toISOString() ?? null,
        deliveredAt: order.deliveredAt?.toISOString() ?? null,
        // მხოლოდ სტატუსების თანმიმდევრობა დროით — note/კოორდინატების გარეშე
        steps: order.events.map((e) => ({ status: e.status, at: e.createdAt.toISOString() })),
      },
    });
  });
}
