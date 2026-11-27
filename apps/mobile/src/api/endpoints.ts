import {
  catalogListResponseSchema,
  customerListResponseSchema,
  loginResponseSchema,
  orderListResponseSchema,
  orderResponseSchema,
  sessionPayloadSchema,
  syncConflictListResponseSchema,
  syncResolveRequestSchema,
  syncResultSchema,
  vehicleHistoryResponseSchema,
  vehicleListResponseSchema,
  type CatalogItem,
  type CustomerListItem,
  type LoginRequest,
  type LoginResponse,
  type OrderDetail,
  type OrderListItem,
  type SessionPayload,
  type SyncApplyRequest,
  type SyncConflictListResponse,
  type SyncResolveRequest,
  type SyncResult,
  type VehicleHistoryResponse,
  type VehicleListItem,
} from "@workshop-pos/contracts";

import type { ApiClient } from "./client";

/** Typed wrappers over the existing WP3–WP6.1 endpoints; no server path is added. */

const MAX_PAGES = 25;

async function collectPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; totalPages: number }>,
): Promise<T[]> {
  const first = await fetchPage(1);
  const items = [...first.items];
  const pages = Math.min(first.totalPages, MAX_PAGES);
  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchPage(page);
    items.push(...next.items);
  }
  return items;
}

export interface MobileEndpoints {
  login(input: LoginRequest): Promise<LoginResponse>;
  session(): Promise<SessionPayload>;
  logout(): Promise<void>;
  switchOutlet(outletId: string): Promise<SessionPayload>;
  listCatalog(): Promise<CatalogItem[]>;
  listCustomers(): Promise<CustomerListItem[]>;
  listVehicles(): Promise<VehicleListItem[]>;
  vehicleHistory(vehicleId: string): Promise<VehicleHistoryResponse>;
  listOrders(query?: string): Promise<{ items: OrderListItem[] }>;
  orderDetail(orderId: string): Promise<OrderDetail>;
  applySync(request: SyncApplyRequest): Promise<SyncResult>;
  resolveSync(clientKey: string, request: SyncResolveRequest): Promise<SyncResult>;
  listServerConflicts(): Promise<SyncConflictListResponse>;
}

export function createMobileEndpoints(
  client: ApiClient,
  loginClient: ApiClient = client,
): MobileEndpoints {
  return {
    async login(input) {
      return loginClient.post("/api/v1/auth/login", input, loginResponseSchema);
    },
    async session() {
      return client.get("/api/v1/auth/session", sessionPayloadSchema);
    },
    async logout() {
      await client.postEmpty("/api/v1/auth/logout", {});
    },
    async switchOutlet(outletId) {
      return client.post("/api/v1/auth/session/outlet", { outletId }, sessionPayloadSchema);
    },
    async listCatalog() {
      const products = await collectPages<CatalogItem>((page) =>
        client
          .get(
            `/api/v1/catalog/products?type=product&status=active&pageSize=100&page=${page}&sort=name&dir=asc`,
            catalogListResponseSchema,
          )
          .then((response) => ({ items: response.items, totalPages: response.totalPages })),
      );
      const services = await collectPages<CatalogItem>((page) =>
        client
          .get(
            `/api/v1/catalog/services?type=service&status=active&pageSize=100&page=${page}&sort=name&dir=asc`,
            catalogListResponseSchema,
          )
          .then((response) => ({ items: response.items, totalPages: response.totalPages })),
      );
      return [...products, ...services];
    },
    async listCustomers() {
      return collectPages<CustomerListItem>((page) =>
        client
          .get(
            `/api/v1/customers?pageSize=100&page=${page}&sort=name&dir=asc`,
            customerListResponseSchema,
          )
          .then((response) => ({ items: response.items, totalPages: response.totalPages })),
      );
    },
    async listVehicles() {
      return collectPages<VehicleListItem>((page) =>
        client
          .get(
            `/api/v1/vehicles?pageSize=100&page=${page}&sort=plate&dir=asc`,
            vehicleListResponseSchema,
          )
          .then((response) => ({ items: response.items, totalPages: response.totalPages })),
      );
    },
    async vehicleHistory(vehicleId) {
      return client.get(
        `/api/v1/vehicles/${encodeURIComponent(vehicleId)}/history?pageSize=50&page=1`,
        vehicleHistoryResponseSchema,
      );
    },
    async listOrders(query) {
      const search = query?.trim() ? `&q=${encodeURIComponent(query.trim())}` : "";
      const response = await client.get(
        `/api/v1/orders?page=1&pageSize=50${search}`,
        orderListResponseSchema,
      );
      return { items: response.items };
    },
    async orderDetail(orderId) {
      const response = await client.get(
        `/api/v1/orders/${encodeURIComponent(orderId)}`,
        orderResponseSchema,
      );
      return response.item;
    },
    async applySync(request) {
      return client.post("/api/v1/sync", request, syncResultSchema);
    },
    async resolveSync(clientKey, request) {
      const body = syncResolveRequestSchema.parse(request);
      return client.post(
        `/api/v1/sync/${encodeURIComponent(clientKey)}/resolve`,
        body,
        syncResultSchema,
      );
    },
    async listServerConflicts() {
      return client.get("/api/v1/sync/conflicts", syncConflictListResponseSchema);
    },
  };
}
