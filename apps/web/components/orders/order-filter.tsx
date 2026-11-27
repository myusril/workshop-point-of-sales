import { ORDER_STATUSES } from "@workshop-pos/contracts";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORDER_STATUS_LABELS } from "@/lib/order-labels";

interface OrderFilterProps {
  query: Record<string, string | undefined>;
  /** Search/status/date filters are present, so a reset link is useful. */
  hasFilters: boolean;
}

/**
 * Server-driven filter bar: a native GET form works without JavaScript and
 * keeps the filter state in the URL (shareable, back-button friendly).
 */
export function OrderFilter({ query, hasFilters }: OrderFilterProps) {
  return (
    <form className="bo-filterbar" method="get" action="/orders" role="search" aria-label="Filter transaksi">
      <div className="bo-filterbar__field">
        <Label htmlFor="order-q">Cari</Label>
        <Input
          id="order-q"
          name="q"
          type="search"
          defaultValue={query.q ?? ""}
          placeholder="Nomor nota, plat, atau pelanggan"
          maxLength={80}
        />
      </div>
      <div className="bo-filterbar__field">
        <Label htmlFor="order-status">Status</Label>
        <select
          id="order-status"
          name="status"
          className="bo-select"
          defaultValue={query.status ?? ""}
        >
          <option value="">Semua status</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ORDER_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <div className="bo-filterbar__field">
        <Label htmlFor="order-from">Dari</Label>
        <Input id="order-from" name="from" type="date" defaultValue={query.from ?? ""} />
      </div>
      <div className="bo-filterbar__field">
        <Label htmlFor="order-to">Sampai</Label>
        <Input id="order-to" name="to" type="date" defaultValue={query.to ?? ""} />
      </div>
      <div className="bo-filterbar__actions">
        <Button type="submit">Terapkan filter</Button>
        {hasFilters ? (
          <Link className="bo-btn-quiet" href="/orders">
            Hapus filter
          </Link>
        ) : null}
      </div>
    </form>
  );
}
