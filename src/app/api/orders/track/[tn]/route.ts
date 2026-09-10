import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { orderInclude, serializeOrder } from "@/lib/serialize";

// საჯარო ტრეკინგი ნომრით (მგრძნობიარე ველების გარეშე)
export function GET(_req: Request, { params }: { params: { tn: string } }) {
  return handle(async () => {
    const order = await prisma.order.findUnique({
      where: { trackingNumber: params.tn.toUpperCase().trim() },
      include: orderInclude,
    });
    if (!order) return fail(404, "ასეთი ტრეკინგ-ნომერი ვერ მოიძებნა");

    const full = serializeOrder(order, "CUSTOMER");
    return ok({
      tracking: {
        trackingNumber: full.trackingNumber,
        status: full.status,
        kind: full.kind,
        createdAt: full.createdAt,
        estimatedDeliveryAt: full.estimatedDeliveryAt,
        deliveredAt: full.deliveredAt,
        pickup: { address: full.pickup.address, lat: full.pickup.lat, lng: full.pickup.lng },
        delivery: {
          address: full.delivery.address,
          lat: full.delivery.lat,
          lng: full.delivery.lng,
        },
        driverName: full.driverName,
        driverLocation: full.driverLocation,
        events: full.events,
      },
    });
  });
}
