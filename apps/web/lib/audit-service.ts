import { and, asc, count, desc, eq, gte, lt } from "drizzle-orm";

import {
  assertPermission,
  type AuthContext,
} from "@workshop-pos/auth";
import {
  type AuditEntry,
  type AuditFiltersResponse,
  type AuditListQuery,
  type AuditListResponse,
} from "@workshop-pos/contracts";
import {
  addBusinessDays,
  jakartaRangeUtc,
  todayBusinessDate,
} from "@workshop-pos/core";
import {
  auditLog,
  outlets,
  user,
  type Database,
} from "@workshop-pos/db";

/**
 * Owner-only audit log read model (PRD FR-069, AC20.1–AC20.4).
 *
 * There is deliberately no insert/update/delete export here: entries are
 * written by the action that produced them and are immutable in the database.
 */

const DEFAULT_AUDIT_DAYS = 30;

function resolveAuditRange(query: AuditListQuery): {
  from: string;
  to: string;
} {
  const to = query.to ?? todayBusinessDate();
  const from = query.from ?? addBusinessDays(to, -(DEFAULT_AUDIT_DAYS - 1));
  return { from, to };
}

function toAuditEntry(row: {
  id: string;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  outletId: string | null;
  outletName: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}): AuditEntry {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actorId: row.actorId,
    actorName: row.actorName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    outletId: row.outletId,
    outletName: row.outletName,
    reason: row.reason,
    before: row.before,
    after: row.after,
  };
}

export async function listAuditEntries(
  db: Database,
  context: AuthContext,
  query: AuditListQuery,
): Promise<AuditListResponse> {
  assertPermission(context, "view_audit_log");
  const { from, to } = await resolveAuditRange(query);
  const { start, endExclusive } = jakartaRangeUtc(from, to);

  const predicates = [
    eq(auditLog.businessId, context.user.businessId),
    gte(auditLog.createdAt, start),
    lt(auditLog.createdAt, endExclusive),
  ];
  if (query.actorId) predicates.push(eq(auditLog.actorId, query.actorId));
  if (query.action) predicates.push(eq(auditLog.action, query.action));
  if (query.entityType) predicates.push(eq(auditLog.entityType, query.entityType));
  if (query.entityId) predicates.push(eq(auditLog.entityId, query.entityId));
  if (query.outletId) predicates.push(eq(auditLog.outletId, query.outletId));

  const where = and(...predicates);
  const page = query.page;
  const pageSize = query.pageSize;

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(auditLog).where(where),
    db
      .select({
        id: auditLog.id,
        createdAt: auditLog.createdAt,
        actorId: auditLog.actorId,
        actorName: user.name,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        outletId: auditLog.outletId,
        outletName: outlets.name,
        reason: auditLog.reason,
        before: auditLog.before,
        after: auditLog.after,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorId))
      .leftJoin(outlets, eq(outlets.id, auditLog.outletId))
      .where(where)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  return {
    items: rows.map(toAuditEntry),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function listAuditFilters(
  db: Database,
  context: AuthContext,
): Promise<AuditFiltersResponse> {
  assertPermission(context, "view_audit_log");

  const [actionRows, entityRows, actorRows] = await Promise.all([
    db
      .selectDistinct({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.businessId, context.user.businessId))
      .orderBy(asc(auditLog.action)),
    db
      .selectDistinct({ entityType: auditLog.entityType })
      .from(auditLog)
      .where(eq(auditLog.businessId, context.user.businessId))
      .orderBy(asc(auditLog.entityType)),
    db
      .selectDistinct({ id: user.id, name: user.name })
      .from(auditLog)
      .innerJoin(user, eq(user.id, auditLog.actorId))
      .where(eq(auditLog.businessId, context.user.businessId))
      .orderBy(asc(user.name)),
  ]);

  return {
    actions: actionRows.map((row) => row.action),
    entityTypes: entityRows.map((row) => row.entityType),
    actors: actorRows,
  };
}
