import Link from "next/link";

import type { CatalogListQuery } from "@workshop-pos/contracts";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface FilterChip {
  key: string;
  label: string;
  removeHref: string;
}

interface CatalogFilterProps {
  query: CatalogListQuery;
  hasFilters: boolean;
  chips: FilterChip[];
  resetHref: string;
}

/**
 * Inline filter bar (§6.6): URL-backed search/type/status, explicit "Terapkan
 * filter", removable text chips, and a text "Hapus semua". No filter is
 * applied by typing alone, so the result count never changes unseen.
 */
export function CatalogFilter({ query, hasFilters, chips, resetHref }: CatalogFilterProps) {
  return (
    <>
      <form className="bo-filterbar" action="/catalog" method="get" role="search">
        {query.sort !== "name" ? <input type="hidden" name="sort" value={query.sort} /> : null}
        {query.dir !== "asc" ? <input type="hidden" name="dir" value={query.dir} /> : null}
        {query.pageSize !== 25 ? <input type="hidden" name="pageSize" value={query.pageSize} /> : null}

        <div className="bo-filterbar__field">
          <Label htmlFor="catalog-search">Cari</Label>
          <input
            className="bo-select"
            id="catalog-search"
            name="q"
            type="search"
            defaultValue={query.q ?? ""}
            placeholder="Nama atau SKU"
            autoComplete="off"
          />
        </div>

        <div className="bo-filterbar__field">
          <Label htmlFor="catalog-type">Jenis</Label>
          <select className="bo-select" id="catalog-type" name="type" defaultValue={query.type}>
            <option value="all">Semua jenis</option>
            <option value="product">Produk</option>
            <option value="service">Jasa</option>
          </select>
        </div>

        <div className="bo-filterbar__field">
          <Label htmlFor="catalog-status">Status</Label>
          <select className="bo-select" id="catalog-status" name="status" defaultValue={query.status}>
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
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

      {chips.length > 0 ? (
        <div className="bo-chips" aria-label="Filter aktif">
          {chips.map((chip) => (
            <Link key={chip.key} className="bo-chip-link" href={chip.removeHref} aria-label={`Hapus filter ${chip.label}`}>
              {chip.label}
              <span aria-hidden="true">×</span>
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
