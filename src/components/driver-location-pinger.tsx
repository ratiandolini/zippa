"use client";

import { useEffect, useRef } from "react";
import { useDriverMe } from "@/lib/hooks";
import { api } from "@/lib/fetcher";

// ხაზზე მყოფი კურიერის მდებარეობის პერიოდული განახლება (ცოცხალი რუკისთვის).
// მუშაობს მხოლოდ როცა კურიერი AVAILABLE ან BUSY-ა და ჩანართი აქტიურია.
const INTERVAL_MS = 25_000;

export function DriverLocationPinger() {
  const { driver } = useDriverMe(30_000);
  const online = driver?.status === "AVAILABLE" || driver?.status === "BUSY";
  const lastSent = useRef(0);

  useEffect(() => {
    if (!online || typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;

    const push = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (Date.now() - lastSent.current < INTERVAL_MS - 2000) return;
      navigator.geolocation.getCurrentPosition(
        (p) => {
          lastSent.current = Date.now();
          void api("/api/driver/me", "PATCH", {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
          }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
      );
    };

    push();
    const id = setInterval(push, INTERVAL_MS);
    const onVis = () => document.visibilityState === "visible" && push();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [online]);

  return null;
}
