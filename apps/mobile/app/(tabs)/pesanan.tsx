import { orderListItemSchema, type OrderListItem } from "@workshop-pos/contracts";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/app/AuthProvider";
import { getRuntime } from "@/src/app/runtime";
import { useSync } from "@/src/app/SyncProvider";
import { Header, Money, SyncChip } from "@/src/components/chrome";
import { Badge, EmptyState, LoadingState, Notice, SectionTitle } from "@/src/components/forms";
import { Card, TextLink } from "@/src/components/ui";
import { listCachedOrders } from "@/src/db/repository";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES, STAFF_ROLE_LABELS } from "@/src/domain/order-labels";
import { outboxStatusLabel } from "@/src/domain/status";
import { formatWibTimestamp } from "@/src/format";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * Pesanan tab: the device queue first (what still needs the server), then the
 * cached server list. A Mechanic sees only jobs where they are the technician;
 * every role can still inspect the local queue they created.
 */

export default function PesananScreen() {
  const theme = useTheme();
  const router = useRouter();
  const runtime = getRuntime();
  const { session } = useAuth();
  const { online, queue, pendingTotal, foreignPending, conflicts, failed, syncing, refreshCache, cacheAt } = useSync();
  const [serverOrders, setServerOrders] = useState<OrderListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const loadCached = useCallback(async () => {
    const outletId = session?.activeOutletId;
    if (!outletId) return;
    try {
      const rows = await listCachedOrders(runtime.db, outletId);
      const parsed: OrderListItem[] = [];
      for (const row of rows) {
        const result = orderListItemSchema.safeParse(row);
        if (result.success) parsed.push(result.data);
      }
      if (session?.user.role === "MECHANIC") {
        setServerOrders(parsed.filter((order) => order.technicianName === session.user.name));
      } else {
        setServerOrders(parsed);
      }
    } finally {
      setLoadingOrders(false);
    }
  }, [runtime, session]);

  useEffect(() => {
    // Cached orders are SQLite rows; the async read sets list state once.
    void loadCached();
  }, [loadCached, cacheAt]);

  async function refresh() {
    if (!online) {
      setCacheError("Muat ulang memerlukan koneksi. Data yang tersimpan tetap bisa dibaca.");
      return;
    }
    setRefreshing(true);
    setCacheError(null);
    try {
      await refreshCache();
      await loadCached();
    } catch {
      setCacheError("Daftar pesanan gagal dimuat. Periksa jaringan lalu coba lagi.");
    } finally {
      setRefreshing(false);
    }
  }

  // Bounded display: the queue is newest-first and keeps applied sales so a
  // receipt stays reachable; older history is replaced by the server list.
  const localRows = [...queue].reverse().slice(0, 25);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <Header
        title="Pesanan"
        subtitle={
          session
            ? `${STAFF_ROLE_LABELS[session.user.role] ?? session.user.role}: ${session.user.name}`
            : null
        }
        right={
          <SyncChip
            online={online}
            syncing={syncing}
            queued={pendingTotal + foreignPending}
            conflicts={conflicts}
            failed={failed}
            onPress={() => router.push("/sinkron")}
          />
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12] }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.color.accent.default}
          />
        }
      >
        {cacheError ? <Notice tone="warning" message={cacheError} /> : null}
        {!online ? (
          <Notice
            tone="neutral"
            message="Anda offline. Daftar berikut berasal dari data terakhir yang dimuat; detail lengkap memerlukan koneksi."
          />
        ) : null}

        <SectionTitle
          right={
            <TextLink
              label="Sinkronkan"
              onPress={() => router.push("/sinkron")}
            />
          }
        >
          Antrean & transaksi lokal ({localRows.length})
        </SectionTitle>

        {localRows.length === 0 ? (
          <EmptyState
            title="Tidak ada transaksi lokal"
            body="Penjualan yang dibuat saat offline akan muncul di sini sampai tersinkron."
          />
        ) : (
          localRows.map((row) => {
            const status = outboxStatusLabel(row.state);
            const tone = theme.lifecycle(status.tone);
            return (
              <Pressable
                key={row.clientKey}
                accessibilityRole="button"
                accessibilityLabel={`${row.display.localNumber}, ${status.label}, total ${row.display.total}`}
                onPress={() =>
                  row.state === "CONFLICT"
                    ? router.push(`/konflik/${row.clientKey}`)
                    : router.push(`/jual/struk/${row.clientKey}`)
                }
              >
                <Card>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>
                      {row.serverOrderNumber ?? row.display.localNumber}
                    </Text>
                    <Badge label={status.label} fg={tone.fg} bg={tone.bg} border={tone.border} />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                      {row.display.customerName ?? "Pelanggan umum"}
                      {row.display.vehiclePlate ? ` · ${row.display.vehiclePlate}` : ""}
                      {` · ${formatWibTimestamp(row.deviceRecordedAt)}`}
                    </Text>
                    <Money value={BigInt(row.display.total)} size="body.strong" />
                  </View>
                  {row.state === "RETRY" && row.nextAttemptAt ? (
                    <Text style={[theme.type("caption"), { color: theme.color.status.warning.fg }]}>
                      Coba lagi setelah {formatWibTimestamp(row.nextAttemptAt)}
                    </Text>
                  ) : null}
                  {row.lastError ? (
                    <Text style={[theme.type("caption"), { color: theme.color.status.danger.fg }]}>
                      {row.lastError}
                    </Text>
                  ) : null}
                </Card>
              </Pressable>
            );
          })
        )}

        <SectionTitle
          right={
            <TextLink
              label={refreshing ? "Memuat…" : "Muat ulang"}
              onPress={() => void refresh()}
            />
          }
        >
          Pesanan server
        </SectionTitle>
        {loadingOrders ? (
          <LoadingState label="Memuat pesanan tersimpan…" />
        ) : serverOrders.length === 0 ? (
          <EmptyState
            title="Belum ada pesanan tersimpan"
            body="Muat ulang saat online untuk menyimpan daftar pesanan di perangkat."
          />
        ) : (
          serverOrders.map((order) => (
            <Pressable
              key={order.id}
              accessibilityRole="button"
              accessibilityLabel={`Buka pesanan ${order.orderNumber ?? ""}`}
              onPress={() => router.push(`/pesanan/${order.id}`)}
            >
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>
                    {order.orderNumber ?? "Tanpa nomor"}
                  </Text>
                  <Money value={BigInt(order.total)} size="body.strong" />
                </View>
                <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                  {order.customerName ?? "Pelanggan umum"}
                  {order.vehiclePlate ? ` · ${order.vehiclePlate}` : ""}
                </Text>
                <Badge
                  label={ORDER_STATUS_LABELS[order.status]}
                  {...theme.lifecycle(ORDER_STATUS_TONES[order.status])}
                />
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
