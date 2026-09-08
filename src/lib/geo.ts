// გეოგრაფიული დამხმარეები — Haversine + მისამართის ფორმატირება.
// Nominatim-თან რეალური კომუნიკაცია სერვერზეა (throttle + cache): src/lib/nominatim.ts + /api/geo/*

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
}

export interface NominatimAddress {
  road?: string;
  house_number?: string;
  pedestrian?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
}

/**
 * გრძელი Nominatim display_name → მოკლე მისამართი: „ქუჩა ნომერი, ქალაქი".
 * მაგ. „ვაჟა-ფშაველას გამზირი 5, თბილისი".
 */
export function shortAddress(addr: NominatimAddress | undefined, fallbackDisplayName: string): string {
  if (addr) {
    const street = addr.road || addr.pedestrian;
    const line1 = street
      ? [street, addr.house_number].filter(Boolean).join(" ")
      : addr.neighbourhood || addr.suburb || addr.quarter || addr.village;
    const city = addr.city || addr.town || addr.village || addr.municipality;
    const parts = [line1, city && city !== line1 ? city : null].filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return compactAddress(fallbackDisplayName);
}

/** ნებისმიერი (უკვე შენახული) მისამართის სტრიქონი → მოკლე: პირველი 2 მნიშვნელოვანი სეგმენტი. */
export function compactAddress(s: string): string {
  const drop = /^\d{4,}$|საქართველო|georgia|postal|რაიონი|მუნიციპალიტეტი/i;
  const segs = s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x && !drop.test(x));
  return segs.slice(0, 2).join(", ") || s.trim();
}

// ─── კლიენტის მხარე — ჩვენივე proxy-ს ეძახის, არა პირდაპირ Nominatim-ს ───

/** მისამართის ძებნა (autocomplete) — ბრაუზერიდან. */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  if (query.trim().length < 3) return [];
  try {
    const res = await fetch(`/api/geo/search?q=${encodeURIComponent(query)}`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: GeoResult[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

/** კოორდინატიდან მისამართის ტექსტი (რუკაზე მონიშვნისას). */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: string | null };
    return data.address ?? null;
  } catch {
    return null;
  }
}
