"use client";

import dynamic from "next/dynamic";

export const MapPickerLazy = dynamic(() => import("@/components/map-picker"), {
  ssr: false,
  loading: () => (
    <div className="grid h-64 w-full place-items-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground">
      რუკა იტვირთება…
    </div>
  ),
});
