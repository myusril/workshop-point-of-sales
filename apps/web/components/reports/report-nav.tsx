import type { ReportKind } from "@workshop-pos/contracts";
import Link from "next/link";

import { REPORT_LABELS } from "@/components/reports/report-labels";
import { buildQueryHref } from "@/lib/query";

const REPORT_ORDER: readonly ReportKind[] = [
  "daily-sales",
  "payment-mix",
  "service-product",
  "technician-productivity",
  "stock-valuation",
  "end-of-day",
];

interface ReportNavProps {
  current: ReportKind;
  query: Record<string, string | undefined>;
}

/** Report switcher: links keep the active date and outlet filters. */
export function ReportNav({ current, query }: ReportNavProps) {
  return (
    <nav className="bo-tabs" aria-label="Jenis laporan">
      {REPORT_ORDER.map((kind) => (
        <Link
          key={kind}
          href={buildQueryHref("/reports", query, { report: kind, page: undefined })}
          className="bo-tabs__link"
          aria-current={kind === current ? "page" : undefined}
        >
          {REPORT_LABELS[kind]}
        </Link>
      ))}
    </nav>
  );
}
