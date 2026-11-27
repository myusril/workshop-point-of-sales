import type { CatalogItem, CustomerListItem, VehicleListItem } from "@workshop-pos/contracts";

import type { MobileEndpoints } from "@/src/api/endpoints";
import {
  cacheOrders,
  replaceCatalog,
  replaceCustomers,
  replaceVehicles,
  getOutletSettings,
  saveOutletSettings,
  saveVehicleHistory,
  type CachedCatalogItem,
  type CachedCustomer,
  type CachedVehicle,
} from "@/src/db/repository";
import type { SqlDatabase } from "@/src/db/executor";

/**
 * Pulls the read-only snapshot the counter needs offline: catalog (with
 * provisional stock), customers (masked phone only), vehicles, vehicle history,
 * and the recent order list. Everything is scoped to the signed-in outlet and
 * is replaced atomically per collection so a failed refresh never leaves half
 * a list behind.
 */

export interface CacheRefreshResult {
  catalog: number;
  customers: number;
  vehicles: number;
  orders: number;
  refreshedAt: string;
}

export interface CacheRefresher {
  refreshAll(outletId: string): Promise<CacheRefreshResult>;
  refreshHistory(outletId: string, vehicleId: string): Promise<void>;
  isRefreshing(): boolean;
}

export function toCachedCatalogItem(item: CatalogItem): CachedCatalogItem {
  if (item.itemType === "PRODUCT") {
    return {
      itemType: "PRODUCT",
      id: item.id,
      outletId: item.outletId,
      name: item.name,
      code: item.sku,
      price: item.price,
      unit: item.unit,
      stockOnHand: item.stockOnHand,
      lowStockThreshold: item.lowStockThreshold,
      isLowStock: item.isLowStock,
      isActive: item.isActive,
      durationMinutes: null,
      updatedAt: item.updatedAt,
    };
  }
  return {
    itemType: "SERVICE",
    id: item.id,
    outletId: item.outletId,
    name: item.name,
    code: item.code,
    price: item.price,
    unit: null,
    stockOnHand: null,
    lowStockThreshold: null,
    isLowStock: false,
    isActive: item.isActive,
    durationMinutes: item.durationMinutes,
    updatedAt: item.updatedAt,
  };
}

export function toCachedCustomer(item: CustomerListItem): CachedCustomer {
  return {
    id: item.id,
    name: item.name,
    phoneMasked: item.phoneMasked,
    vehicleCount: item.vehicleCount,
    updatedAt: item.updatedAt,
  };
}

export function toCachedVehicle(item: VehicleListItem): CachedVehicle {
  return {
    id: item.id,
    plate: item.normalizedPlate,
    brand: item.brand,
    model: item.model,
    customerId: item.customerId,
    customerName: item.customerName,
    updatedAt: item.updatedAt,
  };
}

export function createCacheRefresher(options: {
  db: SqlDatabase;
  endpoints: Pick<
    MobileEndpoints,
    "listCatalog" | "listCustomers" | "listVehicles" | "listOrders" | "orderDetail" | "vehicleHistory"
  >;
  now?: () => Date;
  /** Bumped by sign-out/expiry/outlet switch so a late refresh cannot rewrite PII. */
  generation?: { current: number };
}): CacheRefresher {
  const now = options.now ?? (() => new Date());
  let running: { outletId: string; promise: Promise<CacheRefreshResult> } | null = null;

  async function refreshAll(outletId: string): Promise<CacheRefreshResult> {
    const refreshedAt = now().toISOString();
    const generationAtStart = options.generation?.current;
    function assertWritable(): void {
      if (
        options.generation &&
        generationAtStart !== undefined &&
        options.generation.current !== generationAtStart
      ) {
        throw new Error("Pemuatan cache dibatalkan karena sesi berubah.");
      }
    }
    const [catalog, customers, vehicles, orders] = await Promise.all([
      options.endpoints.listCatalog(),
      options.endpoints.listCustomers(),
      options.endpoints.listVehicles(),
      options.endpoints.listOrders().then((response) => response.items),
    ]);

    assertWritable();
    await replaceCatalog(options.db, outletId, catalog.map(toCachedCatalogItem), refreshedAt);
    assertWritable();
    await replaceCustomers(options.db, outletId, customers.map(toCachedCustomer), refreshedAt);
    assertWritable();
    await replaceVehicles(options.db, outletId, vehicles.map(toCachedVehicle), refreshedAt);
    assertWritable();
    await cacheOrders(
      options.db,
      outletId,
      orders.map((order) => ({ id: order.id, payload: order })),
      refreshedAt,
    );

    // The mobile API has no settings endpoint; the newest server order carries
    // the outlet policy snapshot, so learn it without opening a schema or API
    // owned by another work package. Header/footer text stays from the last
    // known value because the order summary does not include it.
    const newest = orders[0];
    if (newest) {
      try {
        assertWritable();
        const detail = await options.endpoints.orderDetail(newest.id);
        const previous = await getOutletSettings(options.db, outletId, refreshedAt);
        await saveOutletSettings(options.db, {
          outletId,
          taxRate: detail.settings.taxRate,
          paperWidth: detail.settings.paperWidth,
          cashierDiscountCapPercent: detail.settings.cashierDiscountCapPercent,
          voidReasonMinLength: detail.settings.voidReasonMinLength,
          headerText: previous.source === "SERVER" ? previous.headerText : null,
          footerText: previous.source === "SERVER" ? previous.footerText : null,
          source: "SERVER",
          cachedAt: refreshedAt,
        });
      } catch {
        // Keep the previous settings; the sale can still use the cached policy.
      }
    }

    return {
      catalog: catalog.length,
      customers: customers.length,
      vehicles: vehicles.length,
      orders: orders.length,
      refreshedAt,
    };
  }

  return {
    refreshAll(outletId) {
      if (running && running.outletId === outletId) return running.promise;
      // A switch during a refresh must fetch the new outlet rather than reuse
      // the old outlet's in-flight promise. Writes are outlet-scoped, and the
      // SQLite transaction serializes them.
      const promise = refreshAll(outletId).finally(() => {
        if (running?.promise === promise) running = null;
      });
      running = { outletId, promise };
      return promise;
    },
    async refreshHistory(outletId, vehicleId) {
      const history = await options.endpoints.vehicleHistory(vehicleId);
      await saveVehicleHistory(options.db, outletId, vehicleId, history, now().toISOString());
    },
    isRefreshing() {
      return running !== null;
    },
  };
}
