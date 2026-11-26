import type { InventoryProduct, LedgerEntryType, LedgerListQuery } from "@workshop-pos/contracts";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LEDGER_ENTRY_TYPE_LABELS } from "@/lib/inventory-labels";

const ENTRY_TYPE_OPTIONS: { value: LedgerEntryType; label: string }[] = (
  ["STOCK_IN", "ADJUSTMENT", "SALE_DECREMENT", "SALE_REVERSAL"] as const
).map((value) => ({ value, label: LEDGER_ENTRY_TYPE_LABELS[value] }));

interface LedgerFilterProps {
  products: InventoryProduct[];
  query: LedgerListQuery;
  hasFilters: boolean;
  resetHref: string;
}

/** URL-backed ledger filters: product, entry type, and a WIB business-date range. */
export function LedgerFilter({ products, query, hasFilters, resetHref }: LedgerFilterProps) {
  return (
    <form className="bo-filterbar" action="/inventory" method="get" role="search">
      {query.pageSize !== 25 ? <input type="hidden" name="pageSize" value={query.pageSize} /> : null}

      <div className="bo-filterbar__field">
        <Label htmlFor="ledger-product">Produk</Label>
        <select className="bo-select" id="ledger-product" name="productId" defaultValue={query.productId ?? ""}>
          <option value="">Semua produk</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} — {product.sku}
            </option>
          ))}
        </select>
      </div>

      <div className="bo-filterbar__field">
        <Label htmlFor="ledger-entry-type">Jenis</Label>
        <select className="bo-select" id="ledger-entry-type" name="entryType" defaultValue={query.entryType ?? ""}>
          <option value="">Semua jenis</option>
          {ENTRY_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bo-filterbar__field">
        <Label htmlFor="ledger-from">Dari tanggal</Label>
        <input className="bo-select" id="ledger-from" name="from" type="date" defaultValue={query.from ?? ""} />
      </div>

      <div className="bo-filterbar__field">
        <Label htmlFor="ledger-to">Sampai tanggal</Label>
        <input className="bo-select" id="ledger-to" name="to" type="date" defaultValue={query.to ?? ""} />
      </div>

      <div className="bo-filterbar__actions">
        <Button type="submit" variant="secondary">
          Terapkan filter
        </Button>
        {hasFilters ? (
          <Link className="bo-link-button" href={resetHref}>
            Hapus semua
          </Link>
        ) : null}
      </div>
    </form>
  );
}
