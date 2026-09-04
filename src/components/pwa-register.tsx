"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    // ახალი service worker რომ აიღებს კონტროლს — ერთხელ განვაახლოთ გვერდი
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    const onLoad = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        // პერიოდულად და ფოკუსზე ვამოწმებთ ახალ ვერსიას
        reg.update().catch(() => {});
        const iv = setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
        const onFocus = () => reg.update().catch(() => {});
        window.addEventListener("focus", onFocus);
        return () => {
          clearInterval(iv);
          window.removeEventListener("focus", onFocus);
        };
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
