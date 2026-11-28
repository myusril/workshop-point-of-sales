import NetInfo from "@react-native-community/netinfo";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import { ApiError, NetworkError } from "@/src/api/client";
import { useAuth } from "@/src/providers/AuthProvider";
import { getRuntime } from "@/src/providers/runtime";
import { getCacheRefreshed, listQueue, type QueueRow } from "@/src/db/repository";
import type { SyncRunSummary } from "@/src/sync/engine";

/**
 * Network, queue, and cache coordinator.
 *
 * Sales upload automatically when connectivity returns, on app foreground, and
 * at the earliest scheduled retry. A manual "Sinkronkan sekarang" bypasses the
 * backoff without changing queue order. The read cache is refreshed on every
 * signed-in/online transition, even with an empty outbox, so a fresh install
 * gets its catalog without waiting for a sale; a refresh after any applied sale
 * then replaces provisional stock with the server value.
 */

export interface SyncContextValue {
  online: boolean;
  syncing: boolean;
  queue: QueueRow[];
  queued: number;
  conflicts: number;
  failed: number;
  pendingTotal: number;
  cacheAt: string | null;
  cacheFresh: boolean;
  cacheLoading: boolean;
  cacheError: string | null;
  foreignPending: number;
  lastError: string | null;
  lastSummary: SyncRunSummary | null;
  reload: () => Promise<void>;
  runNow: (manual?: boolean) => Promise<SyncRunSummary | null>;
  refreshCache: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  if (error instanceof Error && error.message.length > 0) return error.message;
  return "Sinkronisasi gagal. Coba lagi.";
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { status, session } = useAuth();
  const [online, setOnline] = useState(true);
  const [onlineKnown, setOnlineKnown] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [cacheAt, setCacheAt] = useState<string | null>(null);
  const [cacheFresh, setCacheFresh] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<SyncRunSummary | null>(null);
  const sessionRef = useRef(session);
  const runningRef = useRef(false);
  const autoSyncKeyRef = useRef<string | null>(null);
  const bootstrapRefreshKeyRef = useRef<string | null>(null);
  const refreshSeqRef = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const reload = useCallback(async () => {
    const rows = await listQueue(getRuntime().db);
    setQueue(rows);
    const cache = await getCacheRefreshed(getRuntime().db, "catalog");
    setCacheAt(cache?.cachedAt ?? null);
    const age = cache ? Date.now() - Date.parse(cache.cachedAt) : Number.NaN;
    setCacheFresh(Number.isFinite(age) && age >= 0 && age <= 10 * 60_000);
  }, []);

