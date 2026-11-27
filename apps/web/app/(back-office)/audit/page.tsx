import { AuthError, can, type AuthContext } from "@workshop-pos/auth";
import {
  auditListQuerySchema,
  type AuditFiltersResponse,
  type AuditListQuery,
  type AuditListResponse,
  type OutletSummary,
} from "@workshop-pos/contracts";
import { addBusinessDays, todayBusinessDate } from "@workshop-pos/core";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/back-office/page-header";
import { Pagination } from "@/components/back-office/pagination";
import { ErrorState } from "@/components/back-office/state-block";
import { TableSkeleton } from "@/components/back-office/table-skeleton";
import { AuditFilter } from "@/components/audit/audit-filter";
import { AuditTable } from "@/components/audit/audit-table";
import { buttonVariants } from "@/components/ui/button";
import {
  getAuthRuntime,
  getSessionPayload,
  requirePageAuthContext,
} from "@/lib/auth/server";
import { listAuditEntries, listAuditFilters } from "@/lib/audit-service";

export const metadata: Metadata = {
  title: "Log audit — Workshop POS",
};

export const dynamic = "force-dynamic";

interface AuditPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);
  if (!can(session.user.role, "view_audit_log")) forbidden();

  const to = todayBusinessDate();
  const from = addBusinessDays(to, -29);
  const parsed = auditListQuerySchema.safeParse({
    from: firstValue(params.from) || from,
    to: firstValue(params.to) || to,
    actorId: firstValue(params.actorId) || undefined,
    action: firstValue(params.action) || undefined,
    entityType: firstValue(params.entityType) || undefined,
    entityId: firstValue(params.entityId) || undefined,
    outletId: firstValue(params.outletId) || undefined,
    page: firstValue(params.page) || undefined,
    pageSize: firstValue(params.pageSize) || undefined,
  });
  const query: AuditListQuery = parsed.success
    ? parsed.data
    : auditListQuerySchema.parse({ from, to });

  const filterQuery = {
    from: query.from,
    to: query.to,
    actorId: query.actorId,
    action: query.action,
    entityType: query.entityType,
    entityId: query.entityId,
    outletId: query.outletId,
    pageSize: query.pageSize === 25 ? undefined : String(query.pageSize),
  };

  return (
    <main className="bo-page">
      <PageHeader
        title="Log audit"
        description="Catatan tindakan sensitif yang hanya dapat dibaca. Tidak ada operasi ubah atau hapus pada log ini."
      />

      <div className="bo-stack">
        <Suspense
          fallback={<TableSkeleton label="Memuat log audit…" testId="audit-loading" />}
        >
          <AuditData
            context={authContext}
            query={{ ...query, from: query.from ?? from, to: query.to ?? to }}
            filterQuery={filterQuery}
            outlets={authContext.outlets}
          />
        </Suspense>
      </div>
    </main>
  );
}

interface AuditDataProps {
  context: AuthContext;
  query: AuditListQuery;
  filterQuery: Record<string, string | undefined>;
  outlets: OutletSummary[];
}

type LoadedAudit =
  | { ok: true; entries: AuditListResponse; filters: AuditFiltersResponse }
  | { ok: false; message: string };

async function loadAudit(
  context: AuthContext,
  query: AuditListQuery,
): Promise<LoadedAudit> {
  const db = getAuthRuntime().db;
  try {
    const [entries, filters] = await Promise.all([
      listAuditEntries(db, context, query),
      listAuditFilters(db, context),
    ]);
    return { ok: true, entries, filters };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AuthError
          ? error.message
          : "Log audit gagal dimuat. Periksa koneksi, lalu coba lagi.",
    };
  }
}

async function AuditData({ context, query, filterQuery, outlets }: AuditDataProps) {
  const result = await loadAudit(context, query);

  if (!result.ok) {
    return (
      <section className="bo-panel" aria-labelledby="audit-error-title">
        <div className="bo-panel__header">
          <h2 className="bo-panel__title" id="audit-error-title">
            Log audit
          </h2>
        </div>
        <div className="bo-panel__body">
          <ErrorState
            title="Log audit gagal dimuat."
            actions={
              <Link className={buttonVariants({ variant: "secondary" })} href="/audit">
                Coba lagi
              </Link>
            }
          >
            {result.message}
          </ErrorState>
        </div>
      </section>
    );
  }

  return (
    <>
      <AuditFilter
        from={filterQuery.from ?? ""}
        to={filterQuery.to ?? ""}
        actorId={filterQuery.actorId ?? ""}
        action={filterQuery.action ?? ""}
        entityType={filterQuery.entityType ?? ""}
        outletId={filterQuery.outletId ?? ""}
        filters={result.filters}
        outlets={outlets}
      />

      <section className="bo-panel" aria-labelledby="audit-panel-title">
        <div className="bo-panel__header">
          <h2 className="bo-panel__title" id="audit-panel-title">
            Entri audit
          </h2>
          <span className="bo-panel__meta">{result.entries.total} entri</span>
        </div>
        <div className="bo-panel__body bo-panel__body--flush">
          <AuditTable items={result.entries.items} />
        </div>
        <div className="bo-panel__body">
          <Pagination
            page={result.entries.page}
            pageSize={result.entries.pageSize}
            total={result.entries.total}
            totalPages={result.entries.totalPages}
            basePath="/audit"
            query={filterQuery}
            label="entri audit"
          />
        </div>
      </section>
    </>
  );
}
