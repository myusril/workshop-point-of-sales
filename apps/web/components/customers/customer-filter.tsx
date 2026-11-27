import type { CustomerListQuery } from "@workshop-pos/contracts";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface CustomerFilterProps {
  query: CustomerListQuery;
  hasSearch: boolean;
  resetHref: string;
}

/**
 * URL-backed customer search (§6.6). Name and full phone both match on the
 * server, but results always render the masked phone. The search applies on
 * explicit submit so the result count never changes unseen.
 */
export function CustomerFilter({ query, hasSearch, resetHref }: CustomerFilterProps) {
  return (
    <form className="bo-filterbar" action="/customers" method="get" role="search">
      {query.pageSize !== 25 ? <input type="hidden" name="pageSize" value={query.pageSize} /> : null}
      {query.sort !== "name" ? <input type="hidden" name="sort" value={query.sort} /> : null}
      {query.dir !== "asc" ? <input type="hidden" name="dir" value={query.dir} /> : null}

      <div className="bo-filterbar__field">
        <Label htmlFor="customers-search">Cari</Label>
        <input
          className="bo-select"
          id="customers-search"
          name="q"
          type="search"
          defaultValue={query.q ?? ""}
          placeholder="Nama atau nomor telepon"
          autoComplete="off"
        />
      </div>

      <div className="bo-filterbar__actions">
        <Button type="submit" variant="secondary">
          Cari
        </Button>
        {hasSearch ? (
          <Link className="bo-link-button" href={resetHref}>
            Hapus pencarian
          </Link>
        ) : null}
      </div>
    </form>
  );
}
