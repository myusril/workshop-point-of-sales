import { and, eq } from "drizzle-orm";

import {
  assertPermission,
  AuthError,
  type AuthContext,
} from "@workshop-pos/auth";
import {
  OUTLET_SETTINGS_DEFAULTS,
  type Branding,
  type OutletSettings,
  type UpdateBrandingRequest,
  type UpdateOutletSettingsRequest,
} from "@workshop-pos/contracts";
import {
  appendAuditEntry,
  businesses,
  outlets,
  settings,
  user,
  type Database,
} from "@workshop-pos/db";

/**
 * Per-outlet settings and business branding (PRD FR-070, FR-071).
 *
 * Owner-only. Every successful change writes one append-only audit row with a
 * field-level before/after snapshot. Existing orders are never touched: their
 * tax rate and figures were snapshotted at creation (FR-013/FR-016/FR-070).
 */

export const DEFAULT_PRODUCT_NAME = "Workshop POS";

/** Rendered whenever a business has no stored branding yet. */
export const DEFAULT_BRANDING: Branding = {
  productName: DEFAULT_PRODUCT_NAME,
  logoPath: null,
};

const BRANDING_COLUMNS = {
  productDisplayName: businesses.productDisplayName,
  logoPath: businesses.logoPath,
};

type BrandingRow = {
  productDisplayName: string | null;
  logoPath: string | null;
};

function toBranding(row: BrandingRow | undefined): Branding {
  return {
    productName: row?.productDisplayName?.trim() || DEFAULT_PRODUCT_NAME,
    logoPath: row?.logoPath?.trim() || null,
  };
}

/**
 * Branding read for every authenticated role (FR-071).
 *
 * Deliberately takes no `AuthContext`: the wordmark, page title, and login
 * card are not settings, so reading them must not require `manage_settings`.
 * Writing still goes through `updateBranding`, which stays Owner-only.
 */
export async function getBrandingForBusiness(
  db: Database,
  businessId: string,
): Promise<Branding> {
  const [row] = await db
    .select(BRANDING_COLUMNS)
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  return toBranding(row);
}

/**
 * Branding for the unauthenticated login screen. The product is installed for
 * one business (`packages/db/src/schema/tenancy.ts`), so the first row is the
 * installation; a missing row falls back to the default wordmark.
 */
export async function getInstallationBranding(db: Database): Promise<Branding> {
  const [row] = await db
    .select(BRANDING_COLUMNS)
    .from(businesses)
    .orderBy(businesses.id)
    .limit(1);
  return toBranding(row);
}

interface SettingsRow {
  id: string;
  taxRate: number;
  cashierDiscountCapPercent: number;
  idleTimeoutMinutes: number;
  receiptPaperWidth: 58 | 80;
  voidReasonMinLength: number;
  receiptPrefix: string;
  receiptHeaderText: string | null;
  receiptFooterText: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
}

function snapshot(row: SettingsRow | null) {
  if (!row) return { ...OUTLET_SETTINGS_DEFAULTS };
  return {
    taxRate: row.taxRate,
    cashierDiscountCapPercent: row.cashierDiscountCapPercent,
    idleTimeoutMinutes: row.idleTimeoutMinutes,
    receiptPaperWidth: row.receiptPaperWidth,
    voidReasonMinLength: row.voidReasonMinLength,
    receiptPrefix: row.receiptPrefix,
    receiptHeaderText: row.receiptHeaderText,
    receiptFooterText: row.receiptFooterText,
  };
}

async function loadOutletForSettings(
  db: Database,
  businessId: string,
  outletId: string,
): Promise<{ id: string; name: string }> {
  const [outlet] = await db
    .select({ id: outlets.id, name: outlets.name })
    .from(outlets)
    .where(and(eq(outlets.id, outletId), eq(outlets.businessId, businessId)))
    .limit(1);
  if (!outlet) throw AuthError.notFound("Outlet tidak ditemukan.");
  return outlet;
}

async function loadSettingsRow(
  db: Database,
  businessId: string,
  outletId: string,
): Promise<SettingsRow | null> {
  const [raw] = await db
    .select({
      id: settings.id,
      taxRate: settings.taxRate,
      cashierDiscountCapPercent: settings.cashierDiscountCapPercent,
      idleTimeoutMinutes: settings.idleTimeoutMinutes,
      receiptPaperWidth: settings.receiptPaperWidth,
      voidReasonMinLength: settings.voidReasonMinLength,
      receiptPrefix: settings.receiptPrefix,
      receiptHeaderText: settings.receiptHeaderText,
      receiptFooterText: settings.receiptFooterText,
      updatedBy: settings.updatedBy,
      updatedAt: settings.updatedAt,
    })
    .from(settings)
    .where(and(eq(settings.businessId, businessId), eq(settings.outletId, outletId)))
    .limit(1);
  if (!raw) return null;
  return { ...raw, receiptPaperWidth: raw.receiptPaperWidth === 80 ? 80 : 58 };
}

