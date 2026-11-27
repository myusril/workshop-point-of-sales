import { AuthError, can, type AuthContext } from "@workshop-pos/auth";
import {
  reportKindSchema,
  type ReportKind,
  type ReportRangeQuery,
  type ReportResponse,
} from "@workshop-pos/contracts";
import { isBusinessDate, todayBusinessDate } from "@workshop-pos/core";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { PageHeader } from "@/components/back-office/page-header";
import { EmptyState, ErrorState } from "@/components/back-office/state-block";
import { TableSkeleton } from "@/components/back-office/table-skeleton";
import { ReportFilter } from "@/components/reports/report-filter";
import {
  REPORT_DESCRIPTIONS,
  REPORT_LABELS,
} from "@/components/reports/report-labels";
import { ReportNav } from "@/components/reports/report-nav";
import {
  DailySalesTable,
  PaymentMixTable,
  SalesFiguresSummary,
  ServiceProductTable,
  StatusCountsTable,
  StockValuationTable,
  TechnicianTable,
  VoidsTable,
} from "@/components/reports/report-tables";
import { buttonVariants } from "@/components/ui/button";
import {
  getAuthRuntime,
  getSessionPayload,
  requirePageAuthContext,
} from "@/lib/auth/server";
import { buildQueryHref } from "@/lib/query";
import { formatWibDate } from "@/lib/format";
import {
  getDailySalesReport,
  getEndOfDayReport,
  getPaymentMixReport,
  getServiceProductReport,
  getStockValuationReport,
  getTechnicianProductivityReport,
} from "@/lib/report-service";

export const metadata: Metadata = {
  title: "Laporan — Workshop POS",
};

export const dynamic = "force-dynamic";

interface ReportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function resolveDate(value: string | undefined, fallback: string): string {
  return value && isBusinessDate(value) ? value : fallback;
}

function resolveOutletId(context: AuthContext, requested: string | undefined): string {
  if (requested && context.outlets.some((outlet) => outlet.id === requested)) {
    return requested;
  }
  if (
    context.activeOutletId &&
    context.outlets.some((outlet) => outlet.id === context.activeOutletId)
  ) {
    return context.activeOutletId;
  }
  return context.outlets[0]?.id ?? "";
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);

  if (!can(session.user.role, "view_reports")) forbidden();

  const parsedKind = reportKindSchema.safeParse(firstValue(params.report));
  const kind: ReportKind = parsedKind.success ? parsedKind.data : "daily-sales";
  const today = todayBusinessDate();
  const from = resolveDate(firstValue(params.from), today);
  const to = resolveDate(firstValue(params.to), from);
  const outletId = resolveOutletId(authContext, firstValue(params.outletId));
  const canExport = can(session.user.role, "export_csv");

  return (
    <main className="bo-page">
      <PageHeader title="Laporan" description={REPORT_DESCRIPTIONS[kind]} />

      <div className="bo-stack">
        <ReportNav current={kind} query={{ from, to, outletId }} />
        <ReportFilter
          kind={kind}
          from={from}
          to={to}
          outletId={outletId}
          outlets={authContext.outlets}
          canExport={canExport}
        />

        <Suspense
          fallback={<TableSkeleton label="Memuat laporan…" testId="reports-loading" />}
        >
          <ReportData
            kind={kind}
            from={from}
            to={to}
            outletId={outletId}
            context={authContext}
          />
        </Suspense>
      </div>
    </main>
  );
}

interface ReportDataProps {
  kind: ReportKind;
  from: string;
  to: string;
  outletId: string;
  context: AuthContext;
}

type LoadedReport =
  | { ok: true; report: ReportResponse }
  | { ok: false; message: string };

async function loadReport({
  kind,
  from,
  to,
  outletId,
  context,
}: ReportDataProps): Promise<LoadedReport> {
  const db = getAuthRuntime().db;
  const range: ReportRangeQuery = { from, to, outletId };

  try {
    switch (kind) {
      case "daily-sales":
        return { ok: true, report: await getDailySalesReport(db, context, range) };
      case "payment-mix":
        return { ok: true, report: await getPaymentMixReport(db, context, range) };
      case "service-product":
        return { ok: true, report: await getServiceProductReport(db, context, range) };
      case "technician-productivity":
        return {
          ok: true,
          report: await getTechnicianProductivityReport(db, context, range),
        };
      case "stock-valuation":
        return {
          ok: true,
          report: await getStockValuationReport(db, context, { asOf: to, outletId }),
        };
      case "end-of-day":
        return {
          ok: true,
          report: await getEndOfDayReport(db, context, { date: from, outletId }),
        };
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AuthError
          ? error.message
          : "Laporan gagal dimuat. Periksa koneksi, lalu coba lagi.",
    };
  }
}

