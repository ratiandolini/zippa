"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { geocode, reverseGeocode, type GeoResult } from "@/lib/geo";
import { MapPin, Loader2, LocateFixed } from "lucide-react";
import { MapPickerLazy } from "@/components/map-picker-lazy";

export interface AddressValue {
  address: string;
  lat: number | null;
  lng: number | null;
}

export function AddressField({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  placeholder?: string;
  error?: string;
}) {
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [locating, setLocating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.lat != null) return; // უკვე არჩეულია
    const q = value.address.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await geocode(q, ctrl.signal);
        setResults(r);
        setOpen(true);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value.address, value.lat]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // რუკაზე წერტილის მონიშვნა — მისამართის ტექსტიც ავტომატურად ემთხვევა პინს (რევერს-გეოკოდი)
  async function pickOnMap(pt: { lat: number; lng: number }) {
    setLocating(true);
    const rg = await reverseGeocode(pt.lat, pt.lng).catch(() => null);
    setLocating(false);
    const address = rg || value.address.trim() || "მისამართი მონიშნულია რუკაზე";
    onChange({ address, lat: pt.lat, lng: pt.lng });
  }

  // მოწყობილობის მდებარეობა → პინი რუკაზე
  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    setShowMap(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        void pickOnMap({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function selectResult(r: GeoResult) {
    onChange({ address: r.label, lat: r.lat, lng: r.lng });
    setOpen(false);
  }

  return (
    <div className="space-y-1.5" ref={boxRef}>
      <Label>{label}</Label>
      <div className="relative z-30">
        <Input
          value={value.address}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => onChange({ address: e.target.value, lat: null, lng: null })}
          onFocus={() => results.length && setOpen(true)}
        />
        {(loading || locating) && (
          <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-muted-foreground" />
        )}
        {value.lat != null && !loading && !locating && (
          <MapPin className="absolute right-3 top-2.5 h-5 w-5 text-accent" />
        )}

        {open && results.length > 0 && (
          <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-background shadow-card">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => selectResult(r)}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="line-clamp-2">{r.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        {value.address.trim().length >= 3 && value.lat == null && !loading && !open && (
          <p className="text-xs text-muted-foreground">სიაში ვერ ჰპოულობ? აირჩიე ან რუკაზე მონიშნე.</p>
        )}
        <button
          type="button"
          onClick={() => setShowMap((v) => !v)}
          className="text-xs font-medium text-accent hover:underline"
        >
          {showMap ? "რუკის დახურვა" : value.lat != null ? "მდებარეობის შეცვლა რუკაზე" : "მონიშვნა რუკაზე"}
        </button>
        <button
          type="button"
          onClick={useMyLocation}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <LocateFixed className="h-3.5 w-3.5" /> ჩემი მდებარეობა
        </button>
      </div>

      {showMap && (
        <div className="pt-1">
          <MapPickerLazy lat={value.lat} lng={value.lng} onChange={pickOnMap} />
          <p className="mt-1 text-xs text-muted-foreground">
            დააჭირე რუკას სასურველ წერტილზე ან გადაათრიე ნიშანი — მისამართი ავტომატურად შეივსება.
          </p>
        </div>
      )}
    </div>
  );
}