  useEffect(() => {
    getRuntime().events.onQueueChanged = reload;
    return () => {
      getRuntime().events.onQueueChanged = undefined;
    };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    NetInfo.fetch()
      .then((state) => {
        if (cancelled) return;
        setOnline(Boolean(state.isConnected));
        setOnlineKnown(true);
      })
      .catch(() => {
        // Keep the optimistic default rather than blocking sync on a probe error.
        if (!cancelled) setOnlineKnown(true);
      });
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected));
      setOnlineKnown(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const refreshCache = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const seq = ++refreshSeqRef.current;
    setCacheLoading(true);
    try {
      await getRuntime().refresher.refreshAll(current.activeOutletId);
      if (seq === refreshSeqRef.current) setCacheError(null);
    } catch (error) {
      // An outlet switch/sign-out aborts the in-flight refresh; that stale
      // rejection must not re-install an error over the new session's snapshot.
      if (seq === refreshSeqRef.current) setCacheError(errorMessage(error));
      throw error;
    } finally {
      if (seq === refreshSeqRef.current) setCacheLoading(false);
      await reload();
    }
  }, [reload]);

  const runNow = useCallback(
    async (manual = false): Promise<SyncRunSummary | null> => {
      if (status !== "signedIn") return null;
      if (runningRef.current) return null;
      if (!manual && !online) return null;
      runningRef.current = true;
      setSyncing(true);
      setLastError(null);
      try {
        const summary = await getRuntime().engine.run({
          manual,
          outletId: sessionRef.current?.activeOutletId ?? null,
        });
        setLastSummary(summary);
        if (summary.unauthorised) {
          setLastError("Sesi berakhir. Masuk kembali untuk melanjutkan sinkronisasi.");
        } else if (summary.applied > 0 && online) {
          try {
            // A bootstrap refresh may have fetched its snapshot before this
            // upload committed. Joining it alone would cache pre-sale stock and
            // label it "Stok server", so wait out the overlap and fetch again.
            const outletId = sessionRef.current?.activeOutletId;
            const refresher = getRuntime().refresher;
            if (outletId && refresher.isRefreshing()) {
              await refresher.refreshAll(outletId);
            }
            await refreshCache();
          } catch {
            // The sale is safe; stock simply stays provisional until the next refresh.
          }
        }
        return summary;
      } catch (error) {
        setLastError(errorMessage(error));
        return null;
      } finally {
        runningRef.current = false;
        setSyncing(false);
        await reload();
      }
    },
    [online, refreshCache, reload, status],
  );

  useEffect(() => {
    if (status !== "signedIn") {
      autoSyncKeyRef.current = null;
      bootstrapRefreshKeyRef.current = null;
      return;
    }
    // The queue is SQLite state, not render state; the first read is async.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    // `online` starts optimistic; wait for NetInfo before touching the network.
    if (!onlineKnown) return;
    // Run once per sign-in/connectivity transition. `runNow` changes identity
    // when its inputs do, so using it as an unconditional trigger would loop.
    const key = online ? "online" : "offline";
    if (autoSyncKeyRef.current !== key) {
      autoSyncKeyRef.current = key;
      if (online) void runNow();
    }
    // A fresh sign-in or a restored connection must populate the read cache even
    // when the outbox is empty: the Jual tab only reads SQLite. The key is the
    // outlet plus the connectivity transition, so this refreshes once per
    // sign-in/outlet/online change instead of on every render, and the refresher
    // keeps its single-flight guard for an overlapping post-sale refresh.
    const refreshKey = `${session?.activeOutletId ?? ""}:${key}`;
    if (online && bootstrapRefreshKeyRef.current !== refreshKey) {
      bootstrapRefreshKeyRef.current = refreshKey;
      void refreshCache().catch(() => undefined);
    }
  }, [onlineKnown, status, online, reload, refreshCache, runNow, session?.activeOutletId]);

  useEffect(() => {
    if (status !== "signedIn") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && online) {
        void reload();
        void runNow();
      }
    });
    return () => subscription.remove();
  }, [online, reload, runNow, status]);

  useEffect(() => {
    if (status !== "signedIn") return;
    const timer = setInterval(() => {
      void reload();
      // Also picks up a sale committed while a previous run was in flight.
      if (online) void runNow();
    }, 15_000);
    return () => clearInterval(timer);
  }, [online, reload, runNow, status]);

  const nextRetryAt = useMemo(() => {
    const stamps = queue
      .filter((row) => row.state === "RETRY" && row.nextAttemptAt)
      .map((row) => Date.parse(row.nextAttemptAt ?? ""))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);
    return stamps[0] ?? null;
  }, [queue]);

  useEffect(() => {
    if (!online || nextRetryAt === null) return;
    const delay = Math.max(0, Math.min(300_000, nextRetryAt - Date.now()));
    const timer = setTimeout(() => {
      void runNow();
    }, delay);
    return () => clearTimeout(timer);
  }, [nextRetryAt, online, runNow]);

  const activeOutletId = session?.activeOutletId ?? null;
  const visibleQueue = useMemo(
    () => (activeOutletId ? queue.filter((row) => row.outletId === activeOutletId) : []),
    [activeOutletId, queue],
  );
  const foreignPending = useMemo(() => {
    if (!activeOutletId) return 0;
    return queue.filter(
      (row) =>
        row.outletId !== activeOutletId &&
        (row.state === "QUEUED" ||
          row.state === "SENDING" ||
          row.state === "RETRY" ||
          row.state === "CONFLICT" ||
          row.state === "FAILED"),
    ).length;
  }, [activeOutletId, queue]);
  const counts = useMemo(() => {
    const base = { QUEUED: 0, SENDING: 0, RETRY: 0, CONFLICT: 0, APPLIED: 0, FAILED: 0, VOIDED: 0 };
    for (const row of visibleQueue) base[row.state] += 1;
    return base;
  }, [visibleQueue]);


  const value = useMemo<SyncContextValue>(() => {
    const pendingTotal =
      counts.QUEUED + counts.SENDING + counts.RETRY + counts.CONFLICT + counts.FAILED;
    return {
      online,
      syncing,
      queue: visibleQueue,
      queued: counts.QUEUED + counts.RETRY,
      conflicts: counts.CONFLICT,
      failed: counts.FAILED,
      pendingTotal,
      cacheAt,
      cacheFresh,
      cacheLoading,
      cacheError,
      foreignPending,
      lastError,
      lastSummary,
      reload,
      runNow,
      refreshCache,
    };
  }, [
    online,
    syncing,
    visibleQueue,
    counts,
    cacheAt,
    cacheFresh,
    cacheLoading,
    cacheError,
    foreignPending,
    lastError,
    lastSummary,
    reload,
    runNow,
    refreshCache,
  ]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("SyncProvider is missing.");
  return value;
}
