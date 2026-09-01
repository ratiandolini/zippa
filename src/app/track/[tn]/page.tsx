"use client";

import Link from "next/link";
import { useTracking } from "@/lib/hooks";
import { TrackingPanel } from "@/components/tracking-panel";
import { Card, CardContent } from "@/components/ui/card";

export default function PublicTrackPage({ params }: { params: { tn: string } }) {
  const tn = decodeURIComponent(params.tn);
  const { tracking, isLoading, error } = useTracking(tn, 12000);

  if (isLoading) return <p className="text-sm text-muted-foreground">იტვირთება…</p>;
  if (error || !tracking)
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          ტრეკინგ-ნომერი <span className="font-mono">{tn}</span> ვერ მოიძებნა.{" "}
          <Link href="/" className="text-accent hover:underline">
            მთავარ გვერდზე
          </Link>
        </CardContent>
      </Card>
    );

  return <TrackingPanel t={tracking} />;
}
