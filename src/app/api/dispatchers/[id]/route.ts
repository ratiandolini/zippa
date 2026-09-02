import { prisma } from "@/lib/db";
import { requireRole, handle, ok, ApiError } from "@/lib/api";
import { updateDispatcherSchema } from "@/lib/validation";

export function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    const data = updateDispatcherSchema.parse(await req.json());

    if (params.id === session.sub) {
      throw new ApiError(400, "საკუთარი ანგარიშის დეაქტივაცია არ შეიძლება");
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { role: true },
    });
    if (!target || target.role !== "DISPATCHER") throw new ApiError(404, "დისპეჩერი ვერ მოიძებნა");

    if (!data.isActive) {
      const activeCount = await prisma.user.count({
        where: { role: "DISPATCHER", isActive: true },
      });
      if (activeCount <= 1) throw new ApiError(400, "ბოლო აქტიური დისპეჩერის დეაქტივაცია არ შეიძლება");
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: { isActive: data.isActive },
      select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true },
    });
    return ok({ dispatcher: { ...user, createdAt: user.createdAt.toISOString() } });
  });
}
