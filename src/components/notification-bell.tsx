"use client";

import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/hooks";
import { api } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

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
  const ref = useRef<HTMLDivElement>(null);

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
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-background shadow-card">
          <div className="border-b border-border px-4 py-2.5 text-sm font-medium">შეტყობინებები</div>
          <div className="max-h-96 overflow-auto">
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
      )}
    </div>
  );
}
