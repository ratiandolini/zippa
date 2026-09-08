import { requireUser, handle, ok, fail, throttle } from "@/lib/api";
import { nominatimReverse } from "@/lib/nominatim";

// კოორდინატი → მისამართი — Nominatim proxy (throttle + cache სერვერზე)
export function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    throttle(req, "geo", 40, 60);
    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get("lat") ?? "");
    const lng = parseFloat(url.searchParams.get("lng") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail(400, "lat/lng საჭიროა");
    return ok({ address: await nominatimReverse(lat, lng) });
  });
}
