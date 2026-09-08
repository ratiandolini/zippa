import { z } from "zod";
import { requireUser, handle, ok } from "@/lib/api";
import { calculatePrice, resolveCityId, estimateDelivery } from "@/lib/pricing";
import { getSetting } from "@/lib/settings";

const schema = z.object({
  pickup: z.object({ lat: z.number(), lng: z.number() }),
  delivery: z.object({ lat: z.number(), lng: z.number() }),
  weightKg: z.number().positive().max(1000),
  paymentMethod: z.enum(["CASH", "CARD"]).default("CASH"),
  collectAmount: z.number().nonnegative().optional(),
});

export function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const data = schema.parse(await req.json());
    const deliveryCityId = await resolveCityId(data.delivery);
    const price = await calculatePrice({ ...data, deliveryCityId });
    const collectAmount = data.collectAmount ?? 0;
    const codAmount = (data.paymentMethod === "CASH" ? price.totalPrice : 0) + collectAmount;
    const codPct = collectAmount > 0 ? await getSetting("cod_commission_percent") : 0;
    const codCommission = Math.round(collectAmount * (codPct / 100) * 100) / 100;
    const eta = await estimateDelivery(price.zone);
    // driverFee არ ვუბრუნებთ კლიენტს
    return ok({
      zone: price.zone,
      distanceKm: price.distanceKm,
      deliveryPrice: price.deliveryPrice,
      codFee: price.codFee,
      totalPrice: price.totalPrice,
      overWeight: price.overWeight,
      codAmount,
      codCommission,
      codNet: Math.round((collectAmount - codCommission) * 100) / 100,
      estimatedDeliveryAt: eta.toISOString(),
    });
  });
}
