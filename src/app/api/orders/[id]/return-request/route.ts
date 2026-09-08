import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, ApiError } from "@/lib/api";
import { notify, notifyDispatchers } from "@/lib/notify";

const schema = z.object({ reason: z.string().trim().min(3, "მიუთითე მიზეზი").max(500) });

// მომხმარებელი ითხოვს ამანათის დაბრუნებას — აღების შემდეგ, როცა გაუქმება აღარ შეიძლება
export function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireRole("CUSTOMER");
    const { reason } = schema.parse(await req.json());

    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (order.customerId !== session.sub) return fail(403, "წვდომა აკრძალულია");
    if (!["PICKED_UP", "IN_TRANSIT", "DELIVERED"].includes(order.status))
      throw new ApiError(409, "დაბრუნების მოთხოვნა შესაძლებელია მხოლოდ ამანათის აღების შემდეგ");
    if (order.returnRequestedAt) throw new ApiError(409, "დაბრუნება უკვე მოთხოვნილია");

    await prisma.order.update({
      where: { id: order.id },
      data: {
        returnRequestedAt: new Date(),
        returnReason: reason,
        events: {
          create: { status: order.status, note: `დაბრუნების მოთხოვნა: ${reason}`, actorId: session.sub },
        },
      },
    });

    await notifyDispatchers({
      type: "SYSTEM",
      title: "დაბრუნების მოთხოვნა",
      body: `${order.trackingNumber} — ${reason}`,
      data: { orderId: order.id },
      url: "/dispatch/orders",
    });

    return ok({ ok: true });
  });
}

// დისპეჩერი ნიშნავს დაბრუნების მოთხოვნას დამუშავებულად
export function PATCH(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail(404, "შეკვეთა ვერ მოიძებნა");
    if (!order.returnRequestedAt) throw new ApiError(409, "დაბრუნება მოთხოვნილი არ არის");

    await prisma.order.update({
      where: { id: order.id },
      data: {
        returnResolvedAt: new Date(),
        events: {
          create: { status: order.status, note: "დაბრუნების მოთხოვნა დამუშავდა", actorId: session.sub },
        },
      },
    });
    await notify(order.customerId, {
      title: "დაბრუნების მოთხოვნა დამუშავდა",
      body: `შეკვეთა ${order.trackingNumber}`,
      data: { orderId: order.id },
    });
    return ok({ ok: true });
  });
}
