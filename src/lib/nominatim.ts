// მისამართის geocoding — მხოლოდ სერვერიდან (/api/geo/*).
// პრიორიტეტი: Geoapify (თუ NEXT_PUBLIC_GEOAPIFY_KEY / GEOAPIFY_KEY დაყენებულია).
// key-ის გარეშე — fallback OpenStreetMap Nominatim-ზე (1 req/წმ, User-Agent).
import { shortAddress, compactAddress, type GeoResult, type NominatimAddress } from "@/lib/geo";
import { COMPANY } from "@/lib/company";

const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_KEY || "";

const NOMINATIM_BASE = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
const UA =
  process.env.NOMINATIM_UA ||
  `Zippa/1.0 (https://zippa-eosin.vercel.app; ${COMPANY.email})`;
const MIN_INTERVAL_MS = 1100;

let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

/** გლობალური რიგი — მხოლოდ Nominatim fallback-ისთვის (Geoapify concurrent-ს უშვებს). */
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

// ─────────────────────────────────────────────
// Geoapify
// ─────────────────────────────────────────────
interface GeoapifyResult {
  lat: number;
  lon: number;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  street?: string;
  housenumber?: string;
  name?: string;
  city?: string;
  town?: string;
  village?: string;
  postcode?: string;
}

function geoapifyLabel(r: GeoapifyResult): string {
  const line1 =
    r.address_line1 || [r.street || r.name, r.housenumber].filter(Boolean).join(" ").trim();
  const city = r.city || r.town || r.village;
  const parts = [line1, city && city !== line1 ? city : null].filter(Boolean);
  const base = parts.length ? parts.join(", ") : compactAddress(r.formatted || "");
  return r.postcode && !base.includes(r.postcode) ? `${base} (${r.postcode})` : base;
}

async function geoapifySearch(query: string): Promise<GeoResult[]> {
  const url =
    `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}` +
    `&filter=countrycode:ge&lang=ka&limit=6&format=json&apiKey=${GEOAPIFY_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: GeoapifyResult[] };
    const seen = new Set<string>();
    return (data.results ?? [])
      .map((r) => ({ label: geoapifyLabel(r), lat: Number(r.lat), lng: Number(r.lon) }))
      .filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng))
      .filter((r) => {
        const k = r.label.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 4);
  } catch {
    return [];
  }
}

async function geoapifyReverse(lat: number, lng: number): Promise<string | null> {
  const url =
    `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}` +
    `&lang=ka&format=json&apiKey=${GEOAPIFY_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: GeoapifyResult[] };
    const r = data.results?.[0];
    if (!r) return null;
    return geoapifyLabel(r).replace(/\s*\([^)]*\)\s*$/, "");
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Nominatim (fallback)
// ─────────────────────────────────────────────
async function nominatimSearchRaw(query: string): Promise<GeoResult[]> {
  const url =
    `${NOMINATIM_BASE}/search?format=jsonv2&limit=6&addressdetails=1&accept-language=ka` +
    `&countrycodes=ge&q=${encodeURIComponent(query)}`;
  return throttled(async () => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as Array<{
        display_name: string;
        lat: string;
        lon: string;
        address?: (NominatimAddress & { postcode?: string }) | undefined;
      }>;
      return data
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
        .filter((r, i, arr) => arr.findIndex((x) => x.key === r.key) === i)
        .slice(0, 4)
        .map(({ label, lat, lng }) => ({ label, lat, lng }));
    } catch {
      return [];
    }
  });
}

async function nominatimReverseRaw(lat: number, lng: number): Promise<string | null> {
  const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&addressdetails=1&accept-language=ka&lat=${lat}&lon=${lng}`;
  return throttled(async () => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { display_name?: string; address?: NominatimAddress };
      if (!data.display_name) return null;
      return shortAddress(data.address, data.display_name);
    } catch {
      return null;
    }
  });
}

// ─────────────────────────────────────────────
// საჯარო API — ერთი და იგივე ხელმოწერა (route handler-ები არ იცვლება)
// ─────────────────────────────────────────────
export async function nominatimSearch(query: string): Promise<GeoResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const cached = searchCache.get(q);
  if (cached) return cached;

  const results = GEOAPIFY_KEY ? await geoapifySearch(query) : await nominatimSearchRaw(query);
  searchCache.set(q, results);
  return results;
}

export async function nominatimReverse(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseCache.get(key);
  if (cached !== undefined) return cached;

  const address = GEOAPIFY_KEY
    ? await geoapifyReverse(lat, lng)
    : await nominatimReverseRaw(lat, lng);
  reverseCache.set(key, address);
  return address;
}
