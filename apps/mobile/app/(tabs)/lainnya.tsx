import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Alert, Pressable, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { STAFF_ROLE_LABELS } from "@/src/domain/order-labels";
import { useAuth } from "@/src/app/AuthProvider";
import { useSync } from "@/src/app/SyncProvider";
import { Header, SyncChip } from "@/src/components/chrome";
import { Divider, Notice, SectionTitle } from "@/src/components/forms";
import { Card, TextLink } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function LainnyaScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, signOut, lock, hasPin, switchOutlet, pendingCount } = useAuth();
  const { online, pendingTotal, conflicts, failed, syncing, foreignPending, refreshCache, runNow } = useSync();

  async function handleSignOut() {
    const pending = await pendingCount();
    if (pending > 0) {
      Alert.alert(
        `${pending} transaksi belum tersinkron`,
        "Keluar akan menghapus antrean dan data pelanggan di perangkat. Sinkronkan dulu bila memungkinkan.",
        [
          { text: "Sinkronkan dulu", onPress: () => router.push("/sinkron") },
          { text: "Tetap di sini", style: "cancel" },
          {
            text: "Keluar dan hapus data lokal",
            style: "destructive",
            onPress: () => router.push({ pathname: "/keluar", params: { pending: String(pending) } }),
          },
        ],
      );
      return;
    }
    Alert.alert("Keluar dari perangkat?", "Data pelanggan dan sesi lokal akan dihapus.", [
      { text: "Batal", style: "cancel" },
      {
        text: "Keluar",
        style: "destructive",
        onPress: () => {
          void signOut({ discardUnsynced: true });
        },
      },
    ]);
  }

  async function handleSwitchOutlet(outletId: string) {
    try {
      await switchOutlet(outletId);
      await refreshCache();
      void runNow();
      Alert.alert("Outlet diganti", "Data lokal dimuat ulang untuk outlet ini.");
    } catch (error) {
      Alert.alert(
        "Gagal berganti outlet",
        error instanceof Error
          ? error.message
          : "Sinkronkan atau selesaikan antrean sebelum berganti outlet.",
      );
    }
  }

  const outlets = session?.outlets ?? [];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <Header
        title="Lainnya"
        subtitle={
          session
            ? `${session.user.name} · ${STAFF_ROLE_LABELS[session.user.role] ?? session.user.role}`
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
      <ScrollView contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12] }}>
        {!online ? (
          <Notice
            tone="warning"
            message="Anda offline. Laporan, tambah pelanggan, dan pengaturan outlet memerlukan koneksi."
          />
        ) : null}
        {foreignPending > 0 ? (
          <Notice
            tone="warning"
            message={`${foreignPending} transaksi dari outlet lain menunggu sinkron. Ganti ke outlet tersebut untuk mengirimnya.`}
          />
        ) : null}

        <Card>
          <SectionTitle>Sinkronisasi</SectionTitle>
          <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
            {pendingTotal + foreignPending > 0
              ? `${pendingTotal + foreignPending} transaksi menunggu (${foreignPending} dari outlet lain), ${conflicts} perlu tinjauan.`
              : "Semua transaksi di perangkat sudah tersinkron."}
          </Text>
          <TextLink label="Buka antrean sinkronisasi" onPress={() => router.push("/sinkron")} />
        </Card>

        <Card>
          <SectionTitle>Data</SectionTitle>
          <NavRow label="Pelanggan" onPress={() => router.push("/pelanggan")} />
          <Divider />
          <NavRow label="Kendaraan & riwayat servis" onPress={() => router.push("/kendaraan")} />
          <Divider />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Laporan penjualan, memerlukan koneksi"
            accessibilityState={{ disabled: true }}
            disabled
            style={{ minHeight: theme.size.targetMobile, justifyContent: "center", opacity: 0.55 }}
          >
            <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>
              Laporan penjualan
            </Text>
            <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
              Tersedia di back-office web; tidak dihitung sebagai transaksi offline.
            </Text>
          </Pressable>
        </Card>

        {outlets.length > 1 ? (
          <Card>
            <SectionTitle>Outlet</SectionTitle>
            {outlets.map((outlet) => (
              <Pressable
                key={outlet.id}
                accessibilityRole="radio"
                accessibilityLabel={`Ganti ke outlet ${outlet.name}`}
                accessibilityState={{ selected: outlet.id === session?.activeOutletId }}
                onPress={() => void handleSwitchOutlet(outlet.id)}
                style={{
                  minHeight: theme.size.targetMobile,
                  justifyContent: "center",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing[8],
                }}
              >
                <Text
                  style={[
                    theme.type("body.strong"),
                    {
                      color:
                        outlet.id === session?.activeOutletId
                          ? theme.color.accent.default
                          : theme.color.text.primary,
                      flex: 1,
                    },
                  ]}
                >
                  {outlet.name}
                </Text>
                <Text style={{ color: theme.color.accent.default }}>
                  {outlet.id === session?.activeOutletId ? "\u2713" : ""}
                </Text>
              </Pressable>
            ))}
          </Card>
        ) : null}

        <Card>
          <SectionTitle>Perangkat</SectionTitle>
          {hasPin ? (
            <>
              <TextLink label="Kunci perangkat" onPress={lock} />
              <Divider />
            </>
          ) : null}
          <TextLink label="Ganti pengguna / keluar" tone="danger" onPress={() => void handleSignOut()} />
          <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
            Versi {Constants.expoConfig?.version ?? "0.1.0"} · data lokal terhapus saat keluar.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function NavRow({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: theme.size.targetMobile,
        justifyContent: "center",
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Text style={[theme.type("body.strong"), { color: theme.color.text.primary, flex: 1 }]}>
        {label}
      </Text>
      <Text style={{ color: theme.color.text.muted }}>{"\u203a"}</Text>
    </Pressable>
  );
}
