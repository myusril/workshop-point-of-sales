import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/providers/AuthProvider";
import { getRuntime } from "@/src/providers/runtime";
import { useSync } from "@/src/providers/SyncProvider";
import { Header, SyncChip } from "@/src/components/chrome";
import { EmptyState, ErrorState, LoadingState, Notice, SectionTitle, Segmented } from "@/src/components/forms";
import { Button, Card } from "@/src/components/ui";
import { listCatalog, type CachedCatalogItem } from "@/src/db/repository";
import { formatWibTimestamp } from "@/src/format";
import { useTheme } from "@/src/theme/ThemeProvider";

type Filter = "ALL" | "LOW";

const FILTERS = [
  { value: "ALL" as const, label: "Semua" },
  { value: "LOW" as const, label: "Menipis" },
];

export default function StokScreen() {
  const theme = useTheme();
  const router = useRouter();
  const runtime = getRuntime();
  const { session } = useAuth();
  const { online, pendingTotal, conflicts, failed, syncing, cacheAt, cacheFresh, foreignPending, refreshCache } = useSync();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [items, setItems] = useState<CachedCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);

  const outletId = session?.activeOutletId ?? null;
  const canAdjust = session?.user.role === "OWNER" || session?.user.role === "ADMIN";

  const load = useCallback(async () => {
    if (!outletId) return;
    try {
      const rows = await listCatalog(runtime.db, outletId, { query, itemType: "PRODUCT" });
      setItems(filter === "LOW" ? rows.filter((item) => item.isLowStock) : rows);
      setLoadError(null);
    } catch {
      setLoadError("Stok tidak dapat dibaca dari perangkat.");
    } finally {
      setLoading(false);
    }
  }, [filter, outletId, query, runtime]);

  useEffect(() => {
    // Stock rows are SQLite cache entries; the async read sets list state once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, cacheAt]);

  async function refresh() {
    if (!online) {
      setCacheError("Stok server memerlukan koneksi. Angka yang tampil adalah stok sementara.");
      return;
    }
    setRefreshing(true);
    setCacheError(null);
    try {
      await refreshCache();
      await load();
    } catch {
      setCacheError("Stok gagal dimuat. Angka yang tampil tetap stok sementara.");
    } finally {
      setRefreshing(false);
    }
  }

  function adjust(item: CachedCatalogItem) {
    Alert.alert(
      "Penyesuaian stok",
      online
        ? `${item.name}: penyesuaian stok dilakukan di back-office web agar masuk ledger append-only.`
        : `${item.name}: penyesuaian memerlukan koneksi. Stok sementara tetap bisa dilihat.`,
      [{ text: "Mengerti" }],
    );
  }

  const lowCount = items.filter((item) => item.isLowStock).length;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <Header
        title="Stok"
        subtitle={
          cacheAt
            ? online && cacheFresh
              ? `Stok server · ${formatWibTimestamp(cacheAt)}`
              : `Stok sementara · ${formatWibTimestamp(cacheAt)}`
            : "Stok sementara · belum dimuat"
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
        keyboardShouldPersistTaps="handled"
      >
        {!online ? (
          <Notice
            tone="warning"
            message="Angka stok berasal dari cache perangkat dan belum tentu sama dengan server. Stok final ditentukan server saat transaksi disinkronkan."
          />
        ) : null}
        {cacheError ? <Notice tone="neutral" message={cacheError} /> : null}
        {foreignPending > 0 ? (
          <Notice
            tone="warning"
            message={`${foreignPending} transaksi dari outlet lain menunggu sinkron. Ganti ke outlet tersebut untuk mengirimnya.`}
          />
        ) : null}
        {conflicts > 0 ? (
          <Notice
            tone="danger"
            title="Ada konflik stok"
            message="Transaksi yang bentrok harus diputuskan sebelum stok server dianggap final."
            action={<Button label="Buka antrean" variant="secondary" onPress={() => router.push("/sinkron")} />}
          />
        ) : null}

        <TextInput
          accessibilityLabel="Cari produk"
          placeholder="Cari nama atau SKU"
          placeholderTextColor={theme.color.text.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          style={[
            theme.type("body.lg"),
            {
              minHeight: theme.size.targetMobile,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.color.border.strong,
              backgroundColor: theme.color.bg.surface,
              paddingHorizontal: theme.spacing[12],
              color: theme.color.text.primary,
            },
          ]}
        />
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        <SectionTitle
          right={
            <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
              {lowCount} menipis
            </Text>
          }
        >
          Produk
        </SectionTitle>

        {loading ? (
          <LoadingState label="Memuat stok…" />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState
            title={query ? "Produk tidak ditemukan" : "Belum ada produk"}
            body={
              query
                ? "Coba kata kunci atau SKU lain."
                : "Muat ulang data saat online agar daftar produk tersedia di perangkat."
            }
            action={<Button label="Muat ulang" variant="secondary" onPress={() => void refresh()} loading={refreshing} />}
          />
        ) : (
          items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, stok ${item.stockOnHand ?? "tidak diketahui"}${item.isLowStock ? ", menipis" : ""}`}
              onPress={() => adjust(item)}
            >
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing[8] }}>
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={2}
                      style={[theme.type("body.strong"), { color: theme.color.text.primary }]}
                    >
                      {item.name}
                    </Text>
                    <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                      {item.code ?? "—"}
                      {item.unit ? ` · ${item.unit}` : ""}
                      {item.lowStockThreshold !== null ? ` · batas ${item.lowStockThreshold}` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={[
                        theme.type("numeric.lg"),
                        {
                          color: item.isLowStock
                            ? theme.color.status.warning.fg
                            : theme.color.text.primary,
                        },
                      ]}
                    >
                      {item.stockOnHand === null ? "—" : item.stockOnHand}
                    </Text>
                    <Text
                      style={[
                        theme.type("caption"),
                        {
                          color: item.isLowStock
                            ? theme.color.status.warning.fg
                            : theme.color.text.muted,
                        },
                      ]}
                    >
                      {item.isLowStock ? "Menipis" : online && cacheFresh ? "Server" : "Sementara"}
                    </Text>
                  </View>
                </View>
                {canAdjust ? (
                  <Text style={[theme.type("caption"), { color: theme.color.text.link }]}>
                    Ketuk untuk penyesuaian stok
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          ))
        )}

        <Button label={refreshing ? "Memuat…" : "Muat ulang stok"} variant="secondary" onPress={() => void refresh()} loading={refreshing} />
        {!canAdjust ? (
          <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
            Peran Anda hanya dapat melihat stok. Penyesuaian dan stock-in dilakukan Admin/Pemilik.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
