import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatIdr } from "@workshop-pos/core";
import type { SyncResolveAction } from "@workshop-pos/contracts";

import { useAuth } from "@/src/app/AuthProvider";
import { getRuntime } from "@/src/app/runtime";
import { useSync } from "@/src/app/SyncProvider";
import { Header, Money } from "@/src/components/chrome";
import { Badge, ErrorState, Field, LoadingState, Notice, SectionTitle } from "@/src/components/forms";
import { Button, Card } from "@/src/components/ui";
import {
  getOutletSettings,
  getQueueItem,
  type OutletSettings,
  type QueueRow,
} from "@/src/db/repository";
import { conflictCodeExplanation, conflictTitle } from "@/src/domain/status";
import { conflictCashRefund, resolveQueuedConflict } from "@/src/sync/resolve-conflict";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * Blocking conflict decision (AC15.1–AC15.3, AC15.5).
 *
 * The screen shows the product, the local quantity, the server quantity, and the
 * money already taken. Override is Admin/Owner only; void records the cash
 * refund server-side and does not decrement stock. Leaving without a decision
 * keeps the persistent badge.
 */

export default function KonflikScreen() {
  const theme = useTheme();
  const router = useRouter();
  const runtime = getRuntime();
  const { session, canOverrideStock } = useAuth();
  const { queue, online, reload, refreshCache } = useSync();
  const params = useLocalSearchParams<{ clientKey: string }>();
  const clientKey = Array.isArray(params.clientKey) ? params.clientKey[0] : params.clientKey;
  const [fetched, setFetched] = useState<QueueRow | null>(null);
  const [settings, setSettings] = useState<OutletSettings | null>(null);
  const [mode, setMode] = useState<SyncResolveAction | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const row = queue.find((entry) => entry.clientKey === clientKey) ?? fetched;
  const outletId = row?.outletId ?? session?.activeOutletId ?? null;

  useEffect(() => {
    if (!clientKey) return;
    let cancelled = false;
    void getQueueItem(runtime.db, clientKey)
      .then((item) => {
        if (cancelled) return;
        setFetched(item);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Konflik tidak dapat dibaca dari perangkat.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientKey, runtime]);

  useEffect(() => {
    if (!outletId) return;
    void getOutletSettings(runtime.db, outletId, new Date().toISOString()).then(setSettings);
  }, [outletId, runtime]);

  async function submit(action: SyncResolveAction) {
    if (!row || !session || busy) return;
    setBusy(true);
    setError(null);
    try {
      await resolveQueuedConflict({
        engine: runtime.engine,
        row,
        action,
        reason,
        session,
        settings: settings ?? { voidReasonMinLength: 10 },
      });
      await reload();
      if (online) {
        // An override changes server stock; replace the provisional cache now.
        await refreshCache().catch(() => undefined);
      }
      router.replace(`/jual/struk/${row.clientKey}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Keputusan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  function confirm(action: SyncResolveAction) {
    if (!online) {
      setError("Keputusan konflik memerlukan koneksi ke server.");
      return;
    }
    if (!row) return;
    if (reason.trim().length < (settings?.voidReasonMinLength ?? 10)) {
      setError(`Alasan minimal ${settings?.voidReasonMinLength ?? 10} karakter.`);
      return;
    }
    const refund = conflictCashRefund(row);
    Alert.alert(
      action === "OVERRIDE" ? "Setujui dengan override?" : "Batalkan transaksi?",
      action === "OVERRIDE"
        ? "Stok server akan dikurangi melewati batas dan baris ledger ditandai OVERRIDE. Tindakan ini tercatat di audit."
        : `Transaksi dibatalkan tanpa mengurangi stok. Pengembalian dana ${formatIdr(refund)} dicatat sebagai refund.`,
      [
        { text: "Kembali", style: "cancel" },
        {
          text: action === "OVERRIDE" ? "Setujui override" : "Batalkan transaksi",
          style: "destructive",
          onPress: () => void submit(action),
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
        <Header title="Konflik" onBack={() => router.back()} />
        <LoadingState label="Memuat konflik…" />
      </SafeAreaView>
    );
  }

  if (!row) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
        <Header title="Konflik" onBack={() => router.back()} />
        <View style={{ padding: theme.spacing[16] }}>
          <ErrorState message={loadError ?? "Data konflik tidak ditemukan di perangkat ini."} />
        </View>
      </SafeAreaView>
    );
  }

  const conflict = row.conflict;
  const refund = conflictCashRefund(row);
  const minReason = settings?.voidReasonMinLength ?? 10;
  const resolved = row.state !== "CONFLICT";

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <Header
        title="Keputusan konflik"
        subtitle={conflictTitle(conflict?.code ?? row.conflictCode)}
        onBack={() => {
          if (resolved) {
            router.back();
            return;
          }
          Alert.alert(
            "Tinjau nanti?",
            "Konflik tetap tampil dengan tanda sampai ada keputusan eksplisit.",
            [
              { text: "Tetap di sini", style: "cancel" },
              { text: "Tinjau nanti", onPress: () => router.back() },
            ],
          );
        }}
      />
      <ScrollView contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12] }}>
        {resolved ? (
          <Notice
            tone={row.state === "VOIDED" ? "neutral" : "success"}
            title={row.state === "VOIDED" ? "Transaksi dibatalkan" : "Transaksi tersinkron"}
            message={
              row.state === "VOIDED"
                ? "Tidak ada pengurangan stok; refund tercatat di server."
                : "Konflik sudah diselesaikan."
            }
            action={
              <Button
                label="Lihat struk"
                variant="secondary"
                onPress={() => router.replace(`/jual/struk/${row.clientKey}`)}
              />
            }
          />
        ) : null}

        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[theme.type("title.sm"), { color: theme.color.text.primary }]}>
              {conflictTitle(conflict?.code ?? row.conflictCode)}
            </Text>
            <Badge
              label={conflict?.blocking === false ? "Informasi" : "Memblokir"}
              fg={
                conflict?.blocking === false
                  ? theme.color.status.info.fg
                  : theme.color.status.danger.fg
              }
              bg={
                conflict?.blocking === false
                  ? theme.color.status.info.bg
                  : theme.color.status.danger.bg
              }
              border={
                conflict?.blocking === false
                  ? theme.color.status.info.border
                  : theme.color.status.danger.border
              }
            />
          </View>
          <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
            {conflict?.message ?? conflictCodeExplanation(row.conflictCode)}
          </Text>
          <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
            {row.serverOrderNumber ?? row.display.localNumber} ·{" "}
            {row.display.customerName ?? "Pelanggan umum"}
            {row.display.vehiclePlate ? ` · ${row.display.vehiclePlate}` : ""}
          </Text>
        </Card>

        <Card>
          <SectionTitle>Rincian stok</SectionTitle>
          <Row label="Produk" value={conflict?.productName ?? "—"} />
          <Row label="Jumlah lokal" value={String(conflict?.localQuantity ?? "—")} />
          <Row label="Stok server" value={String(conflict?.serverQuantity ?? "—")} />
          {conflict?.plate ? <Row label="Nomor polisi" value={conflict.plate} /> : null}
          <SectionTitle>Uang sudah diterima</SectionTitle>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>Total</Text>
            <Money value={BigInt(row.display.total)} size="body.strong" />
          </View>
          <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
            Uang tetap sah walau stok server berbeda. Refund bila dibatalkan: {formatIdr(refund)}.
          </Text>
        </Card>

        {error ? <Notice tone="danger" message={error} /> : null}
        {!online ? (
          <Notice tone="warning" message="Keputusan konflik memerlukan koneksi. Transaksi tetap tertahan dan tidak hilang." />
        ) : null}

        {!resolved ? (
          <>
            <SectionTitle>Keputusan</SectionTitle>
            {mode ? (
              <>
                <Field
                  label={
                    mode === "OVERRIDE"
                      ? "Alasan override (wajib)"
                      : "Alasan pembatalan (wajib)"
                  }
                  value={reason}
                  onChangeText={setReason}
                  placeholder={`Minimal ${minReason} karakter`}
                  multiline
                  maxLength={500}
                  error={
                    reason.length > 0 && reason.trim().length < minReason
                      ? `Alasan minimal ${minReason} karakter.`
                      : null
                  }
                />
                <Button
                  label={mode === "OVERRIDE" ? "Setujui dengan override" : "Batalkan transaksi"}
                  variant="danger"
                  onPress={() => confirm(mode)}
                  loading={busy}
                  disabled={reason.trim().length < minReason}
                />
                <Button label="Pilih tindakan lain" variant="ghost" onPress={() => setMode(null)} />
              </>
            ) : (
              <>
                {canOverrideStock ? (
                  <Button
                    label="Setujui dengan override"
                    variant="secondary"
                    onPress={() => setMode("OVERRIDE")}
                  />
                ) : (
                  <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                    Override stok hanya untuk Admin atau Pemilik.
                  </Text>
                )}
                <Button label="Batalkan transaksi" variant="danger" onPress={() => setMode("VOID")} />
                <Button label="Tinjau nanti" variant="ghost" onPress={() => router.back()} />
                <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                  Konflik tetap tampil dengan tanda sampai ada keputusan eksplisit.
                </Text>
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing[8] }}>
      <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>{label}</Text>
      <Text style={[theme.type("body.strong"), { color: theme.color.text.primary, flexShrink: 1, textAlign: "right" }]}>
        {value}
      </Text>
    </View>
  );
}
