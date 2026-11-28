import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, findNodeHandle, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatIdr } from "@workshop-pos/core";

import { getRuntime } from "@/src/providers/runtime";
import { useSync } from "@/src/providers/SyncProvider";
import { Button, Card, type PressableHandle } from "@/src/components/ui";
import { Header } from "@/src/components/chrome";
import { ErrorState, LoadingState, Notice, SectionTitle } from "@/src/components/forms";
import {
  getQueueItem,
  getReceiptSnapshot,
  markPrinted,
  type QueueRow,
  type ReceiptSnapshot,
} from "@/src/db/repository";
import {
  BluetoothPrinterTransport,
  type PrinterDevice,
} from "@/src/printing/bluetooth-transport";
import { PrinterPicker } from "@/src/printing/PrinterPicker";
import { buildLocalReceipt } from "@/src/printing/receipt";
import {
  createReceiptChannels,
  PrinterUnavailableError,
  type ReceiptChannelId,
} from "@/src/printing/sinks";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * Receipt preview and output (DESIGN §7.6). The preview is paper-white even in
 * dark mode and scrolls horizontally rather than reflowing 35/48 columns. The
 * thermal path is optional; sharing and PDF never need the internet.
 */

export default function StrukScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ clientKey: string; baru?: string }>();
  const clientKey = Array.isArray(params.clientKey) ? params.clientKey[0] : params.clientKey;
  const runtime = getRuntime();
  const { queue, lastSummary } = useSync();
  const [fetched, setFetched] = useState<QueueRow | null>(null);
  const [snapshot, setSnapshot] = useState<ReceiptSnapshot | null>(null);
  const [busy, setBusy] = useState<ReceiptChannelId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printedCount, setPrintedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [outputMessage, setOutputMessage] = useState<string | null>(null);
  const [printerPickerOpen, setPrinterPickerOpen] = useState(false);
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [printerLoading, setPrinterLoading] = useState(false);
  const printButtonRef = useRef<PressableHandle>(null);

  const transport = useMemo(() => new BluetoothPrinterTransport(), []);
  const row = queue.find((entry) => entry.clientKey === clientKey) ?? fetched;

  useEffect(() => {
    if (!clientKey) return;
    let cancelled = false;
    void Promise.all([
      getQueueItem(runtime.db, clientKey),
      getReceiptSnapshot(runtime.db, clientKey),
    ])
      .then(([queueRow, receipt]) => {
        if (cancelled) return;
        setFetched(queueRow);
        setSnapshot(receipt);
        setPrintedCount(queueRow?.printCount ?? 0);
        setLoadError(receipt ? null : "Data struk tidak ditemukan di perangkat ini.");
      })
      .catch(() => {
        if (!cancelled) setLoadError("Struk tidak dapat dibaca dari perangkat.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientKey, lastSummary, runtime]);

  const channels = useMemo(() => createReceiptChannels(transport), [transport]);
  const template = useMemo(() => {
    if (!snapshot) return null;
    return buildLocalReceipt(snapshot, {
      syncedOrderNumber: row?.serverOrderNumber ?? null,
      voided: row?.state === "VOIDED",
      isReprint: printedCount > 0,
      conflictPending: row?.state === "CONFLICT",
    });
  }, [printedCount, row?.serverOrderNumber, row?.state, snapshot]);

  async function output(channelId: ReceiptChannelId) {
    if (!clientKey || !template || busy) return;
    setError(null);
    setBusy(channelId);
    try {
      const channel = channels.find((entry) => entry.id === channelId);
      if (!channel) throw new Error("Saluran struk tidak tersedia.");
      await channel.run(template, row?.serverOrderNumber ?? snapshot?.localNumber ?? "struk");
      const count = await markPrinted(runtime.db, clientKey);
      setPrintedCount(count);
      setOutputMessage(
        channelId === "PDF"
          ? "Struk disimpan/dibagikan sebagai PDF."
          : channelId === "SHARE"
            ? "Struk dibagikan."
            : "Struk dikirim ke printer.",
      );
    } catch (caught) {
      if (caught instanceof PrinterUnavailableError) {
        setError(
          `${caught.message} Coba lagi, atau gunakan Simpan PDF / Bagikan struk tanpa internet.`,
        );
      } else {
        setError(caught instanceof Error ? caught.message : "Struk gagal dibuat.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function loadPrinters() {
    setPrinterError(null);
    setPrinterLoading(true);
    try {
      const devices = await transport.listPrinters();
      setPrinters(devices);
      setPrinterPickerOpen(true);
    } catch (caught) {
      setPrinters([]);
      setPrinterError(
        caught instanceof PrinterUnavailableError
          ? `${caught.message} Gunakan Simpan PDF atau Bagikan struk sebagai gantinya.`
          : "Daftar printer tidak dapat dibaca.",
      );
      setPrinterPickerOpen(true);
    } finally {
      setPrinterLoading(false);
    }
  }

  function closePrinterPicker() {
    setPrinterPickerOpen(false);
    // Return accessibility focus to the control that opened the sheet.
    setTimeout(() => {
      const node = findNodeHandle(printButtonRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 250);
  }

  async function selectPrinter(printer: PrinterDevice) {
    transport.selectPrinter(printer);
    closePrinterPicker();
    await output("THERMAL");
  }

  if (loading) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
        <Header title="Struk" onBack={() => router.back()} />
        <LoadingState label="Memuat struk…" />
      </SafeAreaView>
    );
  }

  if (!snapshot || !clientKey) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
        <Header title="Struk" onBack={() => router.back()} />
        <View style={{ padding: theme.spacing[16] }}>
          <ErrorState
            message={loadError ?? "Data struk tidak ditemukan di perangkat ini."}
            onRetry={() => router.replace(`/jual/struk/${clientKey ?? ""}`)}
          />
        </View>
      </SafeAreaView>
    );
  }

  const isNew = params.baru === "1";
  const synced = Boolean(row?.serverOrderNumber);
  const change = BigInt(snapshot.changeTotal);
  const paperWidth = template?.columns === 48 ? 80 : 58;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <Header
        title={synced ? `Struk ${row?.serverOrderNumber ?? ""}`.trim() : "Struk lokal"}
        subtitle={snapshot.outletName}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12] }}>
        {isNew ? (
          <Notice
            tone="success"
            title="Pembayaran berhasil"
            message={
              change > 0n
                ? `Kembalian ${formatIdr(change)}. Transaksi tersimpan di perangkat.`
                : "Transaksi tersimpan di perangkat."
            }
          />
        ) : null}
        {!synced ? (
          <Notice
            tone="warning"
            message={
              row?.state === "CONFLICT"
                ? "Transaksi ini menunggu keputusan konflik. Struk lokal tetap sah sebagai bukti pembayaran."
                : "Struk ini belum tersinkron ke server. Nomor transaksi final akan muncul setelah sinkronisasi."
            }
            action={
              row?.state === "CONFLICT" ? (
                <Button
                  label="Buka konflik"
                  variant="secondary"
                  onPress={() => router.push(`/konflik/${clientKey}`)}
                />
              ) : null
            }
          />
        ) : null}

        {row?.notices.map((notice, index) => (
          <Notice
            key={`${notice.code}-${index}`}
            tone={notice.code === "PRICE_CHANGED" ? "warning" : "info"}
            title={
              notice.code === "PRICE_CHANGED"
                ? "Harga katalog berubah"
                : notice.code === "CASH_REPORTING"
                  ? "Ditandai untuk laporan harian"
                  : undefined
            }
            message={notice.message}
          />
        ))}
        {outputMessage ? (
          <Notice tone="success" message={outputMessage} />
        ) : null}
        {error ? <Notice tone="danger" message={error} /> : null}

        <SectionTitle right={<Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>{paperWidth} mm · {template?.columns ?? 35} kolom</Text>}>
          Pratinjau struk
        </SectionTitle>
        <Card style={{ backgroundColor: "#FFFFFF", padding: theme.spacing[8] }}>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ padding: theme.spacing[8] }}>
            <Text
              style={{
                fontFamily: "IBMPlexMono_400Regular",
                fontSize: 12,
                lineHeight: 17,
                color: "#000000",
              }}
            >
              {template?.rows.join("\n") ?? ""}
            </Text>
          </ScrollView>
        </Card>

        <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
          {printedCount > 0
            ? `Sudah dicetak/dibagikan ${printedCount} kali; salinan berikutnya diberi tanda SALINAN.`
            : "Salinan pertama tidak diberi tanda SALINAN."}
        </Text>
      </ScrollView>
      <PrinterPicker
        visible={printerPickerOpen}
        printers={printers}
        loading={printerLoading}
        busy={busy === "THERMAL"}
        error={printerError}
        onSelect={(printer) => void selectPrinter(printer)}
        onClose={closePrinterPicker}
        onRefresh={() => void loadPrinters()}
      />
      <View
        style={{
          minHeight: theme.size.mobileActionBar,
          padding: theme.spacing[12],
          paddingBottom: theme.spacing[16],
          borderTopWidth: 1,
          borderTopColor: theme.color.border.subtle,
          backgroundColor: theme.color.bg.surface,
          gap: theme.spacing[8],
        }}
      >
        <Button
          label={
            busy === "THERMAL"
              ? "Mencetak…"
              : printerLoading
                ? "Mencari printer…"
                : "Cetak struk"
          }
          onPress={() => void loadPrinters()}
          loading={printerLoading || busy === "THERMAL"}
          disabled={busy !== null && busy !== "THERMAL"}
          buttonRef={printButtonRef}
        />
        <View style={{ flexDirection: "row", gap: theme.spacing[8] }}>
          <Button
            label={busy === "SHARE" ? "Membagikan…" : "Bagikan struk"}
            variant="secondary"
            onPress={() => void output("SHARE")}
            loading={busy === "SHARE"}
            disabled={busy !== null && busy !== "SHARE"}
            style={{ flex: 1 }}
          />
          <Button
            label={busy === "PDF" ? "Menyimpan…" : "Simpan PDF"}
            variant="secondary"
            onPress={() => void output("PDF")}
            loading={busy === "PDF"}
            disabled={busy !== null && busy !== "PDF"}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
