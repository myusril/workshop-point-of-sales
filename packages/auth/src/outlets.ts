import { and, asc, count, eq, ne } from "drizzle-orm";

import type {
  CreateOutletRequest,
  Outlet,
  OutletListResponse,
  UpdateOutletRequest,
} from "@workshop-pos/contracts";
import {
  appendAuditEntry,
  outlets as outletsTable,
  settings as settingsTable,
  type Database,
} from "@workshop-pos/db";

import { acquireAdvisoryXactLock, asDatabase } from "./db-locks.ts";
import { AuthError, uniqueViolationConstraint } from "./errors.ts";
import { assertPermission } from "./guard.ts";
import type { AuthContext } from "./types.ts";

const OUTLET_COLUMNS = {
  id: outletsTable.id,
  name: outletsTable.name,
  address: outletsTable.address,
  phone: outletsTable.phone,
  isActive: outletsTable.isActive,
  createdAt: outletsTable.createdAt,
  updatedAt: outletsTable.updatedAt,
} as const;

interface OutletRow {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ACTIVE_OUTLET_GUARD_MESSAGE =
  "Outlet aktif terakhir tidak dapat dinonaktifkan.";
const INACTIVE_CREATE_MESSAGE =
  "Tidak dapat membuat outlet nonaktif karena belum ada outlet aktif.";

function outletAdvisoryKey(businessId: string): string {
  return `outlets:${businessId}`;
}

async function countActiveOutlets(
  db: Database,
  businessId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(outletsTable)
    .where(
      and(
        eq(outletsTable.businessId, businessId),
        eq(outletsTable.isActive, true),
      ),
    );
  return row?.value ?? 0;
}

function toOutlet(row: OutletRow): Outlet {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertOutletNameAvailable(
  db: Database,
  businessId: string,
  name: string,
  excludeOutletId?: string,
): Promise<void> {
  const scope = excludeOutletId
    ? and(
        eq(outletsTable.businessId, businessId),
        ne(outletsTable.id, excludeOutletId),
      )
    : eq(outletsTable.businessId, businessId);

  const [existing] = await db
    .select({ id: outletsTable.id })
    .from(outletsTable)
    .where(and(scope, eq(outletsTable.name, name)))
    .limit(1);

  if (existing) {
    throw AuthError.conflict("Nama outlet sudah digunakan.", {
      name: ["Nama outlet sudah digunakan."],
    });
  }
}

/** Every outlet of the business, including inactive ones (management view). */
export async function listOutlets(
  db: Database,
  context: AuthContext,
): Promise<OutletListResponse> {
  assertPermission(context, "manage_outlets");

  const rows = await db
    .select(OUTLET_COLUMNS)
    .from(outletsTable)
    .where(eq(outletsTable.businessId, context.user.businessId))
    .orderBy(asc(outletsTable.name));

  return { items: rows.map(toOutlet) };
}

/** Owner-only outlet creation (FR-009), with default per-outlet settings. */
export async function createOutlet(
  db: Database,
  context: AuthContext,
  input: CreateOutletRequest,
): Promise<Outlet> {
  assertPermission(context, "manage_outlets");
  const businessId = context.user.businessId;
  await assertOutletNameAvailable(db, businessId, input.name);

  try {
    const created = await db.transaction(async (tx) => {
      // The business must always keep one active outlet: staff scope, login and
      // every report resolve through it. Serialize the decision per business.
      if (input.isActive === false) {
        await acquireAdvisoryXactLock(tx, outletAdvisoryKey(businessId));
        if ((await countActiveOutlets(asDatabase(tx), businessId)) === 0) {
          throw AuthError.validation({ isActive: [INACTIVE_CREATE_MESSAGE] });
        }
      }

      const [row] = await tx
        .insert(outletsTable)
        .values({
          businessId,
          name: input.name,
          address: input.address ?? null,
          phone: input.phone ?? null,
          isActive: input.isActive ?? true,
        })
        .returning(OUTLET_COLUMNS);

      if (!row) throw new Error("Outlet insert returned no row");

      await tx.insert(settingsTable).values({
        businessId,
        outletId: row.id,
        updatedBy: context.user.id,
      });

      await appendAuditEntry(asDatabase(tx), {
        businessId,
        outletIds: [...context.outletIds, row.id],
      }, {
        action: "outlet.created",
        entityType: "outlet",
        entityId: row.id,
        actorId: context.user.id,
        outletId: row.id,
        after: {
          name: row.name,
          address: row.address,
          phone: row.phone,
          isActive: row.isActive,
        },
      });

      return row;
    });

    return toOutlet(created);
  } catch (error) {
    if (uniqueViolationConstraint(error) === "outlets_business_id_name_unique") {
      throw AuthError.conflict("Nama outlet sudah digunakan.", {
        name: ["Nama outlet sudah digunakan."],
      });
    }
    throw error;
  }
}

/** Owner-only outlet edit (FR-009). Settings editing belongs to WP8. */
export async function updateOutlet(
  db: Database,
  context: AuthContext,
  outletId: string,
  input: UpdateOutletRequest,
): Promise<Outlet> {
  assertPermission(context, "manage_outlets");
  const businessId = context.user.businessId;

  const [target] = await db
    .select(OUTLET_COLUMNS)
    .from(outletsTable)
    .where(
      and(eq(outletsTable.id, outletId), eq(outletsTable.businessId, businessId)),
    )
    .limit(1);

  if (!target) throw AuthError.notFound("Outlet tidak ditemukan.");

  const nextName = input.name ?? target.name;
  if (nextName !== target.name) {
    await assertOutletNameAvailable(db, businessId, nextName, target.id);
  }

  const hasChanges =
    nextName !== target.name ||
    (input.address !== undefined && input.address !== target.address) ||
    (input.phone !== undefined && input.phone !== target.phone) ||
    (input.isActive !== undefined && input.isActive !== target.isActive);

  if (!hasChanges) return toOutlet(target);

  const nextIsActive = input.isActive ?? target.isActive;
  const deactivating = target.isActive && !nextIsActive;

  try {
    const updated = await db.transaction(async (tx) => {
      if (deactivating) {
        // Serialize per business so two concurrent deactivations cannot each
        // see two active outlets and leave the business with none.
        await acquireAdvisoryXactLock(tx, outletAdvisoryKey(businessId));
        if ((await countActiveOutlets(asDatabase(tx), businessId)) <= 1) {
          throw AuthError.validation({
            isActive: [ACTIVE_OUTLET_GUARD_MESSAGE],
          });
        }
      }

      const [row] = await tx
        .update(outletsTable)
        .set({
          ...(nextName !== target.name ? { name: nextName } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(outletsTable.id, target.id),
            eq(outletsTable.businessId, businessId),
          ),
        )
        .returning(OUTLET_COLUMNS);

      if (!row) throw new Error("Outlet update returned no row");

      await appendAuditEntry(asDatabase(tx), {
        businessId,
        outletIds: [...context.outletIds, row.id],
      }, {
        action: "outlet.updated",
        entityType: "outlet",
        entityId: row.id,
        actorId: context.user.id,
        outletId: row.id,
        before: {
          name: target.name,
          address: target.address,
          phone: target.phone,
          isActive: target.isActive,
        },
        after: {
          name: row.name,
          address: row.address,
          phone: row.phone,
          isActive: row.isActive,
        },
      });

      return row;
    });

    return toOutlet(updated);
  } catch (error) {
    if (uniqueViolationConstraint(error) === "outlets_business_id_name_unique") {
      throw AuthError.conflict("Nama outlet sudah digunakan.", {
        name: ["Nama outlet sudah digunakan."],
      });
    }
    throw error;
  }
}
