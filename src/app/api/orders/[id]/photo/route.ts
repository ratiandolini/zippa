import sharp from "sharp";
import { prisma } from "@/lib/db";
import { requireUser, handle, ok, fail, ApiError } from "@/lib/api";
import { putProofFile, getProofFile } from "@/lib/storage";
import { orderInclude, serializeOrder } from "@/lib/serialize";
import { notify } from "@/lib/notify";
import type { Order } from "@prisma/client";

const MAX_BYTES = 4 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
// ფოტოს ატვირთვა/შეცვლა მხოლოდ ამანათის აღების შემდეგ და ჩაბარებამდე.
// DELIVERED/CANCELLED/FAILED-ის შემდეგ ფოტო უცვლელი მტკიცებულებაა.
const PHOTO_STATUSES = ["PICKED_UP", "IN_TRANSIT"];

/** ვის აქვს ამ შეკვეთის ფოტოსთან წვდომა — დისპეჩერი, მფლობელი კლიენტი ან მიბმული კურიერი. */
async function canAccess(order: Order, sub: string, role: string): Promise<boolean> {
  if (role === "DISPATCHER") return true;
  if (role === "CUSTOMER") return order.customerId === sub;
  if (role === "DRIVER") {
    const dp = await prisma.driverProfile.findUnique({ where: { userId: sub } });
    return !!dp && order.driverId === dp.id;
  }
  return false;
}

// ── დაცული ფოტო-view: ავტ. + მფლობელობის შემოწმება, შემდეგ private blob-იდან proxy ──
export function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser();
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (!(await canAccess(order, session.sub, session.role)))
      return fail(403, "წვდომა აკრძალულია");
    if (!order.proofPhotoUrl) return fail(404, "ფოტო არ არის");

    const proof = await getProofFile(order.proofPhotoUrl);
    if (!proof) return fail(404, "ფოტო არ არის");

    return new Response(proof.body as BodyInit, {
      headers: {
        "content-type": proof.contentType,
        "cache-control": "private, max-age=60",
      },
    });
  });
}

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
      throw new ApiError(
        409,
        "ფოტოს ატვირთვა/შეცვლა მხოლოდ ამანათის აღების შემდეგ, ჩაბარებამდეა შესაძლებელი",
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(422, "ფაილი არ არის მიმაგრებული");
    if (file.size > MAX_BYTES) throw new ApiError(422, "ფოტო 4MB-ზე დიდია");
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
    let url: string;
    try {
      ({ url } = await putProofFile(key, jpeg, "image/jpeg"));
    } catch {
      // საცავი არ არის კონფიგურირებული / ჩავარდა — public-ზე fallback აკრძალულია
      throw new ApiError(503, "ფოტო-საცავი მიუწვდომელია — სცადე მოგვიანებით ან დაუკავშირდი დისპეჩერს");
    }

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

    return ok({ order: serializeOrder(updated, session.role) });
  });
}
