import { prisma } from "@/lib/db";
import { requireUser, handle, ok } from "@/lib/api";

export function GET() {
  return handle(async () => {
    await requireUser();
    const cities = await prisma.city.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, centerLat: true, centerLng: true },
    });
    return ok({ cities });
  });
}
