import { ORDER_STATUS_LABEL, fmtDateTime } from "@/lib/domain";
import type { OrderDTO } from "@/lib/serialize";

export function OrderTimeline({ events }: { events: OrderDTO["events"] }) {
  if (!events.length) return null;
  return (
    <ol className="space-y-4">
      {events.map((e, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`mt-1 h-2.5 w-2.5 rounded-full ${
                i === events.length - 1 ? "bg-accent" : "bg-border"
              }`}
            />
            {i < events.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <div className="pb-1">
            <div className="text-sm font-medium">{ORDER_STATUS_LABEL[e.status]}</div>
            {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
            <div className="text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