async function ReportData(props: ReportDataProps) {
  const result = await loadReport(props);
  const retryHref = buildQueryHref("/reports", {
    report: props.kind,
    from: props.from,
    to: props.to,
    outletId: props.outletId,
  });

  if (!result.ok) {
    return (
      <section className="bo-panel" aria-labelledby="report-error-title">
        <div className="bo-panel__header">
          <h2 className="bo-panel__title" id="report-error-title">
            Laporan
          </h2>
        </div>
        <div className="bo-panel__body">
          <ErrorState
            title="Laporan gagal dimuat."
            actions={
              <Link className={buttonVariants({ variant: "secondary" })} href={retryHref}>
                Coba lagi
              </Link>
            }
          >
            {result.message} Angka tidak ditampilkan agar tidak menyesatkan.
          </ErrorState>
        </div>
      </section>
    );
  }

  return <ReportView report={result.report} />;
}

function ReportPanel({
  title,
  outletName,
  children,
  flush = false,
}: {
  title: string;
  outletName: string;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="bo-panel" aria-labelledby="report-panel-title">
      <div className="bo-panel__header">
        <h2 className="bo-panel__title" id="report-panel-title">
          {title}
        </h2>
        <span className="bo-panel__meta">{outletName}</span>
      </div>
      <div className={`bo-panel__body${flush ? " bo-panel__body--flush" : ""}`}>{children}</div>
    </section>
  );
}

function ReportView({ report }: { report: ReportResponse }) {
  switch (report.report) {
    case "daily-sales":
      return (
        <ReportPanel title={REPORT_LABELS[report.report]} outletName={report.outlet.name} flush>
          <DailySalesTable report={report} />
        </ReportPanel>
      );
    case "payment-mix":
      return (
        <ReportPanel title={REPORT_LABELS[report.report]} outletName={report.outlet.name} flush>
          <PaymentMixTable report={report} />
        </ReportPanel>
      );
    case "service-product":
      return (
        <ReportPanel title={REPORT_LABELS[report.report]} outletName={report.outlet.name} flush>
          <ServiceProductTable report={report} />
        </ReportPanel>
      );
    case "technician-productivity":
      return (
        <ReportPanel title={REPORT_LABELS[report.report]} outletName={report.outlet.name}>
          <TechnicianTable report={report} />
        </ReportPanel>
      );
    case "stock-valuation":
      return (
        <ReportPanel
          title={`Valuasi stok per ${formatWibDate(`${report.asOf}T00:00:00+07:00`)}`}
          outletName={report.outlet.name}
          flush
        >
          <StockValuationTable report={report} />
        </ReportPanel>
      );
    case "end-of-day": {
      const empty = report.figures.orderCount === 0 && report.voids.length === 0;
      return (
        <div className="bo-stack">
          {empty ? (
            <EmptyState title={`Tidak ada transaksi pada ${report.date}.`}>
              Angka di bawah adalah nol yang eksplisit; tidak ada baris yang dikarang.
            </EmptyState>
          ) : null}
          <section className="bo-panel" aria-labelledby="report-panel-title">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title" id="report-panel-title">
                Akhir hari {formatWibDate(`${report.date}T00:00:00+07:00`)}
              </h2>
              <span className="bo-panel__meta">{report.outlet.name}</span>
            </div>
            <div className="bo-panel__body">
              <SalesFiguresSummary report={report} />
            </div>
          </section>
          <section className="bo-panel" aria-labelledby="eod-status-title">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title" id="eod-status-title">
                Jumlah transaksi menurut status
              </h2>
            </div>
            <div className="bo-panel__body bo-panel__body--flush">
              <StatusCountsTable counts={report.countsByStatus} />
            </div>
          </section>
          <section className="bo-panel" aria-labelledby="eod-payment-title">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title" id="eod-payment-title">
                Komposisi pembayaran
              </h2>
            </div>
            <div className="bo-panel__body bo-panel__body--flush">
              <PaymentMixTable
                report={{
                  report: "payment-mix",
                  outlet: report.outlet,
                  from: report.date,
                  to: report.date,
                  generatedAt: report.generatedAt,
                  ...report.paymentMix,
                }}
              />
            </div>
          </section>
          <section className="bo-panel" aria-labelledby="eod-void-title">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title" id="eod-void-title">
                Transaksi dibatalkan
              </h2>
            </div>
            <div className="bo-panel__body">
              <VoidsTable report={report} />
            </div>
          </section>
        </div>
      );
    }
  }
}
