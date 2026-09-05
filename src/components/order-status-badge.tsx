import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL } from "@/lib/domain";
import type { OrderStatus } from "@prisma/client";

const tone: Record<OrderStatus, "neutral" | "amber" | "blue" | "violet" | "accent" | "green" | "red"> = {
  DRAFT: "neutral",
  PENDING: "amber",
  ASSIGNED: "blue",
  ACCEPTED: "blue",
  EN_ROUTE_PICKUP: "violet",
  PICKED_UP: "violet",
  IN_TRANSIT: "accent",
  DELIVERED: "green",
  CANCELLED: "red",
  FAILED: "red",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={tone[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}
