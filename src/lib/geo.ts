// გეოგრაფიული დამხმარეები — Haversine + Nominatim (OpenStreetMap)

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

const NOMINATIM = process.env.NEXT_PUBLIC_NOMINATIM_URL || "https://nominatim.openstreetmap.org";

export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
}

/** მისამართის ძებნა (autocomplete). ბრაუზერიდანაც და სერვერიდანაც. */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  if (query.trim().length < 3) return [];
  const url =
    `${NOMINATIM}/search?format=jsonv2&limit=6&accept-language=ka` +
    `&countrycodes=ge&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    signal,
    headers: { "User-Agent": "sakuriero-pro/0.1 (dev)" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  return data.map((d) => ({
    label: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
}
