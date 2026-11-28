import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatIdr } from "@workshop-pos/core";
import type { PaymentMethod } from "@workshop-pos/contracts";

import { hasAction } from "@/src/auth/session-store";
import { useAuth } from "@/src/providers/AuthProvider";
import { useSale } from "@/src/providers/SaleProvider";
import { useSync } from "@/src/providers/SyncProvider";
import { Header, Money } from "@/src/components/chrome";
import { NumericKeypad } from "@/src/components/NumericKeypad";
import { EmptyState, Field, Notice } from "@/src/components/forms";
import { Button, Card, TextLink } from "@/src/components/ui";
import { generateClientKey, planPayments, type TenderInput } from "@/src/domain/sale";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * Payment sheet (DESIGN §7.4). Money is applied at the counter and committed
 * locally before any network call; the confirmation says exactly which amount
 * will be taken. Cash overpayment becomes change, non-cash never exceeds the
 * balance, and a split keeps the outstanding amount visible.
 */

interface TenderView {
  tender: TenderInput;
  applied: bigint;
  change: bigint;
}

function tenderViewsFor(
  tenders: readonly TenderInput[],
  remaining: bigint,
): TenderView[] {
  const [first, ...rest] = tenders;
  if (!first) return [];
  const applied = first.tendered < remaining ? first.tendered : remaining;
  const change = first.method === "CASH" ? first.tendered - applied : 0n;
  return [
    { tender: first, applied, change },
    ...tenderViewsFor(rest, remaining - applied),
  ];
}

const METHODS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: "CASH", label: "Tunai", hint: "Uang diterima di konter" },
  { value: "TRANSFER", label: "Transfer bank", hint: "Catat referensi bank" },
  { value: "QRIS", label: "QRIS", hint: "Catat referensi QRIS" },
];

