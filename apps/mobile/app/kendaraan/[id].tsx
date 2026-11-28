import { vehicleHistoryResponseSchema, type VehicleHistoryResponse } from "@workshop-pos/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/providers/AuthProvider";
import { getRuntime } from "@/src/providers/runtime";
import { useSync } from "@/src/providers/SyncProvider";
import { Header, Money } from "@/src/components/chrome";
import { EmptyState, Notice, SectionTitle } from "@/src/components/forms";
import { Card } from "@/src/components/ui";
import { getVehicleHistory } from "@/src/db/repository";
import { formatWibTimestamp } from "@/src/format";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function RiwayatKendaraanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const runtime = getRuntime();
  const { session } = useAuth();
  const { online } = useSync();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [history, setHistory] = useState<VehicleHistoryResponse | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const outletId = session?.activeOutletId;
    if (!outletId) return;
    (async () => {
      const cached = await getVehicleHistory(runtime.db, id);
      if (cancelled) return;
      const parsed = vehicleHistoryResponseSchema.safeParse(cached?.payload);
      if (parsed.success) {
        setHistory(parsed.data);
        setCachedAt(cached?.cachedAt ?? null);
      }
      if (!online) return;
      try {
        await runtime.refresher.refreshHistory(outletId, id);
        const refreshed = await getVehicleHistory(runtime.db, id);
        if (cancelled) return;
        const freshParsed = vehicleHistoryResponseSchema.safeParse(refreshed?.payload);
        if (freshParsed.success) {
          setHistory(freshParsed.data);
          setCachedAt(refreshed?.cachedAt ?? null);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Riwayat terbaru tidak dapat dimuat. Menampilkan data tersimpan.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, online, runtime, session?.activeOutletId]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <Header
        title={history?.vehicle.normalizedPlate ?? "Riwayat kendaraan"}
        subtitle={cachedAt ? `Tersimpan ${formatWibTimestamp(cachedAt)}` : undefined}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12] }}>
        {!online ? <Notice tone="neutral" message="Membaca riwayat tersimpan tanpa koneksi." /> : null}
        {error ? <Notice tone="warning" message={error} /> : null}

        {history ? (
          <>
            <Card>
              <Text style={[theme.type("title.sm"), { color: theme.color.text.primary }]}>
                {history.vehicle.brand} {history.vehicle.model}
                {history.vehicle.year ? ` · ${history.vehicle.year}` : ""}
              </Text>
              <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
                {history.vehicle.customerName}
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
                  Kunjungan
                </Text>
                <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>
                  {history.totals.visits}
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
                  Total belanja
                </Text>
                <Money value={BigInt(history.totals.totalSpent)} size="body.strong" />
              </View>
              {BigInt(history.totals.outstanding) > 0n ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[theme.type("body"), { color: theme.color.status.warning.fg }]}>
                    Sisa tagihan
                  </Text>
                  <Money
                    value={BigInt(history.totals.outstanding)}
                    size="body.strong"
                    color={theme.color.status.warning.fg}
                  />
                </View>
              ) : null}
            </Card>

            <SectionTitle>Riwayat servis</SectionTitle>
            {history.orders.length === 0 ? (
              <EmptyState title="Belum ada riwayat" body="Kendaraan ini belum memiliki pesanan." />
            ) : (
              history.orders.map((order) => (
                <Card key={order.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>
                      {order.orderNumber ?? order.kind}
                    </Text>
                    <Money value={BigInt(order.total)} size="body.strong" />
                  </View>
                  <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                    {formatWibTimestamp(order.paidAt ?? order.createdAt)} · {order.status}
                    {order.odometer !== null ? ` · ${order.odometer} km` : ""}
                  </Text>
                  {order.lines.map((line, index) => (
                    <Text
                      key={`${order.id}-${index}`}
                      style={[theme.type("caption"), { color: theme.color.text.secondary }]}
                    >
                      {line.quantity}× {line.description}
                    </Text>
                  ))}
                </Card>
              ))
            )}
          </>
        ) : (
          <EmptyState
            title="Riwayat belum tersimpan"
            body="Buka riwayat ini saat online agar dapat dibaca lagi tanpa koneksi."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
