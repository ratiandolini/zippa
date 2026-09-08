import { prisma } from "@/lib/db";
import { requireUser, handle, ok } from "@/lib/api";
import { compactAddress } from "@/lib/geo";

interface Contact {
  name: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  count: number;
}

/**
 * მომხმარებლის ხშირად გამოყენებული გამგზავნები / მიმღებები —
 * მისი ბოლო შეკვეთებიდან. ახალი შეკვეთის ავტოშევსებისთვის.
 */
export function GET() {
  return handle(async () => {
    const session = await requireUser();

    const orders = await prisma.order.findMany({
      where: { customerId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        senderName: true,
        senderPhone: true,
        pickupAddress: true,
        pickupLat: true,
        pickupLng: true,
        recipientName: true,
        recipientPhone: true,
        deliveryAddress: true,
        deliveryLat: true,
        deliveryLng: true,
      },
    });

    const roll = (
      rows: { name: string; phone: string; address: string; lat: number; lng: number }[],
    ): Contact[] => {
      const map = new Map<string, Contact>();
      for (const r of rows) {
        const key = `${r.name.trim().toLowerCase()}|${r.phone.replace(/\D/g, "").slice(-9)}`;
        const ex = map.get(key);
        if (ex) {
          ex.count++;
          if (!ex.lat && r.lat) {
            ex.address = compactAddress(r.address);
            ex.lat = r.lat;
            ex.lng = r.lng;
          }
        } else {
          map.set(key, {
            name: r.name,
            phone: r.phone,
            address: compactAddress(r.address),
            lat: r.lat ?? null,
            lng: r.lng ?? null,
            count: 1,
          });
        }
      }
      return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
    };

    return ok({
      senders: roll(
        orders.map((o) => ({
          name: o.senderName,
          phone: o.senderPhone,
          address: o.pickupAddress,
          lat: o.pickupLat,
          lng: o.pickupLng,
        })),
      ),
      recipients: roll(
        orders.map((o) => ({
          name: o.recipientName,
          phone: o.recipientPhone,
          address: o.deliveryAddress,
          lat: o.deliveryLat,
          lng: o.deliveryLng,
        })),
      ),
    });
  });
}
