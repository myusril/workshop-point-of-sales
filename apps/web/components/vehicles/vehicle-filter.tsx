import type { VehicleListQuery } from "@workshop-pos/contracts";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface VehicleFilterProps {
  query: VehicleListQuery;
  hasSearch: boolean;
  resetHref: string;
  /** Link that keeps the search but drops the customer drill-down. */
  removeCustomerHref: string;
}

/**
 * URL-backed vehicle search (§6.6, §9.4). The server normalizes plate terms, so
 * `b 1234 xyz`, `B1234XYZ`, and a suffix all find the same vehicle; results
 * render the canonical plate. A `customerId` drill-down from the customer list
 * is surfaced as a removable filter instead of an invisible URL parameter.
 */
export function VehicleFilter({
  query,
  hasSearch,
  resetHref,
  removeCustomerHref,
}: VehicleFilterProps) {
  return (
    <>
      <form className="bo-filterbar" action="/vehicles" method="get" role="search">
        {query.customerId ? <input type="hidden" name="customerId" value={query.customerId} /> : null}
        {query.pageSize !== 25 ? <input type="hidden" name="pageSize" value={query.pageSize} /> : null}
        {query.sort !== "plate" ? <input type="hidden" name="sort" value={query.sort} /> : null}
        {query.dir !== "asc" ? <input type="hidden" name="dir" value={query.dir} /> : null}

        <div className="bo-filterbar__field">
          <Label htmlFor="vehicles-search">Cari</Label>
          <input
            className="bo-select"
            id="vehicles-search"
            name="q"
            type="search"
            defaultValue={query.q ?? ""}
            placeholder="Plat, pelanggan, atau merek"
            autoComplete="off"
          />
        </div>

        <div className="bo-filterbar__actions">
          <Button type="submit" variant="secondary">
            Cari
          </Button>
          {hasSearch || query.customerId ? (
            <Link className="bo-link-button" href={resetHref}>
              Hapus semua filter
            </Link>
          ) : null}
        </div>
      </form>

      {query.customerId ? (
        <div className="bo-chips" aria-label="Filter aktif">
          <Link
            className="bo-chip-link"
            href={removeCustomerHref}
            aria-label="Hapus filter pelanggan"
          >
            Hanya kendaraan milik satu pelanggan
            <span aria-hidden="true">×</span>
          </Link>
        </div>
      ) : null}
    </>
  );
}
