"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

  function place(la: number, ln: number) {
    setPos([la, ln]);
    onChange({ lat: la, lng: ln });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <MapContainer center={pos} zoom={14} scrollWheelZoom className="h-64 w-full">
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickToPlace onPick={place} />
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
