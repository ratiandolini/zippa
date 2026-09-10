import { requireUser, handle, ok, throttle } from "@/lib/api";
import { nominatimSearch } from "@/lib/nominatim";

// მისამართის ძებნა — Nominatim proxy (throttle + cache სერვერზე)
export function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    await throttle(req, "geo", 40, 60); // 40 ძებნა/წუთში თითო IP-ზე
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return ok({ results: await nominatimSearch(q) });
  });
}
