import { asc } from "drizzle-orm";
import type { Database } from "../client.ts";
import { products, services } from "../schema/index.ts";
import { normalizeScope, outletScoped, type OutletScope } from "./scope.ts";

export function listProducts(db: Database, scope: OutletScope) {
  normalizeScope(scope);
  return db
    .select()
    .from(products)
    .where(outletScoped(products, scope))
    .orderBy(asc(products.name));
}

export function listServices(db: Database, scope: OutletScope) {
  normalizeScope(scope);
  return db
    .select()
    .from(services)
    .where(outletScoped(services, scope))
    .orderBy(asc(services.name));
}
