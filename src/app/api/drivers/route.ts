import { prisma } from "@/lib/db";
import { requireRole, handle, ok } from "@/lib/api";
import { haversineKm } from "@/lib/geo";

export function GET(req: Request) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const url = new URL(req.url);
    const nearLat = url.searchParams.get("lat");
    const nearLng = url.searchParams.get("lng");
    const onlyAvailable = url.searchParams.get("available") === "1";
    const pending = url.searchParams.get("pending") === "1";

    const drivers = await prisma.driverProfile.findMany({
      where: pending
        ? { isApproved: false }
        : { isApproved: true, ...(onlyAvailable ? { status: "AVAILABLE" } : {}) },
      include: { user: { select: { name: true, phone: true } }, city: { select: { name: true } } },
      orderBy: pending ? { createdAt: "asc" } : { ratingAvg: "desc" },
    });

    let list = drivers.map((d) => ({
      id: d.id,
      name: d.user.name,
      phone: d.user.phone,
      vehicleType: d.vehicleType,
      vehicleNumber: d.vehicleNumber,
      isApproved: d.isApproved,
      status: d.status,
      city: d.city?.name ?? null,
      rating: d.ratingAvg,
      ratingCount: d.ratingCount,
      totalDeliveries: d.totalDeliveries,
      location:
        d.currentLat != null && d.currentLng != null
          ? { lat: d.currentLat, lng: d.currentLng }
          : null,
      cashOnHand: Number(d.cashOnHand),
      unpaidEarnings: Number(d.unpaidEarnings),
      distanceKm: null as number | null,
    }));

    if (nearLat && nearLng) {
      const pt = { lat: parseFloat(nearLat), lng: parseFloat(nearLng) };
      list = list
        .map((d) => ({
          ...d,
          distanceKm: d.location
            ? Math.round(haversineKm(pt, d.location) * 10) / 10
            : null,
        }))
        .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    }

    return ok({ drivers: list });
  });
}
