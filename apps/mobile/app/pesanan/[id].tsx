import { orderDetailSchema, orderListItemSchema, type OrderDetail, type OrderListItem } from "@workshop-pos/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { formatIdr } from "@workshop-pos/core";

import { useAuth } from "@/src/app/AuthProvider";
import { getRuntime } from "@/src/app/runtime";
import { useSync } from "@/src/app/SyncProvider";
import { Header, Money } from "@/src/components/chrome";
import { Badge, Divider, EmptyState, Notice, SectionTitle } from "@/src/components/forms";
import { Button, Card } from "@/src/components/ui";
import { cacheOrderDetail, getCachedOrder } from "@/src/db/repository";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from "@/src/domain/order-labels";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function PesananDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const runtime = getRuntime();
  const { session } = useAuth();
  const { online } = useSync();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [summary, setSummary] = useState<OrderListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const cached = await getCachedOrder(runtime.db, id);
      if (cancelled) return;
      const parsedDetail = orderDetailSchema.safeParse(cached);
      if (parsedDetail.success) setDetail(parsedDetail.data);
      const parsedSummary = orderListItemSchema.safeParse(cached);
      if (parsedSummary.success) setSummary(parsedSummary.data);

      if (!online) return;
      setLoading(true);
      try {
        const fresh = await runtime.endpoints.orderDetail(id);
        if (cancelled) return;
        setDetail(fresh);
        setError(null);
        if (session?.activeOutletId) {
          await cacheOrderDetail(
            runtime.db,
            session.activeOutletId,
            id,
            fresh,
            new Date().toISOString(),
          );
        }
      } catch {
        if (!cancelled) {
          setError("Detail terbaru tidak dapat dimuat. Menampilkan data tersimpan bila ada.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, online, runtime, session?.activeOutletId]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <Header
        title={detail?.orderNumber ?? summary?.orderNumber ?? "Pesanan"}
        subtitle={detail?.outletName ?? "Data tersimpan"}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12] }}>
        {!online ? (
          <Notice tone="neutral" message="Anda offline. Detail ini berasal dari data yang terakhir dimuat." />
        ) : null}
        {error ? <Notice tone="warning" message={error} /> : null}
        {loading && !detail ? (
          <Text style={[theme.type("body"), { color: theme.color.text.muted }]}>Memuat…</Text>
        ) : null}

        {detail ? (
          <>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[theme.type("title.sm"), { color: theme.color.text.primary }]}>
                  {ORDER_STATUS_LABELS[detail.status]}
                </Text>
                <Badge
                  label={ORDER_STATUS_LABELS[detail.status]}
                  {...theme.lifecycle(ORDER_STATUS_TONES[detail.status])}
                />
              </View>
              <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
                {detail.customer?.name ?? "Pelanggan umum"}
                {detail.vehicle ? ` · ${detail.vehicle.plate} ${detail.vehicle.brand} ${detail.vehicle.model}` : ""}
              </Text>
              {detail.technician ? (
                <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                  Mekanik: {detail.technician.name}
                </Text>
              ) : null}
              <Divider />
              <Row label="Subtotal" value={BigInt(detail.subtotal)} />
              {BigInt(detail.discountTotal) > 0n ? (
                <Row label="Diskon" value={BigInt(detail.discountTotal)} negative />
              ) : null}
              <Row label={`PPN ${detail.taxRate}%`} value={BigInt(detail.taxTotal)} />
              <Row label="Total" value={BigInt(detail.total)} strong />
              <Row label="Dibayar" value={BigInt(detail.paidTotal)} />
              <Row label="Sisa" value={BigInt(detail.balanceDue)} />
            </Card>

            <SectionTitle>Rincian</SectionTitle>
            {detail.lines.map((line) => (
              <Card key={line.id}>
                <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                  {line.lineType === "PRODUCT" ? "Spare part" : "Jasa"}
                </Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing[8] }}>
                  <Text
                    style={[theme.type("body.strong"), { color: theme.color.text.primary, flex: 1 }]}
                  >
                    {line.description}
                  </Text>
                  <Money value={BigInt(line.lineTotal)} size="body.strong" />
                </View>
                <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                  {line.quantity} × {formatIdr(BigInt(line.unitPrice))}
                </Text>
              </Card>
            ))}

            <SectionTitle>Pembayaran</SectionTitle>
            {detail.payments.length === 0 ? (
              <EmptyState title="Belum ada pembayaran" body="Transaksi ini belum menerima pembayaran." />
            ) : (
              detail.payments.map((payment) => (
                <Card key={payment.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>
                      {payment.method === "CASH" ? "Tunai" : payment.method === "TRANSFER" ? "Transfer" : "QRIS"}
                    </Text>
                    <Money value={BigInt(payment.amount)} size="body.strong" />
                  </View>
                  {payment.referenceNote ? (
                    <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                      Ref: {payment.referenceNote}
                    </Text>
                  ) : null}
                </Card>
              ))
            )}
          </>
        ) : summary ? (
          <Card>
            <Text style={[theme.type("title.sm"), { color: theme.color.text.primary }]}>
              {summary.orderNumber ?? "Pesanan"}
            </Text>
            <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
              {summary.customerName ?? "Pelanggan umum"}
              {summary.vehiclePlate ? ` · ${summary.vehiclePlate}` : ""}
            </Text>
            <Row label="Total" value={BigInt(summary.total)} strong />
            <Row label="Dibayar" value={BigInt(summary.paidTotal)} />
            <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
              Detail lengkap memerlukan koneksi. Data ringkas di atas berasal dari daftar terakhir.
            </Text>
          </Card>
        ) : (
          <EmptyState
            title="Detail belum tersedia"
            body="Buka pesanan ini saat online agar detailnya tersimpan untuk dibaca offline."
            action={
              online ? (
                <Button label="Muat ulang" variant="secondary" onPress={() => router.replace(`/pesanan/${id}`)} />
              ) : null
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  strong = false,
  negative = false,
}: {
  label: string;
  value: bigint;
  strong?: boolean;
  negative?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text
        style={[
          strong ? theme.type("body.strong") : theme.type("body"),
          { color: theme.color.text.secondary },
        ]}
      >
        {label}
      </Text>
      <Money
        value={value}
        size={strong ? "body.strong" : "body"}
        color={negative ? theme.color.status.success.fg : theme.color.text.primary}
      />
    </View>
  );
}
