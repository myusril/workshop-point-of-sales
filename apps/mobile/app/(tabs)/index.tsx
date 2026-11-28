import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { STAFF_ROLE_LABELS } from "@/src/domain/order-labels";
import { useAuth } from "@/src/providers/AuthProvider";
import { getRuntime } from "@/src/providers/runtime";
import { useSale } from "@/src/providers/SaleProvider";
import { hasAction } from "@/src/auth/session-store";
import { isDiscountAboveCap } from "@/src/pricing/order-pricing";
import { useSync } from "@/src/providers/SyncProvider";
import { formatIdr } from "@workshop-pos/core";
import { Header, Money, OfflineBanner, SyncChip } from "@/src/components/chrome";
import { EmptyState, ErrorState, LoadingState, Notice, SectionTitle, Segmented } from "@/src/components/forms";
import { Button, Card, TextLink } from "@/src/components/ui";
import { listCatalog, type CachedCatalogItem } from "@/src/db/repository";
import { formatWibTimestamp } from "@/src/format";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * Jual tab (DESIGN §7.2): add parts or labor to one mixed cart, keep the total
 * and the primary action visible, and never hide the offline/provisional state.
 */

type Segment = "PRODUCT" | "SERVICE";

const SEGMENTS = [
  { value: "PRODUCT" as const, label: "Spare part" },
  { value: "SERVICE" as const, label: "Jasa" },
];

