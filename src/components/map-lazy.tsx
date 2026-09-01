"use client";

import dynamic from "next/dynamic";

export const LazyMap = dynamic(() => import("@/components/map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-72 w-full place-items-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground">
      რუკა იტვირთება…
    </div>
  ),
});
