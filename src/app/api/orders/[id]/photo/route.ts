import sharp from "sharp";
import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { putFile } from "@/lib/storage";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { notify } from "@/lib/notify";

const MAX_BYTES = 8 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const PHOTO_STATUSES = ["PICKED_UP", "IN_TRANSIT", "DELIVERED"];

export function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser();

    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");

    const isDispatcher = session.role === "DISPATCHER";
    let isOwnerDriver = false;
    if (session.role === "DRIVER") {
      const dp = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
      isOwnerDriver = !!dp && order.driverId === dp.id;
    }
    if (!isDispatcher && !isOwnerDriver) return fail(403, "წვდომა აკრძალულია");

    if (!PHOTO_STATUSES.includes(order.status)) {
      throw new ApiError(409, "ფოტოს დამატება მხოლოდ აღების შემდეგაა შესაძლებელი");
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(422, "ფაილი არ არის მიმაგრებული");
    if (file.size > MAX_BYTES) throw new ApiError(422, "ფაილი 8MB-ზე დიდია");
    if (file.type && !OK_TYPES.includes(file.type)) throw new ApiError(422, "მხოლოდ სურათია დაშვებული");

    const input = Buffer.from(await file.arrayBuffer());

    let jpeg: Buffer;
    try {
      jpeg = await sharp(input)
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 78 })
        .toBuffer();
    } catch {
      throw new ApiError(422, "სურათის დამუშავება ვერ მოხერხდა");
    }

    const key = `proofs/${order.id}-${Date.now()}.jpg`;
    const { url } = await putFile(key, jpeg, "image/jpeg");

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        proofPhotoUrl: url,
        events: {
          create: { status: order.status, note: "მიტანის ფოტო დაემატა", actorId: session.sub },
        },
      },
      include: orderInclude,
    });

    if (isOwnerDriver) {
      await notify(order.customerId, {
        title: "მიტანის ფოტო",
        body: `შეკვეთა ${order.trackingNumber} — კურიერმა ატვირთა ფოტო`,
        data: { orderId: order.id },
      });
    }

    return ok({ order: serializeOrder(updated) });
  });
}
