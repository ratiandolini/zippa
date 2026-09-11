import { Badge } from "@/components/ui/badge";
import { PARCEL_STATUS_LABEL } from "@/lib/domain";
import type { ParcelStatus } from "@prisma/client";

const tone: Record<ParcelStatus, "neutral" | "amber" | "blue" | "violet" | "accent" | "green" | "red"> = {
  PENDING: "amber",
  PICKED_UP: "violet",
  NOT_PICKED_UP: "amber",
  IN_TRANSIT: "accent",
  DELIVERED: "green",
  REFUSED: "red",
  RETURN_REQUESTED: "red",
  RETURNED: "red",
  CANCELLED: "neutral",
  FAILED: "red",
};

export function ParcelStatusBadge({ status }: { status: ParcelStatus }) {
  return <Badge tone={tone[status]}>{PARCEL_STATUS_LABEL[status]}</Badge>;
}
