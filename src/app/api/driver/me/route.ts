import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail } from "@/lib/api";

async function profile(userId: string) {
  return prisma.driverProfile.findUnique({
    where: { userId },
    include: { city: { select: { name: true } } },
  });
}

function dto(d: NonNullable<Awaited<ReturnType<typeof profile>>>) {
  return {
    id: d.id,
    status: d.status,
    isApproved: d.isApproved,
    vehicleType: d.vehicleType,
    vehicleNumber: d.vehicleNumber,
    city: d.city?.name ?? null,
    rating: d.ratingAvg,
    totalDeliveries: d.totalDeliveries,
    cashOnHand: Number(d.cashOnHand),
    unpaidEarnings: Number(d.unpaidEarnings),
    location:
      d.currentLat != null && d.currentLng != null
        ? { lat: d.currentLat, lng: d.currentLng }
        : null,
  };
}

export function GET() {
  return handle(async () => {
    const session = await requireRole("DRIVER");
    const d = await profile(session.sub);
    if (!d) return fail(404, "კურიერის პროფილი ვერ მოიძებნა");
    return ok({ driver: dto(d) });
  });
}

const patchSchema = z.object({
  status: z.enum(["AVAILABLE", "OFFLINE"]).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  vehicleType: z.enum(["BIKE", "MOTORCYCLE", "CAR", "VAN"]).optional(),
  vehicleNumber: z.string().trim().max(20).optional(),
});

export function PATCH(req: Request) {
  return handle(async () => {
    const session = await requireRole("DRIVER");
    const body = patchSchema.parse(await req.json());
    const current = await profile(session.sub);
    if (!current) return fail(404, "პროფილი ვერ მოიძებნა");

    const d = await prisma.driverProfile.update({
      where: { userId: session.sub },
      data: {
        // BUSY-ს ხელით ვერ შეცვლის — ის შეკვეთის ლოგიკიდან იმართება
        ...(body.status && current.status !== "BUSY" ? { status: body.status } : {}),
        ...(body.lat != null && body.lng != null
          ? { currentLat: body.lat, currentLng: body.lng, locationUpdatedAt: new Date() }
          : {}),
        ...(body.vehicleType ? { vehicleType: body.vehicleType } : {}),
        ...(body.vehicleNumber !== undefined ? { vehicleNumber: body.vehicleNumber } : {}),
      },
      include: { city: { select: { name: true } } },
    });
    return ok({ driver: dto(d) });
  });
}
