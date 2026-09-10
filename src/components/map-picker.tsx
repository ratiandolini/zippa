"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { tileConfig } from "@/lib/map-tiles";

const pinIcon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:22px;height:22px;border-radius:9999px 9999px 9999px 0;background:#178f68;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:rotate(45deg)"></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 20],
});

const TBILISI: [number, number] = [41.7151, 44.8271];

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// გარედან შემოსული კოორდინატი (მაგ. სიიდან არჩევა) — რუკა და ნიშანი გადავიდეს
function SyncView({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], map.getZoom());
  }, [map, lat, lng]);
  return null;
}

export default function MapPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (pt: { lat: number; lng: number }) => void;
}) {
  const [pos, setPos] = useState<[number, number]>(lat != null && lng != null ? [lat, lng] : TBILISI);

  // გარედან შემოსული კოორდინატი
  useEffect(() => {
    if (lat != null && lng != null) setPos([lat, lng]);
  }, [lat, lng]);

  function place(la: number, ln: number) {
    setPos([la, ln]);
    onChange({ lat: la, lng: ln });
  }

  return (
    <div className="isolate overflow-hidden rounded-xl border border-border">
      <MapContainer center={pos} zoom={14} scrollWheelZoom className="h-64 w-full">
        <TileLayer {...tileConfig} />
        <ClickToPlace onPick={place} />
        <SyncView lat={lat} lng={lng} />
        <Marker
          position={pos}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const m = e.target as L.Marker;
              const p = m.getLatLng();
              place(p.lat, p.lng);
            },
          }}
        />
      </MapContainer>
    </div>
  );
}
