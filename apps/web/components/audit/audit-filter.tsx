import type { AuditFiltersResponse, OutletSummary } from "@workshop-pos/contracts";

import { auditActionLabel } from "@/components/audit/audit-labels";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuditFilterProps {
  from: string;
  to: string;
  actorId: string;
  action: string;
  entityType: string;
  outletId: string;
  filters: AuditFiltersResponse;
  outlets: readonly OutletSummary[];
}

export function AuditFilter({
  from,
  to,
  actorId,
  action,
  entityType,
  outletId,
  filters,
  outlets,
}: AuditFilterProps) {
  return (
    <form className="bo-filterbar" method="get" action="/audit" aria-label="Filter log audit">
      <div className="bo-filterbar__field">
        <label htmlFor="audit-from">Dari tanggal</label>
        <Input id="audit-from" name="from" type="date" defaultValue={from} />
      </div>
      <div className="bo-filterbar__field">
        <label htmlFor="audit-to">Sampai tanggal</label>
        <Input id="audit-to" name="to" type="date" defaultValue={to} />
      </div>
      <div className="bo-filterbar__field">
        <label htmlFor="audit-actor">Pelaku</label>
        <select id="audit-actor" name="actorId" className="bo-select" defaultValue={actorId}>
          <option value="">Semua pelaku</option>
          {filters.actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>
      </div>
      <div className="bo-filterbar__field">
        <label htmlFor="audit-action">Jenis aksi</label>
        <select id="audit-action" name="action" className="bo-select" defaultValue={action}>
          <option value="">Semua aksi</option>
          {filters.actions.map((value) => (
            <option key={value} value={value}>
              {auditActionLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="bo-filterbar__field">
        <label htmlFor="audit-entity">Jenis data</label>
        <select id="audit-entity" name="entityType" className="bo-select" defaultValue={entityType}>
          <option value="">Semua data</option>
          {filters.entityTypes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      {outlets.length > 1 ? (
        <div className="bo-filterbar__field">
          <label htmlFor="audit-outlet">Outlet</label>
          <select id="audit-outlet" name="outletId" className="bo-select" defaultValue={outletId}>
            <option value="">Semua outlet</option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="bo-filterbar__actions">
        <button type="submit" className={buttonVariants({ variant: "primary" })}>
          Terapkan filter
        </button>
        <a className={buttonVariants({ variant: "secondary" })} href="/audit">
          Hapus filter
        </a>
      </div>
    </form>
  );
}
