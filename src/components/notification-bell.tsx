"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Volume2, VolumeX } from "lucide-react";
import { useNotifications } from "@/lib/hooks";
import { api } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { playDing, soundEnabled, setSoundEnabled } from "@/lib/notify-sound";

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "ახლახ";
  if (s < 3600) return `${Math.floor(s / 60)} წთ`;
  if (s < 86400) return `${Math.floor(s / 3600)} სთ`;
  return `${Math.floor(s / 86400)} დღ`;
}

export function NotificationBell() {
  const { unread, notifications, mutate } = useNotifications();
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const lastTopId = useRef<string | null>(null);
  const primed = useRef(false);

  useEffect(() => setSound(soundEnabled()), []);

  // ახალი შეტყობინება → ხმა (მხოლოდ როცა აპი ღიაა)
  useEffect(() => {
    const topId = notifications[0]?.id ?? null;
    if (!primed.current) {
      primed.current = true;
      lastTopId.current = topId;
      return;
    }
    if (topId && topId !== lastTopId.current) {
      if (!notifications[0]?.isRead) playDing();
    }
    lastTopId.current = topId;
  }, [notifications]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await api("/api/notifications", "PATCH", {});
      mutate();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
        aria-label="შეტყობინებები"
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* mobile — გამჭვირვალე ფონი დახურვისთვის */}
          <button
            aria-label="დახურვა"
            className="fixed inset-0 z-40 cursor-default sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-2 top-[4.25rem] z-50 overflow-hidden rounded-xl border border-border bg-background shadow-card sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm font-medium">
              <span>შეტყობინებები</span>
              <button
                type="button"
                aria-label={sound ? "ხმის გამორთვა" : "ხმის ჩართვა"}
                onClick={() => {
                  const next = !sound;
                  setSound(next);
                  setSoundEnabled(next);
                  if (next) playDing();
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto sm:max-h-96">
            {notifications.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">ცარიელია</p>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "border-b border-border px-4 py-3 last:border-0",
                  !n.isRead && "bg-accent/[0.04]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ago(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
              </div>
            ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
