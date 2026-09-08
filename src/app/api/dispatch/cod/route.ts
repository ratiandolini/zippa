import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, handle, ok, ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { GEL } from "@/lib/domain";

// გამგზავნები, რომლებსაც COD ერგებათ (ჩაბარებული, ჯერ არ გადარიცხული)
export function GET() {
  return handle(async () => {
    await requireRole("DISPATCHER");

    const orders = await prisma.order.findMany({
      where: {
        status: "DELIVERED",
        collectAmount: { gt: 0 },
        codRemittanceId: null,
      },
      select: {
        id: true,
        customerId: true,
        trackingNumber: true,
        collectAmount: true,
        codCommission: true,
        deliveredAt: true,
        customer: { select: { name: true, phone: true } },
      },
      orderBy: { deliveredAt: "asc" },
    });

    const byCustomer = new Map<
      string,
      { customerId: string; name: string; phone: string; gross: number; commission: number; count: number; oldest: string | null }
    >();
    for (const o of orders) {
      const g = byCustomer.get(o.customerId) ?? {
        customerId: o.customerId,
        name: o.customer.name,
        phone: o.customer.phone,
        gross: 0,
        commission: 0,
        count: 0,
        oldest: o.deliveredAt?.toISOString() ?? null,
      };
      g.gross += Number(o.collectAmount);
      g.commission += Number(o.codCommission);
      g.count++;
      byCustomer.set(o.customerId, g);
    }

    const rows = [...byCustomer.values()].map((g) => ({
      ...g,
      gross: Math.round(g.gross * 100) / 100,
      commission: Math.round(g.commission * 100) / 100,
      net: Math.round((g.gross - g.commission) * 100) / 100,
    }));

    const recent = await prisma.codRemittance.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { customer: { select: { name: true } } },
    });

    return ok({
      outstanding: rows.sort((a, b) => b.net - a.net),
      history: recent.map((r) => ({
        id: r.id,
        customerName: r.customer.name,
        gross: Number(r.grossAmount),
        commission: Number(r.commission),
        net: Number(r.netAmount),
        orderCount: r.orderCount,
        method: r.method,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });
}

const paySchema = z.object({
  customerId: z.string().cuid(),
  method: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
});

// გამგზავნისთვის COD-ის გადარიცხვა — ჯამავს ყველა შესაბამის შეკვეთას
export function POST(req: Request) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    const { customerId, method, note } = paySchema.parse(await req.json());

    const orders = await prisma.order.findMany({
      where: {
        customerId,
        status: "DELIVERED",
        collectAmount: { gt: 0 },
        codRemittanceId: null,
      },
      select: { id: true, collectAmount: true, codCommission: true },
    });
    if (orders.length === 0) throw new ApiError(400, "გადასარიცხი COD არ არის");

    const gross = Math.round(orders.reduce((s, o) => s + Number(o.collectAmount), 0) * 100) / 100;
    const commission = Math.round(orders.reduce((s, o) => s + Number(o.codCommission), 0) * 100) / 100;
    const net = Math.round((gross - commission) * 100) / 100;

    const rem = await prisma.$transaction(async (tx) => {
      const r = await tx.codRemittance.create({
        data: {
          customerId,
          grossAmount: gross,
          commission,
          netAmount: net,
          orderCount: orders.length,
          method,
          note,
          createdById: session.sub,
        },
      });
      await tx.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) } },
        data: { codRemittanceId: r.id },
      });
      return r;
    });

    await notify(customerId, {
      type: "PAYMENT",
      title: "COD გადმოგერიცხათ",
      body: `${GEL(net)} (${orders.length} შეკვეთა, საკომისიო ${GEL(commission)})${method ? ` · ${method}` : ""}`,
      data: { remittanceId: rem.id },
    });

    return ok({ ok: true, net });
  });
}
