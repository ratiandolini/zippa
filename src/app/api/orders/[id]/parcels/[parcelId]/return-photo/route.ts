import { prisma } from "@/lib/db";
import { requireUser, handle, fail } from "@/lib/api";
import { getProofFile } from "@/lib/storage";
import type { Order } from "@prisma/client";

/** ვის აქვს ამანათის დაბრუნების ფოტოსთან წვდომა — დისპეჩერი, მფლობელი კლიენტი ან მიბმული კურიერი. */
async function canAccess(order: Order, sub: string, role: string): Promise<boolean> {
  if (role === "DISPATCHER") return true;
  if (role === "CUSTOMER") return order.customerId === sub;
  if (role === "DRIVER") {
    const dp = await prisma.driverProfile.findUnique({ where: { userId: sub } });
    return !!dp && order.driverId === dp.id;
  }
  return false;
}

// დაცული view — დაბრუნების მტკიცებულების ფოტო (private blob-იდან proxy),
// იმ ხედვის წესებით, რაც ჩაბარების ფოტოზეც მოქმედებს ([id]/photo).
export function GET(
  _req: Request,
  { params }: { params: { id: string; parcelId: string } },
) {
  return handle(async () => {
    const session = await requireUser();
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (!(await canAccess(order, session.sub, session.role)))
      return fail(403, "წვდომა აკრძალულია");

    const parcel = await prisma.orderParcel.findUnique({ where: { id: params.parcelId } });
    if (!parcel || parcel.orderId !== order.id) return fail(404, "ამანათი ვერ მოიძებნა");
    if (!parcel.returnProofPhotoUrl) return fail(404, "ფოტო არ არის");

    const proof = await getProofFile(parcel.returnProofPhotoUrl);
    if (!proof) return fail(404, "ფოტო არ არის");

    return new Response(proof.body as BodyInit, {
      headers: {
        "content-type": proof.contentType,
        "cache-control": "private, max-age=60",
      },
    });
  });
}
