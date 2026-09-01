"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { geocode, type GeoResult } from "@/lib/geo";
import { MapPin, Loader2 } from "lucide-react";

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
}: {
  label: string;
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  placeholder?: string;
}) {
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="space-y-1.5" ref={boxRef}>
      <Label>{label}</Label>
      <div className="relative">
        <Input
          value={value.address}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => onChange({ address: e.target.value, lat: null, lng: null })}
          onFocus={() => results.length && setOpen(true)}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-muted-foreground" />
        )}
        {value.lat != null && !loading && (
          <MapPin className="absolute right-3 top-2.5 h-5 w-5 text-accent" />
        )}

        {open && results.length > 0 && (
          <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-background shadow-card">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onChange({ address: r.label, lat: r.lat, lng: r.lng });
                    setOpen(false);
                  }}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="line-clamp-2">{r.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.address.trim().length >= 3 && value.lat == null && !loading && !open && (
        <p className="text-xs text-muted-foreground">აირჩიე სიიდან ზუსტი მისამართი</p>
      )}
    </div>
  );
}