export default function BayarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { cart, pricing, settings, checkout, customer, vehicle, outletName } = useSale();
  const { online } = useSync();
  const { session } = useAuth();
  const canSell = hasAction(session, "create_sale");
  useEffect(() => {
    if (session && !canSell) router.replace("/");
  }, [canSell, router, session]);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [digits, setDigits] = useState("");
  const [reference, setReference] = useState("");
  const [tenders, setTenders] = useState<TenderInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const payingRef = useRef(false);
  const clientKeyRef = useRef(generateClientKey());

  const total = pricing?.total ?? 0n;
  const paidSoFar = useMemo(() => {
    let remaining = total;
    for (const tender of tenders) {
      if (remaining <= 0n) break;
      const take = tender.tendered < remaining ? tender.tendered : remaining;
      remaining -= take;
    }
    return total - remaining;
  }, [tenders, total]);
  const remaining = total - paidSoFar;
  const typed = BigInt(digits.length > 0 ? digits : "0");
  const tenderViews = useMemo(() => tenderViewsFor(tenders, total), [tenders, total]);
  const changePreview =
    method === "CASH" && typed > remaining && remaining >= 0n ? typed - remaining : 0n;

  const canSettle = remaining === 0n;

  function addTender() {
    setError(null);
    if (typed <= 0n) {
      setError("Masukkan jumlah pembayaran.");
      return;
    }
    if (remaining <= 0n) {
      setError("Tagihan sudah lunas.");
      return;
    }
    const trimmedReference = reference.trim();
    if (method !== "CASH" && trimmedReference.length === 0) {
      setError("Referensi wajib diisi untuk pembayaran non-tunai.");
      return;
    }
    if (method !== "CASH" && typed > remaining) {
      setError("Pembayaran non-tunai tidak boleh melebihi sisa tagihan.");
      return;
    }
    if (typed > remaining && method !== "CASH") {
      setError("Pembayaran melebihi sisa tagihan.");
      return;
    }
    const next: TenderInput = {
      method,
      tendered: typed,
      referenceNote: trimmedReference,
    };
    setTenders([...tenders, next]);
    setDigits("");
    setReference("");
  }

  async function pay() {
    if (payingRef.current) return;
    setError(null);
    let plan;
    try {
      plan = planPayments(total, tenders);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pembayaran belum lengkap.");
      return;
    }
    // Synchronous re-entrancy guard: `saving` state lags behind a fast double tap.
    payingRef.current = true;
    setSaving(true);
    try {
      const result = await checkout(plan.payments, { clientKey: clientKeyRef.current });
      router.replace({
        pathname: "/jual/struk/[clientKey]",
        params: { clientKey: result.clientKey, baru: "1" },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pembayaran gagal disimpan.");
    } finally {
      payingRef.current = false;
      setSaving(false);
    }
  }

  function removeTender(index: number) {
    setTenders((current) => current.filter((_entry, position) => position !== index));
    setError(null);
  }

  function goBack() {
    if (tenders.length === 0) {
      router.back();
      return;
    }
    Alert.alert(
      "Batalkan pembayaran?",
      "Pembayaran yang sudah ditambahkan belum tersimpan dan akan hilang.",
      [
        { text: "Tetap di sini", style: "cancel" },
        { text: "Batalkan", style: "destructive", onPress: () => router.back() },
      ],
    );
  }

  if (!pricing || cart.lines.length === 0) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
        <Header title="Pembayaran" onBack={() => router.back()} />
        <EmptyState
          title="Tidak ada tagihan"
          body="Tambahkan spare part atau jasa di keranjang sebelum membayar."
          action={<Button label="Kembali ke Jual" onPress={() => router.back()} />}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <View
        style={{
          minHeight: theme.size.mobileHeader,
          paddingHorizontal: theme.spacing[16],
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[8],
          backgroundColor: theme.color.bg.surface,
          borderBottomWidth: 1,
          borderBottomColor: theme.color.border.subtle,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali ke keranjang"
          onPress={goBack}
          style={{ minHeight: theme.size.targetMobile, justifyContent: "center" }}
        >
          <Text style={[theme.type("body.strong"), { color: theme.color.text.link }]}>
            {"\u2190 Pembayaran"}
          </Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>Total</Text>
          <Money value={total} size="numeric.lg" />
        </View>
      </View>

      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: theme.spacing[16],
          paddingVertical: theme.spacing[12],
          backgroundColor: theme.color.bg.surface,
          borderBottomWidth: 1,
          borderBottomColor: theme.color.border.subtle,
        }}
      >
        <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>
          Sisa tagihan
        </Text>
        <Money value={remaining} size="numeric.lg" testID="balance-due" />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing[16], gap: theme.spacing[12], paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >

        {tenderViews.map(({ tender, applied, change }, index) => (
          <Card key={`${tender.method}-${index}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>
                {METHODS.find((entry) => entry.value === tender.method)?.label ?? tender.method}
              </Text>
              <Money value={applied} size="body.strong" />
            </View>
            {change > 0n ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                  Uang diterima {formatIdr(tender.tendered)}
                </Text>
                <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                  Kembalian {formatIdr(change)}
                </Text>
              </View>
            ) : null}
            {tender.referenceNote ? (
              <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                Ref: {tender.referenceNote}
              </Text>
            ) : null}
            {tender.method !== "CASH" ? (
              <Text style={[theme.type("caption"), { color: theme.color.status.warning.fg }]}>
                Belum terverifikasi
              </Text>
            ) : null}
            <TextLink label="Hapus pembayaran" tone="danger" onPress={() => removeTender(index)} />
          </Card>
        ))}

        {!canSettle ? (
          <>
            <View accessibilityRole="radiogroup" style={{ gap: theme.spacing[8] }}>
              {METHODS.map((entry) => {
                const selected = entry.value === method;
                return (
                  <Pressable
                    key={entry.value}
                    accessibilityRole="radio"
                    accessibilityLabel={entry.label}
                    accessibilityState={{ checked: selected }}
                    onPress={() => setMethod(entry.value)}
                    style={{
                      minHeight: theme.size.primaryMobile,
                      borderRadius: theme.radius.md,
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected
                        ? theme.color.accent.default
                        : theme.color.border.default,
                      backgroundColor: selected
                        ? theme.color.accent.subtle
                        : theme.color.bg.surface,
                      paddingHorizontal: theme.spacing[12],
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing[8],
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[theme.type("body.strong"), { color: theme.color.text.primary }]}
                      >
                        {entry.label}
                      </Text>
                      <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                        {entry.hint}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: selected ? theme.color.accent.default : theme.color.border.strong,
                        ...theme.type("title.md"),
                      }}
                    >
                      {selected ? "\u2713" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {method !== "CASH" ? (
              <Field
                label="Referensi pembayaran"
                value={reference}
                onChangeText={setReference}
                placeholder={
                  method === "TRANSFER" ? "Nama bank dan 4 digit terakhir" : "Nomor referensi QRIS"
                }
                maxLength={64}
              />
            ) : null}

            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                  {method === "CASH" ? "Uang diterima" : "Jumlah"}
                </Text>
                <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                  {digits.length > 0 ? digits : "0"}
                </Text>
              </View>
              <Money value={typed} size="numeric.xl" />
              {method === "CASH" ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
                    Kembalian
                  </Text>
                  <Money value={changePreview} size="numeric.lg" />
                </View>
              ) : null}
              {limitMessage ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[theme.type("caption"), { color: theme.color.status.warning.fg }]}
                >
                  {limitMessage}
                </Text>
              ) : null}
            </Card>

            {method === "CASH" ? (
              <View style={{ flexDirection: "row", gap: theme.spacing[8], flexWrap: "wrap" }}>
                <QuickAmount
                  label="Uang pas"
                  value={remaining}
                  onPress={(value) => setDigits(value.toString())}
                />
                <QuickAmount
                  label="Rp 50.000"
                  value={50_000n}
                  onPress={(value) => setDigits(value.toString())}
                />
                <QuickAmount
                  label="Rp 100.000"
                  value={100_000n}
                  onPress={(value) => setDigits(value.toString())}
                />
              </View>
            ) : null}

            <NumericKeypad
              value={digits}
              onChange={setDigits}
              onLimit={() => setLimitMessage("Maksimal 12 digit.")}
            />

            <Button label="Tambahkan pembayaran" variant="secondary" onPress={addTender} />
          </>
        ) : (
          <Notice
            tone="success"
            title="Tagihan sudah tertutup"
            message={`Total ${formatIdr(total)}. Tekan Bayar untuk menyimpan transaksi di perangkat.`}
          />
        )}

        {error ? <Notice tone="danger" message={error} /> : null}
        {!online ? (
          <Notice
            tone="warning"
            message="Anda offline. Pembayaran disimpan di perangkat dan struk lokal dapat dicetak sekarang."
          />
        ) : null}
        <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
          {outletName}
          {customer ? ` · ${customer.name}` : ""}
          {vehicle ? ` · ${vehicle.plate}` : ""}
          {settings?.source === "DEFAULT" ? " · PPN dari pengaturan bawaan" : ""}
        </Text>
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          minHeight: theme.size.mobileActionBar,
          padding: theme.spacing[12],
          borderTopWidth: 1,
          borderTopColor: theme.color.border.subtle,
          backgroundColor: theme.color.bg.surface,
          flexDirection: "row",
          gap: theme.spacing[8],
        }}
      >
        <Button label="Batal" variant="secondary" onPress={goBack} style={{ flex: 1 }} />
        <View style={{ flex: 2, gap: theme.spacing[4] }}>
          {!canSettle ? (
            <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
              Tambahkan pembayaran sampai sisa tagihan Rp 0.
            </Text>
          ) : null}
          <Button
            label={saving ? "Menyimpan…" : `Bayar ${formatIdr(total)}`}
            onPress={() => void pay()}
            disabled={!canSettle || saving || !canSell}
            loading={saving}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function QuickAmount({
  label,
  value,
  onPress,
}: {
  label: string;
  value: bigint;
  onPress: (value: bigint) => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(value)}
      style={{
        minHeight: theme.size.targetMobile,
        paddingHorizontal: theme.spacing[12],
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.color.border.strong,
        backgroundColor: theme.color.bg.surface,
        justifyContent: "center",
      }}
    >
      <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>{label}</Text>
    </Pressable>
  );
}
