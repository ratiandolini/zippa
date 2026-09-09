// მხოლოდ სერვერიდან — იმპორტდება route handler-ებში (/api/geo/*)
import { shortAddress, type GeoResult, type NominatimAddress } from "@/lib/geo";
import { COMPANY } from "@/lib/company";

// Nominatim-ის საჯარო პოლიტიკა: მაქს. 1 მოთხოვნა/წამში, ვალიდური User-Agent.
// ამიტომ ყველა გამოძახება სერვერზე გადის — გლობალური რიგი + ქეში.

const BASE = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
const UA =
  process.env.NOMINATIM_UA ||
  `Zippa/1.0 (https://zippa-eosin.vercel.app; ${COMPANY.email})`;
const MIN_INTERVAL_MS = 1100;

let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

/** გლობალური რიგი — უზრუნველყოფს ≥1.1წმ ინტერვალს Nominatim-ის გამოძახებებს შორის */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCall));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

// მარტივი TTL ქეში (per-instance)
interface CacheEntry<T> {
  value: T;
  exp: number;
}
function makeCache<T>(ttlMs: number, max: number) {
  const m = new Map<string, CacheEntry<T>>();
  return {
    get(key: string): T | undefined {
      const e = m.get(key);
      if (!e) return undefined;
      if (Date.now() > e.exp) {
        m.delete(key);
        return undefined;
      }
      // LRU touch
      m.delete(key);
      m.set(key, e);
      return e.value;
    },
    set(key: string, value: T) {
      if (m.size >= max) {
        const first = m.keys().next().value;
        if (first !== undefined) m.delete(first);
      }
      m.set(key, { value, exp: Date.now() + ttlMs });
    },
  };
}

const searchCache = makeCache<GeoResult[]>(10 * 60_000, 500); // 10 წთ
const reverseCache = makeCache<string | null>(24 * 60 * 60_000, 1000); // 24 სთ

export async function nominatimSearch(query: string): Promise<GeoResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const cached = searchCache.get(q);
  if (cached) return cached;

  const url =
    `${BASE}/search?format=jsonv2&limit=6&addressdetails=1&accept-language=ka` +
    `&countrycodes=ge&q=${encodeURIComponent(query)}`;

  const results = await throttled(async () => {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const data = (await res.json()) as Array<{
        display_name: string;
        lat: string;
        lon: string;
        address?: (NominatimAddress & { postcode?: string }) | undefined;
        importance?: number;
      }>;
      const mapped = data
        .map((d) => {
          const base = shortAddress(d.address, d.display_name);
          const pc = d.address?.postcode;
          return {
            label: pc && !base.includes(pc) ? `${base} (${pc})` : base,
            key: base.toLowerCase(),
            lat: parseFloat(d.lat),
            lng: parseFloat(d.lon),
          };
        })
        // დუბლიკატების მოცილება — ერთი და იგივე მოკლე მისამართი მხოლოდ ერთხელ
        .filter((r, i, arr) => arr.findIndex((x) => x.key === r.key) === i)
        .slice(0, 4)
        .map(({ label, lat, lng }) => ({ label, lat, lng }));
      return mapped;
    } catch {
      return [];
    }
  });

  searchCache.set(q, results);
  return results;
}

export async function nominatimReverse(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseCache.get(key);
  if (cached !== undefined) return cached;

  const url = `${BASE}/reverse?format=jsonv2&addressdetails=1&accept-language=ka&lat=${lat}&lon=${lng}`;

  const address = await throttled(async () => {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      const data = (await res.json()) as { display_name?: string; address?: NominatimAddress };
      if (!data.display_name) return null;
      return shortAddress(data.address, data.display_name);
    } catch {
      return null;
    }
  });

  reverseCache.set(key, address);
  return address;
}
