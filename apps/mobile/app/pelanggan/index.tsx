import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/app/AuthProvider";
import { getRuntime } from "@/src/app/runtime";
import { useSync } from "@/src/app/SyncProvider";
import { Header } from "@/src/components/chrome";
import { EmptyState, LoadingState, Notice } from "@/src/components/forms";
import { listCustomers, type CachedCustomer } from "@/src/db/repository";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function PelangganScreen() {
  const theme = useTheme();
  const router = useRouter();
  const runtime = getRuntime();
  const { session } = useAuth();
  const { online } = useSync();
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<CachedCustomer[]>([]);

  useEffect(() => {
    const outletId = session?.activeOutletId;
    if (!outletId) return;
    let cancelled = false;
    void listCustomers(runtime.db, outletId, query)
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
      <Header title="Pelanggan" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12] }} keyboardShouldPersistTaps="handled">
        {!online ? (
          <Notice
            tone="neutral"
            message="Menampilkan pelanggan tersimpan. Menambah atau mengubah pelanggan memerlukan koneksi."
          />
        ) : null}
        <TextInput
          accessibilityLabel="Cari pelanggan"
          placeholder="Cari nama pelanggan"
          placeholderTextColor={theme.color.text.muted}
          value={query}
          onChangeText={setQuery}
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
          <LoadingState label="Memuat pelanggan…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Belum ada pelanggan tersimpan"
            body="Pelanggan dimuat saat online. Data ponsel disamarkan di perangkat."
          />
        ) : (
          rows.map((item) => (
            <View
              key={item.id}
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
                {item.name}
              </Text>
              <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                {item.phoneMasked} · {item.vehicleCount} kendaraan
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
