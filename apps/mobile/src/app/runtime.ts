import { createApiClient } from "@/src/api/client";
import { createMobileEndpoints, type MobileEndpoints } from "@/src/api/endpoints";
import { createCacheRefresher, type CacheRefresher } from "@/src/cache/refresh";
import { createExpoSqlDatabase } from "@/src/db/expo-executor";
import type { SqlDatabase } from "@/src/db/executor";
import { createExpoSecretStore, type SecretStore } from "@/src/auth/secret-store";
import { createSessionStore, type SessionStore } from "@/src/auth/session-store";
import { createSyncEngine, type SyncEngine } from "@/src/sync/engine";

/**
 * One process-wide device runtime: SQLite, secure storage, the HTTP client, the
 * outbox runner, and the cache refresher. Building it once keeps the token
 * getter, the single-flight sync lock, and the cache mutex shared by every
 * screen.
 */

export interface RuntimeEvents {
  onUnauthorised?: () => void | Promise<void>;
  onQueueChanged?: () => void | Promise<void>;
}

export interface DeviceRuntime {
  db: SqlDatabase;
  secrets: SecretStore;
  sessionStore: SessionStore;
  endpoints: MobileEndpoints;
  engine: SyncEngine;
  refresher: CacheRefresher;
  token: { current: string | null };
  cacheGeneration: { current: number };
  events: RuntimeEvents;
}

export function createDeviceRuntime(): DeviceRuntime {
  const db = createExpoSqlDatabase();
  const secrets = createExpoSecretStore();
  const sessionStore = createSessionStore(secrets);
  const token = { current: null as string | null };
  const cacheGeneration = { current: 0 };
  const events: RuntimeEvents = {};

  const client = createApiClient({
    baseUrl: "",
    getToken: async () => token.current,
    onUnauthenticated: async (rejectedToken) => {
      // Ignore a late 401 from a token that was already replaced by a new sign-in.
      if (token.current !== rejectedToken) return;
      await events.onUnauthorised?.();
    },
  });
  const endpoints = createMobileEndpoints(client);

  const engine = createSyncEngine({
    db,
    endpoints,
    onResult: async () => {
      await events.onQueueChanged?.();
    },
    onUnauthorised: async () => {
      await events.onUnauthorised?.();
    },
  });

  const refresher = createCacheRefresher({
    db,
    generation: cacheGeneration,
    endpoints: {
      listCatalog: endpoints.listCatalog,
      listCustomers: endpoints.listCustomers,
      listVehicles: endpoints.listVehicles,
      listOrders: endpoints.listOrders,
      orderDetail: endpoints.orderDetail,
      vehicleHistory: endpoints.vehicleHistory,
    },
  });

  return {
    db,
    secrets,
    sessionStore,
    endpoints,
    engine,
    refresher,
    token,
    cacheGeneration,
    events,
  };
}

let singleton: DeviceRuntime | null = null;

/**
 * The device runtime is a process singleton, not React state: SQLite, secure
 * storage, and the queue lock must be shared by every screen and by background
 * sync. Components import this function directly so no hook owns (and cannot
 * accidentally clone) the mutable service object.
 */
export function getRuntime(): DeviceRuntime {
  singleton ??= createDeviceRuntime();
  return singleton;
}
