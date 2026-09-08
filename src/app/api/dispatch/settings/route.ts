import { z } from "zod";
import { requireRole, handle, ok } from "@/lib/api";
import { allSettings, setSetting } from "@/lib/settings";

export function GET() {
  return handle(async () => {
    await requireRole("DISPATCHER");
    return ok({ settings: await allSettings() });
  });
}

const schema = z.object({
  cod_commission_percent: z.number().min(0).max(50).optional(),
});

export function PATCH(req: Request) {
  return handle(async () => {
    await requireRole("DISPATCHER");
    const data = schema.parse(await req.json());
    if (data.cod_commission_percent !== undefined)
      await setSetting("cod_commission_percent", data.cod_commission_percent);
    return ok({ settings: await allSettings() });
  });
}
