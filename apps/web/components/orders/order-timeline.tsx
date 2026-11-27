import type { OrderTimelineEvent } from "@workshop-pos/contracts";

import { formatWibDateTime } from "@/lib/format";
import { ORDER_STATUS_LABELS } from "@/lib/order-labels";

interface OrderTimelineProps {
  events: OrderTimelineEvent[];
}

/** Staff-visible status timeline with actor, time, and reason (FR-049). */
export function OrderTimeline({ events }: OrderTimelineProps) {
  return (
    <section className="bo-panel" aria-label="Riwayat status transaksi">
      <div className="bo-panel__header">
        <h2 className="bo-panel__title">Riwayat status</h2>
      </div>
      <div className="bo-panel__body">
        {events.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada perubahan status.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {events.map((event) => (
              <li key={event.id} className="border-l-2 border-line pl-3">
                <p className="text-sm font-semibold">
                  {event.fromStatus
                    ? `${ORDER_STATUS_LABELS[event.fromStatus]} → ${ORDER_STATUS_LABELS[event.toStatus]}`
                    : ORDER_STATUS_LABELS[event.toStatus]}
                </p>
                <p className="text-xs text-ink-muted">
                  {formatWibDateTime(event.createdAt)} · {event.actorName}
                </p>
                {event.reason ? (
                  <p className="mt-1 text-sm text-ink-secondary">Alasan: {event.reason}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
