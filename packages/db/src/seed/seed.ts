import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  businesses,
  customers,
  orders,
  outlets,
  products,
  services,
  settings,
  staffOutlets,
  stockLedger,
  user,
  vehicles,
} from "../schema/index.ts";
import {
  SEED_BUSINESS,
  SEED_CUSTOMER,
  SEED_OPENING_STOCK,
  SEED_OUTLET,
  SEED_PRODUCT,
  SEED_SERVICE,
  SEED_SETTINGS,
  SEED_USERS,
  SEED_VEHICLE,
} from "./fixtures.ts";

export interface SeedCounts {
  businesses: number;
  outlets: number;
  settings: number;
  users: number;
  staffOutlets: number;
  products: number;
  services: number;
  customers: number;
  vehicles: number;
  stockLedgerEntries: number;
  stockOnHand: bigint;
}

const SEED_USER_IDS = SEED_USERS.map((fixture) => fixture.id);
const SEED_STAFF_OUTLET_IDS = SEED_USERS.map((fixture) => fixture.staffOutletId);

/**
 * Idempotent demo seed: upserts fixed ids so `npm run db:seed` can run twice
 * without changing fixture counts. It writes no credential rows and no
 * password hash — WP3 provisions Better Auth accounts.
 *
 * Refuses to run once real data exists (any order, or any business other than
 * the seed business): the fixtures must never rewrite a live database.
 */
