import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/providers/AuthProvider";
import { Header } from "@/src/components/chrome";
import { Field, Notice, SectionTitle } from "@/src/components/forms";
import { Button } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * Last-resort sign-out when the device still holds unsynced sales. The reason
 * gate and the explicit destructive label make the loss of the queue a conscious
 * decision; the queue and every cached personal record are deleted afterwards.
 */

export default function KeluarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signOut } = useAuth();
  const params = useLocalSearchParams<{ pending?: string }>();
  const pending = Number.parseInt(params.pending ?? "0", 10) || 0;
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (reason.trim().length < 10) {
      setError("Alasan minimal 10 karakter.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signOut({ discardUnsynced: true });
      router.replace("/masuk");
    } catch {
      setError("Keluar gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <Header title="Keluar dan hapus data lokal" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12] }}>
        <Notice
          tone="danger"
          title={`${pending} transaksi belum tersinkron`}
          message="Keluar sekarang akan menghapus antrean, struk lokal, data pelanggan, dan kendaraan dari perangkat. Tindakan ini tidak dapat dibatalkan."
        />
        <SectionTitle>Alasan keluar</SectionTitle>
        <Field
          label="Alasan (wajib)"
          value={reason}
          onChangeText={setReason}
          placeholder="Contoh: perangkat dikembalikan ke pemilik"
          multiline
          maxLength={500}
          error={error}
        />
        <Button
          label={busy ? "Menghapus…" : "Keluar dan hapus data lokal"}
          variant="danger"
          onPress={() => void confirm()}
          loading={busy}
          disabled={reason.trim().length < 10}
        />
        <View style={{ flexDirection: "row", gap: theme.spacing[8] }}>
          <Button
            label="Sinkronkan dulu"
            variant="secondary"
            onPress={() => router.replace("/sinkron")}
            style={{ flex: 1 }}
          />
          <Button label="Tetap di sini" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
        </View>
        <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
          Sinkronkan antrean sebelum keluar untuk menghindari kehilangan transaksi yang sudah
          dibayar pelanggan.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
