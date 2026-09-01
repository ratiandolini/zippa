"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export function TrackSearch() {
  const router = useRouter();
  const [tn, setTn] = useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    const v = tn.trim().toUpperCase();
    if (v) router.push(`/track/${encodeURIComponent(v)}`);
  }

  return (
    <form onSubmit={go} className="flex w-full max-w-md gap-2">
      <Input
        value={tn}
        onChange={(e) => setTn(e.target.value)}
        placeholder="ტრეკინგ-ნომერი (SKR-XXXX-XXXX)"
        className="font-mono"
      />
      <Button type="submit" className="shrink-0">
        <Search className="h-4 w-4" /> ძებნა
      </Button>
    </form>
  );
}
