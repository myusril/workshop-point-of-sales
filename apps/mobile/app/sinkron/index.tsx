import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getRuntime } from "@/src/app/runtime";
import { useSync } from "@/src/app/SyncProvider";
import { Header, Money } from "@/src/components/chrome";
import { Badge, EmptyState, Notice, SectionTitle } from "@/src/components/forms";
import { Button, Card, TextLink } from "@/src/components/ui";
import { makeItemDue, makeQueueDue, requeueItem } from "@/src/db/repository";
import { outboxStatusLabel } from "@/src/domain/status";
import { formatWibTimestamp } from "@/src/format";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * Sync queue (DESIGN §7.5). Each row states its own state, retry time, and last
 * error; a conflict row links to a decision and never disappears from a retry.
 */

export default function SinkronScreen() {
  const theme = useTheme();
  const router = useRouter();
  const runtime = getRuntime();
  const {
    online,
    syncing,
    queue,
    pendingTotal,
    conflicts,
    failed,
    foreignPending,
    lastError,
    lastSummary,
    runNow,
    reload,
    refreshCache,
  } = useSync();
  const [message, setMessage] = useState<string | null>(null);

  const rows = [...queue]
    .reverse()
    .filter((row) => row.state !== "APPLIED" && row.state !== "VOIDED");

  async function syncNow() {
    setMessage(null);
    if (!online) {
      setMessage("Penyinkronan memerlukan koneksi. Antrean tetap tersimpan di perangkat.");
      return;
    }
    await makeQueueDue(runtime.db, new Date().toISOString());
    await reload();
    await runNow(true);
  }

  async function retryOne(clientKey: string) {
    if (!online) {
      setMessage("Kirim ulang memerlukan koneksi.");
      return;
    }
    await makeItemDue(runtime.db, clientKey, new Date().toISOString());
    await requeueItem(runtime.db, clientKey, new Date().toISOString());
    await reload();
    await runNow(true);
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <Header
        title="Sinkronisasi"
        subtitle={online ? "Online" : "Offline"}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12] }}>
        {!online ? (
          <Notice
            tone="warning"
            message="Anda offline. Transaksi baru tetap bisa dibuat; antrean dikirim otomatis saat koneksi kembali."
          />
        ) : null}
        {lastError ? <Notice tone="danger" message={lastError} /> : null}
        {foreignPending > 0 ? (
          <Notice
            tone="warning"
            message={`${foreignPending} transaksi dari outlet lain menunggu sinkron. Ganti ke outlet tersebut untuk mengirimnya; transaksi ini tidak hilang.`}
          />
        ) : null}
        {message ? <Notice tone="neutral" message={message} /> : null}

        <Card>
          <SectionTitle>Sisa pekerjaan</SectionTitle>
          <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
            {pendingTotal + foreignPending === 0
              ? "Tidak ada transaksi menunggu."
              : `${pendingTotal + foreignPending} transaksi menunggu · ${conflicts} perlu tinjauan · ${failed} gagal permanen · ${foreignPending} dari outlet lain.`}
          </Text>
          {lastSummary ? (
            <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
              Percobaan terakhir: {lastSummary.applied} tersinkron, {lastSummary.conflicts} konflik,{" "}
              {lastSummary.retries} dicoba ulang, {lastSummary.failed} gagal.
            </Text>
          ) : null}
          <Button
            label={syncing ? "Mengirim…" : "Sinkronkan sekarang"}
            onPress={() => void syncNow()}
            loading={syncing}
            disabled={!online}
          />
          <TextLink
            label="Muat ulang katalog, pelanggan, dan stok"
            onPress={() => {
              if (!online) {
                setMessage("Muat ulang data memerlukan koneksi.");
                return;
              }
              void refreshCache().catch(() =>
                setMessage("Data gagal dimuat. Periksa jaringan lalu coba lagi."),
              );
            }}
          />
        </Card>

        <SectionTitle>Antrean</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState
            title="Antrean kosong"
            body="Tidak ada penjualan yang menunggu. Transaksi yang sudah tersinkron ada di tab Pesanan."
          />
        ) : (
          rows.map((row) => {
            const status = outboxStatusLabel(row.state);
            const tone = theme.lifecycle(status.tone);
            return (
              <Card key={row.clientKey}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>
                    {row.serverOrderNumber ?? row.display.localNumber}
                  </Text>
                  <Badge label={status.label} fg={tone.fg} bg={tone.bg} border={tone.border} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                    {formatWibTimestamp(row.deviceRecordedAt)} · percobaan {row.attemptCount}
                  </Text>
                  <Money value={BigInt(row.display.total)} size="body.strong" />
                </View>
                {row.state === "RETRY" && row.nextAttemptAt ? (
                  <Text style={[theme.type("caption"), { color: theme.color.status.warning.fg }]}>
                    Berikutnya: {formatWibTimestamp(row.nextAttemptAt)}
                  </Text>
                ) : null}
                {row.lastError ? (
                  <Text style={[theme.type("caption"), { color: theme.color.status.danger.fg }]}>
                    {row.lastError}
                  </Text>
                ) : null}
                {row.conflict ? (
                  <Text style={[theme.type("caption"), { color: theme.color.status.danger.fg }]}>
                    {row.conflict.message}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: theme.spacing[8], flexWrap: "wrap" }}>
                  {row.state === "CONFLICT" ? (
                    <Button
                      label="Tinjau konflik"
                      variant="secondary"
                      onPress={() => router.push(`/konflik/${row.clientKey}`)}
                      style={{ flex: 1 }}
                    />
                  ) : null}
                  {row.state === "RETRY" || row.state === "FAILED" ? (
                    <Button
                      label="Kirim ulang"
                      variant="secondary"
                      onPress={() => void retryOne(row.clientKey)}
                      disabled={!online}
                      style={{ flex: 1 }}
                    />
                  ) : null}
                  <Button
                    label="Lihat struk"
                    variant="ghost"
                    onPress={() => router.push(`/jual/struk/${row.clientKey}`)}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
