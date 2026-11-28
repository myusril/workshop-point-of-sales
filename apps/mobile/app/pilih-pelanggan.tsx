import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/providers/AuthProvider";
import { getRuntime } from "@/src/providers/runtime";
import { useSale } from "@/src/providers/SaleProvider";
import { Header } from "@/src/components/chrome";
import { EmptyState, LoadingState } from "@/src/components/forms";
import { TextLink } from "@/src/components/ui";
import { listCustomers, type CachedCustomer } from "@/src/db/repository";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function PilihPelangganScreen() {
  const theme = useTheme();
  const router = useRouter();
  const runtime = getRuntime();
  const { session } = useAuth();
  const { customer, setCustomer } = useSale();
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
      <Header title="Pilih pelanggan" onBack={() => router.back()} />
      <View style={{ padding: theme.spacing[16], gap: theme.spacing[12], flex: 1 }}>
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
        <TextLink
          label="Gunakan pelanggan umum"
          onPress={() => {
            setCustomer(null);
            router.back();
          }}
        />
        <ScrollView contentContainerStyle={{ gap: theme.spacing[8], paddingBottom: theme.spacing[24] }}>
          {!loaded ? (
            <LoadingState label="Memuat pelanggan…" />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Belum ada pelanggan"
              body="Pelanggan yang tersimpan di server akan muncul setelah data dimuat saat online. Menambah pelanggan memerlukan koneksi."
            />
          ) : (
            rows.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Pilih ${item.name}, ${item.phoneMasked}`}
                accessibilityState={{ selected: customer?.id === item.id }}
                onPress={() => {
                  setCustomer({ id: item.id, name: item.name });
                  router.back();
                }}
                style={{
                  minHeight: theme.size.rowMobile,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor:
                    customer?.id === item.id
                      ? theme.color.accent.default
                      : theme.color.border.subtle,
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
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
