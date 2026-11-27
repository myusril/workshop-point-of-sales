import type { OutletSummary, ReportKind } from "@workshop-pos/contracts";
import { Download } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ReportFilterProps {
  kind: ReportKind;
  from: string;
  to: string;
  outletId: string;
  outlets: readonly OutletSummary[];
  /** Only Owner/Admin may export; the server enforces this too. */
  canExport: boolean;
}

const SINGLE_DATE_KINDS: readonly ReportKind[] = ["end-of-day"];

export function ReportFilter({
  kind,
  from,
  to,
  outletId,
  outlets,
  canExport,
}: ReportFilterProps) {
  const singleDate = SINGLE_DATE_KINDS.includes(kind);
  const valuation = kind === "stock-valuation";

  return (
    <form className="bo-filterbar" method="get" action="/reports" aria-label="Filter laporan">
      <input type="hidden" name="report" value={kind} />

      <div className="bo-filterbar__field">
        <label htmlFor="report-from">{singleDate ? "Tanggal" : "Dari tanggal"}</label>
        <Input id="report-from" name="from" type="date" defaultValue={from} required />
      </div>

      <div className="bo-filterbar__field">
        <label htmlFor="report-to">{valuation ? "Tanggal valuasi" : "Sampai tanggal"}</label>
        <Input
          id="report-to"
          name="to"
          type="date"
          defaultValue={to}
          required={!singleDate}
          disabled={singleDate}
          aria-describedby={singleDate ? "report-to-hint" : undefined}
        />
        {singleDate ? (
          <span id="report-to-hint" className="bo-muted">
            Laporan akhir hari memakai satu tanggal.
          </span>
        ) : null}
      </div>

      <div className="bo-filterbar__field">
        <label htmlFor="report-outlet">Outlet</label>
        <select
          id="report-outlet"
          name="outletId"
          className="bo-select"
          defaultValue={outletId}
          disabled={outlets.length <= 1}
        >
          {outlets.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bo-filterbar__actions">
        <button type="submit" className={buttonVariants({ variant: "primary" })}>
          Tampilkan
        </button>
        {canExport ? (
          <a
            className={buttonVariants({ variant: "secondary" })}
            href={`/api/v1/export/reports/${kind}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&outletId=${encodeURIComponent(outletId)}`}
            download
          >
            <Download aria-hidden="true" />
            Unduh CSV
          </a>
        ) : null}
      </div>
    </form>
  );
}
