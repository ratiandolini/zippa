"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  lat: number;
  lng: number;
  kind: "pickup" | "delivery" | "driver";
  label?: string;
}

const colors: Record<MapPoint["kind"], string> = {
  pickup: "#2563eb",
  delivery: "#178f68",
  driver: "#f59e0b",
};

function icon(kind: MapPoint["kind"]) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${colors[kind]};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [40, 40], maxZoom: 15 },
    );
  }, [map, points]);
  return null;
}

export default function Map({
  points,
  route,
  className = "h-72 w-full",
}: {
  points: MapPoint[];
  route?: [number, number][];
  className?: string;
}) {
  const center: [number, number] = points[0]
    ? [points[0].lat, points[0].lng]
    : [41.7151, 44.8271];

  return (
    <div className={`isolate overflow-hidden rounded-xl border border-border ${className}`}>
      <MapContainer center={center} zoom={12} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {route && route.length > 1 && (
          <Polyline positions={route} pathOptions={{ color: "#178f68", weight: 4, opacity: 0.7 }} />
        )}
        {points.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lng]} icon={icon(p.kind)}>
            {p.label && <Tooltip>{p.label}</Tooltip>}
          </Marker>
        ))}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