export default function JualScreen() {
  const theme = useTheme();
  const router = useRouter();
  const runtime = getRuntime();
  const { session } = useAuth();
  const { online, conflicts, failed, pendingTotal, foreignPending, syncing, cacheAt, cacheFresh } = useSync();
  const {
    cart,
    outletName,
    settings,
    customer,
    vehicle,
    pricing,
    pricingError,
    productSubtotal,
    serviceSubtotal,
    discountBlocked,
    discountBlockReason,
    addItem,
    setQuantity,
    removeLine,
    restoreLine,
    setOrderDiscountPercent,
    clearCart,
  } = useSale();
  const [segment, setSegment] = useState<Segment>("PRODUCT");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CachedCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [undoLine, setUndoLine] = useState<{
    line: (typeof cart.lines)[number];
    index: number;
  } | null>(null);
  const [discountText, setDiscountText] = useState("");
  const [discountCapError, setDiscountCapError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const outletId = session?.activeOutletId ?? null;

  useEffect(() => {
    if (session?.user.role === "MECHANIC") {
      router.replace("/pesanan");
    }
  }, [router, session?.user.role]);

  useEffect(() => {
    if (!outletId) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      void listCatalog(runtime.db, outletId, { query, itemType: segment })
        .then((rows) => {
          if (cancelled) return;
          setItems(rows);
          setCatalogError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
          setCatalogError("Katalog tidak dapat dibaca dari perangkat.");
        })
        .finally(() => {
          if (!cancelled) setCatalogLoading(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [outletId, query, reloadToken, runtime, segment]);

  useEffect(() => {
    return () => {
      clearTimeout(timer.current ?? undefined);
      clearTimeout(undoTimer.current ?? undefined);
    };
  }, []);

  const total = pricing?.total ?? 0n;
  const lineCount = cart.lines.reduce((sum, line) => sum + line.quantity, 0);

  function handleAdd(item: CachedCatalogItem) {
    addItem(item);
    const nextTotal = total + BigInt(item.price);
    setAnnouncement(`${item.name} ditambahkan. Total ${formatIdr(nextTotal)}.`);
    setHighlighted(item.id);
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(() => setHighlighted(null), 600);
  }

  function handleRemove(lineKey: string, description: string) {
    const index = cart.lines.findIndex((entry) => entry.lineKey === lineKey);
    const line = cart.lines[index];
    removeLine(lineKey);
    if (!line) return;
    setUndoLine({ line, index });
    clearTimeout(undoTimer.current ?? undefined);
    undoTimer.current = setTimeout(() => setUndoLine(null), 5_000);
    setAnnouncement(`${description} dihapus dari keranjang.`);
  }

  function handleUndo() {
    if (!undoLine) return;
    restoreLine(undoLine.line, undoLine.index);
    setAnnouncement(`${undoLine.line.description} dikembalikan ke keranjang.`);
    setUndoLine(null);
  }

  function handleClear() {
    Alert.alert(
      "Kosongkan keranjang?",
      `${cart.lines.length} baris akan dihapus dari keranjang ini.`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Kosongkan", style: "destructive", onPress: clearCart },
      ],
    );
  }

  function changeDiscount(text: string) {
    const digitsOnly = text.replace(/[^0-9]/g, "").slice(0, 3);
    setDiscountText(digitsOnly);
    if (digitsOnly.length === 0) {
      setOrderDiscountPercent(null);
      return;
    }
    const percent = Number.parseInt(digitsOnly, 10);
    const base = pricing?.subtotal ?? 0n;
    const proposed = (base * BigInt(percent)) / 100n;
    if (
      isDiscountAboveCap(base, proposed, settings?.cashierDiscountCapPercent ?? 0) &&
      !hasAction(session, "override_discount")
    ) {
      setDiscountText("");
      setOrderDiscountPercent(null);
      setDiscountCapError(
        `Diskon di atas ${settings?.cashierDiscountCapPercent ?? 0}% memerlukan persetujuan Admin atau Pemilik.`,
      );
      return;
    }
    setDiscountCapError(null);
    setOrderDiscountPercent(percent);
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <Header
        title={outletName}
        subtitle={
          session
            ? `${STAFF_ROLE_LABELS[session.user.role] ?? session.user.role}: ${session.user.name}`
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
      {!online ? <OfflineBanner queued={pendingTotal + foreignPending} /> : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12] }}
        keyboardShouldPersistTaps="handled"
      >
        {announcement ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[theme.type("caption"), { color: theme.color.text.secondary }]}
          >
            {announcement}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: theme.spacing[8] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              customer ? `Pelanggan ${customer.name}. Ganti pelanggan` : "Pilih pelanggan"
            }
            onPress={() => router.push("/pilih-pelanggan")}
            style={{
              flex: 1,
              minHeight: theme.size.targetMobile,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.color.border.strong,
              backgroundColor: theme.color.bg.surface,
              justifyContent: "center",
              paddingHorizontal: theme.spacing[12],
            }}
          >
            <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
              Pelanggan
            </Text>
            <Text
              numberOfLines={1}
              style={[theme.type("body.strong"), { color: theme.color.text.primary }]}
            >
              {customer?.name ?? "Pelanggan umum"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              vehicle ? `Kendaraan ${vehicle.plate}. Ganti kendaraan` : "Pilih kendaraan"
            }
            onPress={() => router.push("/pilih-kendaraan")}
            style={{
              flex: 1,
              minHeight: theme.size.targetMobile,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.color.border.strong,
              backgroundColor: theme.color.bg.surface,
              justifyContent: "center",
              paddingHorizontal: theme.spacing[12],
            }}
          >
            <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
              Kendaraan
            </Text>
            <Text
              numberOfLines={1}
              style={[theme.type("body.strong"), { color: theme.color.text.primary }]}
            >
              {vehicle?.plate ?? "Tanpa kendaraan"}
            </Text>
          </Pressable>
        </View>

        <TextInput
          accessibilityLabel="Cari spare part atau jasa"
          placeholder="Cari spare part atau jasa"
          placeholderTextColor={theme.color.text.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
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
        <Segmented options={SEGMENTS} value={segment} onChange={setSegment} />

        <View style={{ gap: theme.spacing[8] }}>
          <SectionTitle
            right={
              <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                {online && cacheFresh && cacheAt
                  ? `Stok server · ${formatWibTimestamp(cacheAt)}`
                  : cacheAt
                    ? `Stok sementara · ${formatWibTimestamp(cacheAt)}`
                    : "Stok sementara"}
              </Text>
            }
          >
            {segment === "PRODUCT" ? "Spare part" : "Jasa"}
          </SectionTitle>
          {catalogLoading ? (
            <LoadingState label="Memuat katalog…" />
          ) : catalogError ? (
            <ErrorState
              message={catalogError}
              onRetry={() => {
                setCatalogLoading(true);
                setReloadToken((value) => value + 1);
              }}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title={query ? "Tidak ditemukan" : "Belum ada data"}
              body={
                query
                  ? "Coba kata kunci lain atau periksa ejaan."
                  : "Muat ulang data saat online agar katalog tersedia di perangkat."
              }
            />
          ) : (
            items.map((item) => {
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Tambah ${item.name}, Rp ${item.price}`}
                  accessibilityState={{ disabled: !item.isActive }}
                  disabled={!item.isActive}
                  onPress={() => handleAdd(item)}
                  style={{
                    minHeight: theme.size.rowMobile,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    borderColor:
                      highlighted === item.id
                        ? theme.color.accent.default
                        : theme.color.border.strong,
                    backgroundColor:
                      highlighted === item.id ? theme.color.accent.subtle : theme.color.bg.surface,
                    padding: theme.spacing[12],
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing[12],
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      numberOfLines={2}
                      style={[theme.type("body.strong"), { color: theme.color.text.primary }]}
                    >
                      {item.name}
                    </Text>
                    <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                      {item.itemType === "PRODUCT"
                        ? `${item.code ?? "—"} · ${
                            online && cacheFresh
                              ? `stok ${item.stockOnHand ?? 0}`
                              : `stok sementara ${item.stockOnHand ?? 0}`
                          }`
                        : `${item.durationMinutes ?? 0} menit`}
                    </Text>
                  </View>
                  <Money value={BigInt(item.price)} size="body.strong" />
                  <Text style={[theme.type("title.md"), { color: theme.color.accent.default }]}>
                    +
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ gap: theme.spacing[8] }}>
          <SectionTitle
            right={
              cart.lines.length > 0 ? (
                <TextLink label="Kosongkan" onPress={handleClear} tone="danger" />
              ) : null
            }
          >
            Keranjang ({lineCount})
          </SectionTitle>

          {cart.lines.length === 0 ? (
            <View style={{ gap: theme.spacing[8] }}>
              <EmptyState
                title="Keranjang masih kosong"
                body="Tambah spare part atau jasa untuk memulai transaksi."
              />
              <View style={{ flexDirection: "row", gap: theme.spacing[8] }}>
                <Button
                  label="Tambah spare part"
                  onPress={() => setSegment("PRODUCT")}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Tambah jasa"
                  variant="secondary"
                  onPress={() => setSegment("SERVICE")}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            [...cart.lines].reverse().map((line) => {
              const pricedIndex = cart.lines.findIndex((entry) => entry.lineKey === line.lineKey);
              const priced = pricing?.lines[pricedIndex];
              return (
                <Card key={line.lineKey}>
                  <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                    {line.lineType === "PRODUCT" ? "Spare part" : "Jasa"}
                  </Text>
                  <View style={{ flexDirection: "row", gap: theme.spacing[8] }}>
                    <Text
                      numberOfLines={2}
                      style={[
                        theme.type("body.strong"),
                        { color: theme.color.text.primary, flex: 1 },
                      ]}
                    >
                      {line.description}
                    </Text>
                    <Money value={priced?.lineTotal ?? line.unitPrice * BigInt(line.quantity)} size="body.strong" />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: theme.spacing[8],
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[8] }}>
                      <QuantityButton
                        label="Kurangi jumlah"
                        symbol="−"
                        onPress={() => setQuantity(line.lineKey, line.quantity - 1)}
                        disabled={line.quantity <= 1}
                      />
                      <Text
                        accessibilityLabel={`Jumlah ${line.quantity}`}
                        style={[theme.type("body.strong"), { color: theme.color.text.primary, minWidth: 32, textAlign: "center" }]}
                      >
                        {line.quantity}
                      </Text>
                      <QuantityButton
                        label="Tambah jumlah"
                        symbol="+"
                        onPress={() => setQuantity(line.lineKey, line.quantity + 1)}
                      />
                      <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                        {"\u00d7"} <Money value={line.unitPrice} size="caption" color={theme.color.text.muted} />
                      </Text>
                    </View>
                    <TextLink
                      label="Hapus"
                      tone="danger"
                      onPress={() => handleRemove(line.lineKey, line.description)}
                    />
                  </View>
                </Card>
              );
            })
          )}

          {undoLine ? (
            <Notice
              tone="neutral"
              message={`${undoLine.line.description} dihapus.`}
              action={<TextLink label="Urungkan" onPress={handleUndo} />}
            />
          ) : null}
        </View>

        {cart.lines.length > 0 ? (
          <Card>
            <Row label="Subtotal spare part" value={productSubtotal} />
            <Row label="Subtotal jasa" value={serviceSubtotal} />
            {pricing && pricing.discountTotal > 0n ? (
              <Row label="Diskon" value={-pricing.discountTotal} />
            ) : null}
            {pricing ? <Row label={`PPN ${settings?.taxRate ?? 11}%`} value={pricing.taxTotal} /> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[8] }}>
              <Text style={[theme.type("label"), { color: theme.color.text.secondary }]}>
                Diskon pesanan (%)
              </Text>
              <TextInput
                accessibilityLabel="Diskon pesanan dalam persen"
                value={discountText}
                onChangeText={changeDiscount}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={theme.color.text.muted}
                style={[
                  theme.type("body"),
                  {
                    minWidth: 72,
                    minHeight: theme.size.targetMobile,
                    borderWidth: 1,
                    borderColor: theme.color.border.strong,
                    borderRadius: theme.radius.sm,
                    paddingHorizontal: theme.spacing[8],
                    color: theme.color.text.primary,
                    backgroundColor: theme.color.bg.surface,
                  },
                ]}
              />
              {cart.discountPercent ? (
                <TextLink
                  label="Hapus diskon"
                  onPress={() => {
                    setDiscountText("");
                    setOrderDiscountPercent(null);
                  }}
                />
              ) : null}
            </View>
            {discountBlocked ? <Notice tone="warning" message={discountBlockReason ?? ""} /> : null}
            {discountCapError ? <Notice tone="warning" message={discountCapError} /> : null}
            {pricingError ? <Notice tone="danger" message={pricingError} /> : null}
          </Card>
        ) : null}
      </ScrollView>

      <View
        style={{
          minHeight: 56,
          paddingHorizontal: theme.spacing[16],
          paddingVertical: theme.spacing[8],
          borderTopWidth: 1,
          borderTopColor: theme.color.border.subtle,
          backgroundColor: theme.color.bg.surface,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[12],
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>Total</Text>
          {pricingError ? (
            <Text
              style={[theme.type("numeric.lg"), { color: theme.color.text.muted }]}
              testID="cart-total"
            >
              —
            </Text>
          ) : (
            <Money value={total} size="numeric.lg" testID="cart-total" />
          )}
        </View>
        <Button
          label="Bayar"
          onPress={() => router.push("/jual/bayar")}
          disabled={cart.lines.length === 0 || !pricing || Boolean(pricingError)}
          accessibilityLabel="Bayar transaksi"
          style={{ minWidth: 140 }}
        />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: bigint }) {
  const theme = useTheme();
  const negative = value < 0n;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>{label}</Text>
      <Money
        value={negative ? -value : value}
        size="body"
        color={negative ? theme.color.status.success.fg : theme.color.text.primary}
      />
    </View>
  );
}

function QuantityButton({
  label,
  symbol,
  onPress,
  disabled = false,
}: {
  label: string;
  symbol: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: theme.size.targetMobile,
        height: theme.size.targetMobile,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.color.border.strong,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={[theme.type("title.md"), { color: theme.color.text.primary }]}>{symbol}</Text>
    </Pressable>
  );
}
