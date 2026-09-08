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

interface NominatimAddress {
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
 * გრძელი Nominatim display_name → მოკლე, წასაკითხი მისამართი.
 * მაგ. „ვაჟა-ფშაველას გამზირი, საბურთალო, თბილისი" ნაცვლად 8-ნაწილიანი სტრიქონისა.
 */
export function shortAddress(addr: NominatimAddress | undefined, fallbackDisplayName: string): string {
  if (addr) {
    const street = addr.road || addr.pedestrian;
    const line1 = street
      ? [street, addr.house_number].filter(Boolean).join(" ")
      : addr.neighbourhood || addr.suburb || addr.quarter;
    const area = addr.suburb || addr.quarter || addr.city_district || addr.neighbourhood;
    const city = addr.city || addr.town || addr.village || addr.municipality;
    const parts = [line1, area && area !== line1 ? area : null, city && city !== area ? city : null]
      .filter(Boolean)
      .slice(0, 3);
    if (parts.length) return parts.join(", ");
  }
  // fallback: display_name-ის პირველი 3 სეგმენტი
  return fallbackDisplayName.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3).join(", ");
}

/** მისამართის ძებნა (autocomplete). ბრაუზერიდანაც და სერვერიდანაც. */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  if (query.trim().length < 3) return [];
  const url =
    `${NOMINATIM}/search?format=jsonv2&limit=6&addressdetails=1&accept-language=ka` +
    `&countrycodes=ge&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    signal,
    headers: { "User-Agent": "zippa/0.1" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
    address?: NominatimAddress;
  }>;
  return data.map((d) => ({
    label: shortAddress(d.address, d.display_name),
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
}

/** კოორდინატიდან მისამართის ტექსტი (რუკაზე მონიშვნისას, თუ მომხმარებელს ტექსტი არ აქვს დაწერილი) */
export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&accept-language=ka&lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, { signal, headers: { "User-Agent": "zippa/0.1" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string; address?: NominatimAddress };
    if (!data.display_name) return null;
    return shortAddress(data.address, data.display_name);
  } catch {
    return null;
  }
}
