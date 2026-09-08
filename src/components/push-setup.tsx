"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const DISMISS_KEY = "zippa_push_dismissed";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function subscribe(): Promise<boolean> {
  if (!VAPID || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID),
      });
    }
    const r = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export function PushToggle() {
  const [state, setState] = useState<"loading" | "on" | "off" | "denied" | "unsupported">("loading");

  useEffect(() => {
    if (!VAPID || typeof window === "undefined" || !("Notification" in window) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") return setState("denied");
    navigator.serviceWorker.ready
      .then((r) => r.pushManager.getSubscription())
      .then((s) => setState(s ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  async function turnOn() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
    setState((await subscribe()) ? "on" : "off");
  }

  async function turnOff() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } catch {
      /* ignore */
    }
    setState("off");
  }

  if (state === "loading") return <p className="text-sm text-muted-foreground">…</p>;
  if (state === "unsupported")
    return <p className="text-sm text-muted-foreground">ეს ბრაუზერი push-შეტყობინებებს არ უჭერს მხარს.</p>;
  if (state === "denied")
    return (
      <p className="text-sm text-muted-foreground">
        შეტყობინებები დაბლოკილია ბრაუზერში. ჩართე ბრაუზერის საიტის პარამეტრებში.
      </p>
    );
  return (
    <button
      onClick={state === "on" ? turnOff : turnOn}
      className={
        "rounded-lg border px-3 py-1.5 text-sm font-medium " +
        (state === "on"
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted-foreground")
      }
    >
      {state === "on" ? "ჩართულია — გამორთვა" : "Push-შეტყობინებების ჩართვა"}
    </button>
  );
}

export function PushSetup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!VAPID || typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      void subscribe();
      return;
    }
    if (Notification.permission === "denied") return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (!dismissed) setShow(true);
  }, []);

  async function enable() {
    const perm = await Notification.requestPermission();
    setShow(false);
    if (perm === "granted") await subscribe();
  }

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!show) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/[0.06] px-4 py-2.5 text-sm">
      <Bell className="h-4 w-4 shrink-0 text-accent" />
      <span className="flex-1">
        ჩართე შეტყობინებები — ახალ შეკვეთასა და სტატუსის ცვლილებას მაშინვე გაიგებ.
      </span>
      <button
        onClick={enable}
        className="shrink-0 rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
      >
        ჩართვა
      </button>
      <button onClick={dismiss} aria-label="დახურვა" className="shrink-0 text-muted-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
