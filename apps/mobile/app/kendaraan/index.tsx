import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/providers/AuthProvider";
import { getRuntime } from "@/src/providers/runtime";
import { useSync } from "@/src/providers/SyncProvider";
import { Header } from "@/src/components/chrome";
import { EmptyState, LoadingState, Notice } from "@/src/components/forms";
import { listVehicles, type CachedVehicle } from "@/src/db/repository";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function KendaraanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const runtime = getRuntime();
  const { session } = useAuth();
  const { online } = useSync();
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<CachedVehicle[]>([]);

  useEffect(() => {
    const outletId = session?.activeOutletId;
    if (!outletId) return;
    let cancelled = false;
    void listVehicles(runtime.db, outletId, query)
      .then((items) => {
        if (!cancelled) setRows(items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [query, runtime, session?.activeOutletId]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <Header title="Kendaraan" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12] }} keyboardShouldPersistTaps="handled">
        {!online ? (
          <Notice
            tone="neutral"
            message="Riwayat yang pernah dibuka tetap bisa dibaca offline. Intake kendaraan baru memerlukan koneksi."
          />
        ) : null}
        <TextInput
          accessibilityLabel="Cari nomor polisi atau model"
          placeholder="Cari nomor polisi atau model"
          placeholderTextColor={theme.color.text.muted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="characters"
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
        {!loaded ? (
          <LoadingState label="Memuat kendaraan…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Belum ada kendaraan tersimpan"
            body="Data kendaraan dimuat saat online."
          />
        ) : (
          rows.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Buka riwayat ${item.plate}`}
              onPress={() => router.push(`/kendaraan/${item.id}`)}
              style={{
                minHeight: theme.size.rowMobile,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.color.border.subtle,
                backgroundColor: theme.color.bg.surface,
                padding: theme.spacing[12],
                justifyContent: "center",
                gap: 2,
              }}
            >
              <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>
                {item.plate}
              </Text>
              <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                {item.brand} {item.model} · {item.customerName}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