export async function getOutletSettings(
  db: Database,
  context: AuthContext,
  outletId: string,
): Promise<OutletSettings> {
  assertPermission(context, "manage_settings");
  const outlet = await loadOutletForSettings(db, context.user.businessId, outletId);
  const row = await loadSettingsRow(db, context.user.businessId, outletId);

  let updatedByName: string | null = null;
  if (row?.updatedBy) {
    const [editor] = await db
      .select({ name: user.name })
      .from(user)
      .where(
        and(eq(user.businessId, context.user.businessId), eq(user.id, row.updatedBy)),
      )
      .limit(1);
    updatedByName = editor?.name ?? null;
  }

  const values = snapshot(row);
  return {
    outletId: outlet.id,
    outletName: outlet.name,
    ...values,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    updatedByName,
  };
}

export async function updateOutletSettings(
  db: Database,
  context: AuthContext,
  input: UpdateOutletSettingsRequest,
): Promise<OutletSettings> {
  assertPermission(context, "manage_settings");
  const outlet = await loadOutletForSettings(db, context.user.businessId, input.outletId);

  const updated = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const existing = await loadSettingsRow(
      txDb,
      context.user.businessId,
      input.outletId,
    );
    const before = snapshot(existing);
    const values = {
      taxRate: input.taxRate,
      cashierDiscountCapPercent: input.cashierDiscountCapPercent,
      idleTimeoutMinutes: input.idleTimeoutMinutes,
      receiptPaperWidth: input.receiptPaperWidth,
      voidReasonMinLength: input.voidReasonMinLength,
      receiptPrefix: input.receiptPrefix,
      receiptHeaderText: input.receiptHeaderText,
      receiptFooterText: input.receiptFooterText,
      updatedBy: context.user.id,
    };

    const row = existing
      ? (
          await tx
            .update(settings)
            .set({ ...values, updatedAt: new Date() })
            .where(
              and(
                eq(settings.businessId, context.user.businessId),
                eq(settings.outletId, input.outletId),
              ),
            )
            .returning({ id: settings.id, updatedAt: settings.updatedAt })
        )[0]
      : (
          await tx
            .insert(settings)
            .values({
              businessId: context.user.businessId,
              outletId: input.outletId,
              ...values,
            })
            .returning({ id: settings.id, updatedAt: settings.updatedAt })
        )[0];

    if (!row) throw new Error("Settings write returned no row");

    await appendAuditEntry(txDb, {
      businessId: context.user.businessId,
      outletIds: [...context.outletIds, outlet.id],
    }, {
      action: "settings.updated",
      entityType: "settings",
      entityId: row.id,
      actorId: context.user.id,
      outletId: outlet.id,
      before,
      after: snapshot({
        id: row.id,
        ...values,
        updatedAt: row.updatedAt,
      }),
    });

    return { id: row.id, updatedAt: row.updatedAt };
  });

  return {
    outletId: outlet.id,
    outletName: outlet.name,
    ...snapshot({
      id: updated.id,
      ...input,
      updatedBy: context.user.id,
      updatedAt: updated.updatedAt,
    }),
    updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : null,
    updatedByName: context.user.name,
  };
}

export async function getBranding(
  db: Database,
  context: AuthContext,
): Promise<Branding> {
  assertPermission(context, "manage_settings");
  const [row] = await db
    .select(BRANDING_COLUMNS)
    .from(businesses)
    .where(eq(businesses.id, context.user.businessId))
    .limit(1);
  if (!row) throw AuthError.notFound("Bisnis tidak ditemukan.");

  return toBranding(row);
}

export async function updateBranding(
  db: Database,
  context: AuthContext,
  input: UpdateBrandingRequest,
): Promise<Branding> {
  assertPermission(context, "manage_settings");
  const before = await getBranding(db, context);

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const [row] = await tx
      .update(businesses)
      .set({
        productDisplayName: input.productName,
        logoPath: input.logoPath,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, context.user.businessId))
      .returning({ id: businesses.id });
    if (!row) throw AuthError.notFound("Bisnis tidak ditemukan.");

    await appendAuditEntry(txDb, {
      businessId: context.user.businessId,
      outletIds: context.outletIds,
    }, {
      action: "branding.updated",
      entityType: "business",
      entityId: context.user.businessId,
      actorId: context.user.id,
      outletId: null,
      before,
      after: input,
    });
  });

  return { productName: input.productName, logoPath: input.logoPath };
}
