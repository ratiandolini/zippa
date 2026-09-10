import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, handle, ok, ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { GEL } from "@/lib/domain";

const n = (v: unknown) => Number(v);

// გამგზავნებთან ანგარიშსწორება: მიღებული COD მინუს საკომისიო მინუს დავალიანება (returnFee + cancelFee)
export function GET() {
  return handle(async () => {
    await requireRole("DISPATCHER");

    // COD-ის მქონე ჩაბარებული, ჯერ არ გადარიცხული შეკვეთები
    const codOrders = await prisma.order.findMany({
      where: { status: "DELIVERED", collectAmount: { gt: 0 }, codRemittanceId: null },
      select: {
        customerId: true,
        collectAmount: true,
        codCommission: true,
        deliveredAt: true,
        customer: { select: { name: true, phone: true } },
      },
    });

    // დაუფარავი დავალიანება (ნებისმიერი სტატუსი)
    const chargeOrders = await prisma.order.findMany({
      where: { chargeSettledAt: null, OR: [{ returnFee: { gt: 0 } }, { cancelFee: { gt: 0 } }] },
      select: {
        customerId: true,
        returnFee: true,
        cancelFee: true,
        customer: { select: { name: true, phone: true } },
      },
    });

    // დისპეჩერის მიერ დარიცხული ანაზღაურება (ჯერ არ გადახდილი)
    const credits = await prisma.customerAdjustment.findMany({
      where: { settledAt: null },
      select: { customerId: true, amount: true, customer: { select: { name: true, phone: true } } },
    });

    type Row = {
      customerId: string;
      name: string;
      phone: string;
      gross: number;
      commission: number;
      charges: number;
      credits: number;
      count: number;
      oldest: string | null;
    };
    const map = new Map<string, Row>();
    const get = (id: string, name: string, phone: string): Row => {
      let r = map.get(id);
      if (!r) {
        r = { customerId: id, name, phone, gross: 0, commission: 0, charges: 0, credits: 0, count: 0, oldest: null };
        map.set(id, r);
      }
      return r;
    };

    for (const o of codOrders) {
      const r = get(o.customerId, o.customer.name, o.customer.phone);
      r.gross += n(o.collectAmount);
      r.commission += n(o.codCommission);
      r.count++;
      const d = o.deliveredAt?.toISOString() ?? null;
      if (d && (!r.oldest || d < r.oldest)) r.oldest = d;
    }
    for (const o of chargeOrders) {
      const r = get(o.customerId, o.customer.name, o.customer.phone);
      r.charges += n(o.returnFee) + n(o.cancelFee);
    }
    for (const a of credits) {
      const r = get(a.customerId, a.customer.name, a.customer.phone);
      r.credits += n(a.amount);
    }

    const rows = [...map.values()].map((r) => ({
      ...r,
      gross: Math.round(r.gross * 100) / 100,
      commission: Math.round(r.commission * 100) / 100,
      charges: Math.round(r.charges * 100) / 100,
      credits: Math.round(r.credits * 100) / 100,
      net: Math.round((r.gross - r.commission - r.charges + r.credits) * 100) / 100,
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
        gross: n(r.grossAmount),
        commission: n(r.commission),
        charges: n(r.chargesDeducted),
        credits: n(r.creditsAdded),
        net: n(r.netAmount),
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

export function POST(req: Request) {
  return handle(async () => {
    const session = await requireRole("DISPATCHER");
    const { customerId, method, note } = paySchema.parse(await req.json());

    // ── მთელი ანგარიშსწორება ერთ ტრანზაქციაში: მონაცემებს ვკითხულობთ და ვნიშნავთ
    //    ატომურად. თუ პარალელურმა request-მა ისინი უკვე „დაიჭირა", updateMany-ს
    //    count აღარ დაემთხვევა და მთელი ტრანზაქცია გაუქმდება (409) —
    //    ორმაგი remittance / ორმაგი chargeSettled ვერ შეიქმნება. ──
    const rem = await prisma.$transaction(async (tx) => {
      const codOrders = await tx.order.findMany({
        where: { customerId, status: "DELIVERED", collectAmount: { gt: 0 }, codRemittanceId: null },
        select: { id: true, collectAmount: true, codCommission: true },
      });
      const chargeOrders = await tx.order.findMany({
        where: {
          customerId,
          chargeSettledAt: null,
          OR: [{ returnFee: { gt: 0 } }, { cancelFee: { gt: 0 } }],
        },
        select: { id: true, returnFee: true, cancelFee: true },
      });
      const creditRows = await tx.customerAdjustment.findMany({
        where: { customerId, settledAt: null },
        select: { id: true, amount: true },
      });
      if (codOrders.length === 0 && chargeOrders.length === 0 && creditRows.length === 0)
        throw new ApiError(400, "ამ გამგზავნთან გასასწორებელი არაფერია");

      const gross = Math.round(codOrders.reduce((s, o) => s + n(o.collectAmount), 0) * 100) / 100;
      const commission =
        Math.round(codOrders.reduce((s, o) => s + n(o.codCommission), 0) * 100) / 100;
      const charges =
        Math.round(chargeOrders.reduce((s, o) => s + n(o.returnFee) + n(o.cancelFee), 0) * 100) /
        100;
      const creditsTotal = Math.round(creditRows.reduce((s, a) => s + n(a.amount), 0) * 100) / 100;
      const net = Math.round((gross - commission - charges + creditsTotal) * 100) / 100;

      const r = await tx.codRemittance.create({
        data: {
          customerId,
          grossAmount: gross,
          commission,
          chargesDeducted: charges,
          creditsAdded: creditsTotal,
          netAmount: net,
          orderCount: codOrders.length,
          method,
          note,
          createdById: session.sub,
        },
      });
      if (codOrders.length) {
        const u = await tx.order.updateMany({
          where: { id: { in: codOrders.map((o) => o.id) }, codRemittanceId: null },
          data: { codRemittanceId: r.id },
        });
        if (u.count !== codOrders.length)
          throw new ApiError(409, "მონაცემები პარალელურად შეიცვალა — სცადე თავიდან");
      }
      if (chargeOrders.length) {
        const u = await tx.order.updateMany({
          where: { id: { in: chargeOrders.map((o) => o.id) }, chargeSettledAt: null },
          data: { chargeSettledAt: new Date() },
        });
        if (u.count !== chargeOrders.length)
          throw new ApiError(409, "მონაცემები პარალელურად შეიცვალა — სცადე თავიდან");
      }
      if (creditRows.length) {
        const u = await tx.customerAdjustment.updateMany({
          where: { id: { in: creditRows.map((a) => a.id) }, settledAt: null },
          data: { settledAt: new Date() },
        });
        if (u.count !== creditRows.length)
          throw new ApiError(409, "მონაცემები პარალელურად შეიცვალა — სცადე თავიდან");
      }
      return { ...r, net, charges };
    });
    const { net, charges } = rem;

    await notify(customerId, {
      type: "PAYMENT",
      title: net >= 0 ? "თანხა გადმოგერიცხათ" : "ანგარიშსწორება",
      body:
        net >= 0
          ? `${GEL(net)}${charges > 0 ? ` (დავალიანება −${GEL(charges)})` : ""}${method ? ` · ${method}` : ""}`
          : `დავალიანება ${GEL(-net)} გასწორდა`,
      data: { remittanceId: rem.id },
    });

    return ok({ ok: true, net });
  });
}
