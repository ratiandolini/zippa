import { z } from "zod";
import { requireUser, handle, ok } from "@/lib/api";
import { calculatePrice, resolveCityId } from "@/lib/pricing";

const schema = z.object({
  pickup: z.object({ lat: z.number(), lng: z.number() }),
  delivery: z.object({ lat: z.number(), lng: z.number() }),
  weightKg: z.number().positive().max(500),
  paymentMethod: z.enum(["CASH", "CARD"]).default("CASH"),
  parcelValue: z.number().nonnegative().optional(),
});

export function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const data = schema.parse(await req.json());
    const [pickupCityId, deliveryCityId] = await Promise.all([
      resolveCityId(data.pickup),
      resolveCityId(data.delivery),
    ]);
    const price = await calculatePrice({ ...data, pickupCityId, deliveryCityId });
    const codAmount =
      data.paymentMethod === "CASH" ? price.totalPrice + (data.parcelValue ?? 0) : 0;
    return ok({ ...price, codAmount });
  });
}