export async function seedDatabase(db: Database): Promise<SeedCounts> {
  return db.transaction(async (tx) => {
    const [orderCount] = await tx.select({ value: count() }).from(orders);
    if ((orderCount?.value ?? 0) > 0) {
      throw new Error(
        "Refusing to seed: the database already contains orders. " +
          "The demo seed only loads into an empty database.",
      );
    }

    const [foreignBusinessCount] = await tx
      .select({ value: count() })
      .from(businesses)
      .where(ne(businesses.id, SEED_BUSINESS.id));
    if ((foreignBusinessCount?.value ?? 0) > 0) {
      throw new Error(
        "Refusing to seed: the database contains a non-seed business. " +
          "The demo seed only loads into an empty database.",
      );
    }

    const now = new Date();

    await tx
      .insert(businesses)
      .values({
        id: SEED_BUSINESS.id,
        name: SEED_BUSINESS.name,
        timezone: SEED_BUSINESS.timezone,
      })
      .onConflictDoUpdate({
        target: businesses.id,
        set: {
          name: SEED_BUSINESS.name,
          timezone: SEED_BUSINESS.timezone,
          updatedAt: now,
        },
      });

    await tx
      .insert(outlets)
      .values({
        id: SEED_OUTLET.id,
        businessId: SEED_OUTLET.businessId,
        name: SEED_OUTLET.name,
      })
      .onConflictDoUpdate({
        target: outlets.id,
        set: {
          businessId: SEED_OUTLET.businessId,
          name: SEED_OUTLET.name,
          updatedAt: now,
        },
      });

    await tx
      .insert(settings)
      .values({
        id: SEED_SETTINGS.id,
        businessId: SEED_SETTINGS.businessId,
        outletId: SEED_SETTINGS.outletId,
        taxRate: SEED_SETTINGS.taxRate,
        cashierDiscountCapPercent: SEED_SETTINGS.cashierDiscountCapPercent,
        idleTimeoutMinutes: SEED_SETTINGS.idleTimeoutMinutes,
        receiptPaperWidth: SEED_SETTINGS.receiptPaperWidth,
        voidReasonMinLength: SEED_SETTINGS.voidReasonMinLength,
        receiptPrefix: SEED_SETTINGS.receiptPrefix,
      })
      .onConflictDoUpdate({
        target: settings.id,
        set: {
          businessId: SEED_SETTINGS.businessId,
          outletId: SEED_SETTINGS.outletId,
          taxRate: SEED_SETTINGS.taxRate,
          cashierDiscountCapPercent: SEED_SETTINGS.cashierDiscountCapPercent,
          idleTimeoutMinutes: SEED_SETTINGS.idleTimeoutMinutes,
          receiptPaperWidth: SEED_SETTINGS.receiptPaperWidth,
          voidReasonMinLength: SEED_SETTINGS.voidReasonMinLength,
          receiptPrefix: SEED_SETTINGS.receiptPrefix,
          updatedAt: now,
        },
      });

    for (const fixture of SEED_USERS) {
      await tx
        .insert(user)
        .values({
          id: fixture.id,
          name: fixture.name,
          email: fixture.email,
          businessId: SEED_BUSINESS.id,
          role: fixture.role,
          phone: fixture.phone,
        })
        .onConflictDoUpdate({
          target: user.id,
          set: {
            name: fixture.name,
            email: fixture.email,
            businessId: SEED_BUSINESS.id,
            role: fixture.role,
            phone: fixture.phone,
            updatedAt: now,
          },
        });

      await tx
        .insert(staffOutlets)
        .values({
          id: fixture.staffOutletId,
          userId: fixture.id,
          outletId: SEED_OUTLET.id,
        })
        .onConflictDoUpdate({
          target: staffOutlets.id,
          set: {
            userId: fixture.id,
            outletId: SEED_OUTLET.id,
          },
        });
    }

    await tx
      .insert(products)
      .values({
        id: SEED_PRODUCT.id,
        businessId: SEED_PRODUCT.businessId,
        outletId: SEED_PRODUCT.outletId,
        sku: SEED_PRODUCT.sku,
        name: SEED_PRODUCT.name,
        unit: SEED_PRODUCT.unit,
        cost: SEED_PRODUCT.cost,
        price: SEED_PRODUCT.price,
        lowStockThreshold: SEED_PRODUCT.lowStockThreshold,
      })
      .onConflictDoUpdate({
        target: products.id,
        set: {
          businessId: SEED_PRODUCT.businessId,
          outletId: SEED_PRODUCT.outletId,
          sku: SEED_PRODUCT.sku,
          name: SEED_PRODUCT.name,
          unit: SEED_PRODUCT.unit,
          cost: SEED_PRODUCT.cost,
          price: SEED_PRODUCT.price,
          lowStockThreshold: SEED_PRODUCT.lowStockThreshold,
          updatedAt: now,
        },
      });

    await tx
      .insert(services)
      .values({
        id: SEED_SERVICE.id,
        businessId: SEED_SERVICE.businessId,
        outletId: SEED_SERVICE.outletId,
        code: SEED_SERVICE.code,
        name: SEED_SERVICE.name,
        price: SEED_SERVICE.price,
        durationMinutes: SEED_SERVICE.durationMinutes,
      })
      .onConflictDoUpdate({
        target: services.id,
        set: {
          businessId: SEED_SERVICE.businessId,
          outletId: SEED_SERVICE.outletId,
          code: SEED_SERVICE.code,
          name: SEED_SERVICE.name,
          price: SEED_SERVICE.price,
          durationMinutes: SEED_SERVICE.durationMinutes,
          updatedAt: now,
        },
      });

    await tx
      .insert(customers)
      .values({
        id: SEED_CUSTOMER.id,
        businessId: SEED_CUSTOMER.businessId,
        name: SEED_CUSTOMER.name,
        phone: SEED_CUSTOMER.phone,
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          businessId: SEED_CUSTOMER.businessId,
          name: SEED_CUSTOMER.name,
          phone: SEED_CUSTOMER.phone,
          updatedAt: now,
        },
      });

    await tx
      .insert(vehicles)
      .values({
        id: SEED_VEHICLE.id,
        businessId: SEED_VEHICLE.businessId,
        customerId: SEED_VEHICLE.customerId,
        normalizedPlate: SEED_VEHICLE.normalizedPlate,
        brand: SEED_VEHICLE.brand,
        model: SEED_VEHICLE.model,
        year: SEED_VEHICLE.year,
        color: SEED_VEHICLE.color,
        odometer: SEED_VEHICLE.odometer,
      })
      .onConflictDoUpdate({
        target: vehicles.id,
        set: {
          businessId: SEED_VEHICLE.businessId,
          customerId: SEED_VEHICLE.customerId,
          normalizedPlate: SEED_VEHICLE.normalizedPlate,
          brand: SEED_VEHICLE.brand,
          model: SEED_VEHICLE.model,
          year: SEED_VEHICLE.year,
          color: SEED_VEHICLE.color,
          odometer: SEED_VEHICLE.odometer,
          updatedAt: now,
        },
      });

    await tx
      .insert(stockLedger)
      .values({
        id: SEED_OPENING_STOCK.id,
        businessId: SEED_OPENING_STOCK.businessId,
        outletId: SEED_OPENING_STOCK.outletId,
        productId: SEED_OPENING_STOCK.productId,
        entryType: SEED_OPENING_STOCK.entryType,
        quantityBefore: SEED_OPENING_STOCK.quantityBefore,
        quantityAfter: SEED_OPENING_STOCK.quantityAfter,
        reason: SEED_OPENING_STOCK.reason,
        sourceType: SEED_OPENING_STOCK.sourceType,
        createdBy: SEED_OPENING_STOCK.createdBy,
      })
      .onConflictDoNothing({ target: stockLedger.id });

    const [businessCount] = await tx
      .select({ value: count() })
      .from(businesses)
      .where(eq(businesses.id, SEED_BUSINESS.id));
    const [outletCount] = await tx
      .select({ value: count() })
      .from(outlets)
      .where(eq(outlets.id, SEED_OUTLET.id));
    const [settingsCount] = await tx
      .select({ value: count() })
      .from(settings)
      .where(eq(settings.id, SEED_SETTINGS.id));
    const [userCount] = await tx
      .select({ value: count() })
      .from(user)
      .where(inArray(user.id, SEED_USER_IDS));
    const [staffOutletCount] = await tx
      .select({ value: count() })
      .from(staffOutlets)
      .where(inArray(staffOutlets.id, SEED_STAFF_OUTLET_IDS));
    const [productCount] = await tx
      .select({ value: count() })
      .from(products)
      .where(eq(products.id, SEED_PRODUCT.id));
    const [serviceCount] = await tx
      .select({ value: count() })
      .from(services)
      .where(eq(services.id, SEED_SERVICE.id));
    const [customerCount] = await tx
      .select({ value: count() })
      .from(customers)
      .where(eq(customers.id, SEED_CUSTOMER.id));
    const [vehicleCount] = await tx
      .select({ value: count() })
      .from(vehicles)
      .where(eq(vehicles.id, SEED_VEHICLE.id));
    const [ledgerCount] = await tx
      .select({ value: count() })
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.productId, SEED_PRODUCT.id),
          eq(stockLedger.entryType, "STOCK_IN"),
        ),
      );
    const [stockTotal] = await tx
      .select({
        total: sql<string>`coalesce(sum(${stockLedger.quantityAfter} - ${stockLedger.quantityBefore}), 0)`,
      })
      .from(stockLedger)
      .where(eq(stockLedger.productId, SEED_PRODUCT.id));

    return {
      businesses: businessCount?.value ?? 0,
      outlets: outletCount?.value ?? 0,
      settings: settingsCount?.value ?? 0,
      users: userCount?.value ?? 0,
      staffOutlets: staffOutletCount?.value ?? 0,
      products: productCount?.value ?? 0,
      services: serviceCount?.value ?? 0,
      customers: customerCount?.value ?? 0,
      vehicles: vehicleCount?.value ?? 0,
      stockLedgerEntries: ledgerCount?.value ?? 0,
      stockOnHand: BigInt(stockTotal?.total ?? "0"),
    };
  });
}
