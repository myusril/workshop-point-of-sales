"use client";

import {
  catalogListResponseSchema,
  type CatalogItem,
  type OrderDetail,
  type OrderKind,
  type OrderTechnician,
  type ProductItem,
  type RecordPaymentResponse,
  type ServiceItem,
  type StaffRole,
  type VehicleListItem,
  vehicleListResponseSchema,
} from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError } from "@/components/auth/api-error";
import { Field } from "@/components/back-office/field";
import { StatusChip } from "@/components/back-office/status-chip";
import { PaymentForm } from "@/components/payments/payment-form";
import { ReceiptPreviewDialog } from "@/components/receipts/receipt-preview-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIdr } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from "@/lib/order-labels";
import { isDiscountAboveCap, priceOrder, type OrderPricing } from "@/lib/order-pricing";
import { parseIdr } from "@workshop-pos/core";

interface CartLine {
  key: string;
  lineType: "PRODUCT" | "SERVICE";
  catalogItemId: string;
  description: string;
  unitPrice: string;
  quantity: number;
  discountPercent: string;
}

export interface SaleScreenProps {
  role: StaffRole;
  /** A Mechanic performs intake only; the direct-sale option is absent. */
  canCreateSale: boolean;
  outletId: string;
  taxRate: number;
  cashierDiscountCapPercent: number;
  products: ProductItem[];
  services: ServiceItem[];
  vehicles: VehicleListItem[];
  technicians: OrderTechnician[];
}

function newCartKey(): string {
  return crypto.randomUUID();
}

/**
 * Walk-in counter screen: mixed cart, discount, server-recomputed totals, one
 * tender, then the receipt — without leaving the page (FR-030, AC3.1).
 *
 * Client totals are informational (they use the same pure pricing module); the
 * order and payment the API persists are always the server's own figures.
 */
export function SaleScreen({
  role,
  canCreateSale,
  outletId,
  taxRate,
  cashierDiscountCapPercent,
  products,
  services,
  vehicles,
  technicians,
}: SaleScreenProps) {
  const router = useRouter();
  const [kind, setKind] = useState<OrderKind>(canCreateSale ? "SALE" : "SERVICE");
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<{
    term: string;
    products: ProductItem[];
    services: ServiceItem[];
  } | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderDiscountPercent, setOrderDiscountPercent] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [vehicleResults, setVehicleResults] = useState<VehicleListItem[]>(vehicles);
  const [vehicle, setVehicle] = useState<VehicleListItem | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [vehicleSearching, setVehicleSearching] = useState(false);
  const [odometer, setOdometer] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<"cart" | "payment" | "done">("cart");
  const [created, setCreated] = useState<OrderDetail | null>(null);
  const [paid, setPaid] = useState<RecordPaymentResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const orderKey = useRef<string>(crypto.randomUUID());

  const searchTerm = query.trim();
  const productResults =
    searchTerm.length === 0
      ? products
      : remoteResults?.term === searchTerm
        ? remoteResults.products
        : [];
  const serviceResults =
    searchTerm.length === 0
      ? services
      : remoteResults?.term === searchTerm
        ? remoteResults.services
        : [];

  useEffect(() => {
    const term = query.trim();
    if (term.length === 0) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const [productResponse, serviceResponse] = await Promise.all([
          fetch(
            `/api/v1/catalog/products?q=${encodeURIComponent(term)}&type=product&status=active&pageSize=25`,
            { signal: controller.signal, cache: "no-store" },
          ),
          fetch(
            `/api/v1/catalog/services?q=${encodeURIComponent(term)}&type=service&status=active&pageSize=25`,
            { signal: controller.signal, cache: "no-store" },
          ),
        ]);

        if (!productResponse.ok || !serviceResponse.ok) {
          setCatalogError("Katalog gagal dimuat. Keranjang Anda tetap aman.");
          return;
        }

        const productPayload = catalogListResponseSchema.safeParse(await productResponse.json());
        const servicePayload = catalogListResponseSchema.safeParse(await serviceResponse.json());
        if (!productPayload.success || !servicePayload.success) {
          setCatalogError("Katalog gagal dibaca. Coba lagi.");
          return;
        }

        setRemoteResults({
          term,
          products: productPayload.data.items.filter(
            (item): item is ProductItem => item.itemType === "PRODUCT",
          ),
          services: servicePayload.data.items.filter(
            (item): item is ServiceItem => item.itemType === "SERVICE",
          ),
        });
        setCatalogError(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCatalogError(NETWORK_ERROR_MESSAGE);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, products, services]);

  const cartSubtotal = useMemo(
    () =>
      cart.reduce((sum, line) => {
        try {
          return sum + parseIdr(line.unitPrice) * BigInt(line.quantity);
        } catch {
          return sum;
        }
      }, 0n),
    [cart],
  );

  const pricing = useMemo<{ value: OrderPricing } | { error: string } | null>(() => {
    if (cart.length === 0) return null;
    try {
      const percent = orderDiscountPercent.trim();
      return {
        value: priceOrder({
          lines: cart.map((line) => ({
            quantity: line.quantity,
            unitPrice: parseIdr(line.unitPrice),
            discountPercent: line.discountPercent.trim() ? Number(line.discountPercent) : null,
          })),
          taxRatePercent: taxRate,
          orderDiscountPercent: percent.length > 0 ? Number(percent) : null,
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Total belum dapat dihitung." };
    }
  }, [cart, orderDiscountPercent, taxRate]);

  const hasServiceLine = cart.some((line) => line.lineType === "SERVICE");
  const needsVehicle = kind === "SERVICE" || hasServiceLine;
  const aboveCap =
    pricing && "value" in pricing
      ? isDiscountAboveCap(
          pricing.value.subtotal,
          pricing.value.discountTotal,
          cashierDiscountCapPercent,
        )
      : false;

  function addToCart(item: CatalogItem) {
    setCart((current) => {
      const existing = current.find(
        (line) => line.catalogItemId === item.id && line.lineType === item.itemType,
      );
      if (existing) {
        return current.map((line) =>
          line.key === existing.key
            ? { ...line, quantity: Math.min(999, line.quantity + 1) }
            : line,
        );
      }
      return [
        ...current,
        {
          key: newCartKey(),
          lineType: item.itemType,
          catalogItemId: item.id,
          description: item.name,
          unitPrice: item.price,
          quantity: 1,
          discountPercent: "",
        },
      ];
    });
    setMessage(null);
  }

  function updateLine(key: string, changes: Partial<CartLine>) {
    setCart((current) =>
      current.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }

  function removeLine(key: string) {
    setCart((current) => current.filter((line) => line.key !== key));
  }

  async function searchVehicles() {
    setVehicleSearching(true);
    setVehicleError(null);
    try {
      const response = await fetch(
        `/api/v1/vehicles?q=${encodeURIComponent(vehicleQuery.trim())}&pageSize=10`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const error = await readApiError(response);
        setVehicleError(error.message);
        return;
      }
      const parsed = vehicleListResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        setVehicleError("Pencarian kendaraan gagal dibaca. Coba lagi.");
        return;
      }
      setVehicleResults(parsed.data.items);
    } catch {
      setVehicleError(NETWORK_ERROR_MESSAGE);
    } finally {
      setVehicleSearching(false);
    }
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setMessage(null);

    if (cart.length === 0) {
      setMessage("Tambahkan minimal satu item.");
      return;
    }
    if (needsVehicle && !vehicle) {
      setMessage("Baris jasa memerlukan kendaraan. Pilih kendaraan terlebih dahulu.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          outletId,
          customerId: vehicle?.customerId ?? null,
          vehicleId: vehicle?.id ?? null,
          technicianId: technicianId || null,
          odometer: odometer.trim() ? Number(odometer) : null,
          notes: notes.trim() ? notes.trim() : null,
          discountPercent: orderDiscountPercent.trim()
            ? Number(orderDiscountPercent)
            : undefined,
          discountReason: discountReason.trim() ? discountReason.trim() : undefined,
          lines: cart.map((line) => ({
            lineType: line.lineType,
            catalogItemId: line.catalogItemId,
            quantity: line.quantity,
            discountPercent: line.discountPercent.trim()
              ? Number(line.discountPercent)
              : undefined,
          })),
          idempotencyKey: orderKey.current,
        }),
      });

      if (!response.ok) {
        const error = await readApiError(response);
        setMessage(error.message);
        setFieldErrors(error.fieldErrors);
        return;
      }

      const payload = (await response.json()) as { item: OrderDetail };
      setCreated(payload.item);
      if (kind === "SERVICE") {
        router.push(`/orders/${payload.item.id}`);
        return;
      }
      setPhase("payment");
    } catch {
      setMessage(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  function resetSale() {
    setCart([]);
    setOrderDiscountPercent("");
    setDiscountReason("");
    setVehicle(null);
    setVehicleQuery("");
    setOdometer("");
    setTechnicianId("");
    setNotes("");
    setCreated(null);
    setPaid(null);
    setPhase("cart");
    setMessage(null);
    setFieldErrors({});
    orderKey.current = crypto.randomUUID();
  }

  if (phase === "payment" && created) {
    return (
      <div className="bo-stack">
        <section className="bo-panel" aria-label="Pembayaran transaksi">
          <div className="bo-panel__header">
            <h2 className="bo-panel__title">Pembayaran {created.orderNumber}</h2>
          </div>
          <div className="bo-panel__body">
            <PaymentForm
              orderId={created.id}
              total={created.total}
              balanceDue={created.balanceDue}
              onRecorded={(response) => {
                setPaid(response);
                setCreated(response.item);
                // A partial tender keeps the counter on this step so the
                // remainder is collected instead of reporting success.
                setPhase(BigInt(response.item.balanceDue) > 0n ? "payment" : "done");
              }}
            />
          </div>
        </section>
        {paid && BigInt(paid.item.balanceDue) > 0n ? (
          <p className="bo-alert bo-alert--info" role="status">
            Pembayaran sebagian tercatat. Sisa tagihan {formatIdr(paid.item.balanceDue)}.
          </p>
        ) : null}
        <p className="text-sm text-ink-muted">
          Transaksi tersimpan sebagai draf. Anda dapat membayarnya nanti dari halaman transaksi.
        </p>
      </div>
    );
  }

  if (phase === "done" && created) {
    const change = paid ? BigInt(paid.payment.changeAmount) : 0n;
    return (
      <div className="bo-stack">
        <section className="bo-panel" aria-label="Hasil pembayaran">
          <div className="bo-panel__header">
            <h2 className="bo-panel__title">Pembayaran berhasil</h2>
          </div>
          <div className="bo-panel__body flex flex-col gap-3">
            <p role="status" className="text-sm">
              Total {formatIdr(created.total)}.{" "}
              {change > 0n ? `Kembalian ${formatIdr(change)}.` : "Tidak ada kembalian."}
            </p>
            <p className="text-sm text-ink-secondary">
              Nota {created.orderNumber} ·{" "}
              <StatusChip tone={ORDER_STATUS_TONES[created.status]}>
                {ORDER_STATUS_LABELS[created.status]}
              </StatusChip>
            </p>
            <div className="flex flex-wrap gap-2">
              <ReceiptPreviewDialog orderId={created.id} label="Pratinjau struk" />
              <Button asChild variant="primary">
                <a
                  href={`/print/receipt/${created.id}?print=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Cetak struk
                </a>
              </Button>
              <Button type="button" variant="secondary" onClick={resetSale}>
                Transaksi baru
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.push(`/orders/${created.id}`)}>
                Buka transaksi
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <form className="bo-stack" onSubmit={saveOrder} noValidate>
      {message ? (
        <p className="bo-alert bo-alert--danger" role="alert">
          {message}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="bo-stack">
          <section className="bo-panel" aria-label="Jenis transaksi">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title">Jenis transaksi</h2>
            </div>
            <div className="bo-panel__body flex flex-wrap gap-4">
              {canCreateSale ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="kind"
                    value="SALE"
                    checked={kind === "SALE"}
                    onChange={() => {
                      setKind("SALE");
                    }}
                  />
                  Penjualan langsung
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input
                  className="accent-accent"
                  type="radio"
                  name="kind"
                  value="SERVICE"
                  checked={kind === "SERVICE"}
                  onChange={() => {
                    setKind("SERVICE");
                  }}
                />
                Servis (nota servis)
              </label>
            </div>
          </section>

          <section className="bo-panel" aria-label="Tambah item">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title">Tambah spare part atau jasa</h2>
            </div>
            <div className="bo-panel__body flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold" htmlFor="catalog-query">
                  Cari item
                </label>
                <Input
                  id="catalog-query"
                  type="search"
                  value={query}
                  placeholder="Nama atau kode item"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setCatalogError(null);
                  }}
                />
              </div>

              {catalogError ? (
                <p className="bo-alert bo-alert--danger" role="alert">
                  {catalogError}
                </p>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Spare part</h3>
                  {productResults.length === 0 ? (
                    <p className="text-sm text-ink-muted">Tidak ada spare part yang cocok.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {productResults.map((product) => (
                        <li key={product.id} className="flex items-center justify-between gap-3 text-sm">
                          <span>
                            {product.name}{" "}
                            <span className="text-ink-muted">
                              · {formatIdr(product.price)} · stok {product.stockOnHand}
                            </span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            aria-label={`Tambah ${product.name}`}
                            onClick={() => {
                              addToCart(product);
                            }}
                          >
                            Tambah
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Jasa</h3>
                  {serviceResults.length === 0 ? (
                    <p className="text-sm text-ink-muted">Tidak ada jasa yang cocok.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {serviceResults.map((service) => (
                        <li key={service.id} className="flex items-center justify-between gap-3 text-sm">
                          <span>
                            {service.name}{" "}
                            <span className="text-ink-muted">· {formatIdr(service.price)}</span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            aria-label={`Tambah ${service.name}`}
                            onClick={() => {
                              addToCart(service);
                            }}
                          >
                            Tambah
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="bo-panel" aria-label="Keranjang">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title">Keranjang</h2>
            </div>
            <div className="bo-panel__body">
              {cart.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Keranjang masih kosong. Tambah spare part atau jasa.
                </p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {cart.map((line) => (
                    <li key={line.key} className="flex flex-col gap-2 border-b border-line-subtle pb-3 last:border-b-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold">{line.description}</p>
                        <p className="text-sm">
                          {formatIdr(
                            (BigInt(line.unitPrice) || 0n) * BigInt(line.quantity),
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="bo-filterbar__field">
                          <label className="text-xs" htmlFor={`qty-${line.key}`}>
                            Jumlah
                          </label>
                          <Input
                            id={`qty-${line.key}`}
                            type="number"
                            min={1}
                            max={999}
                            step={1}
                            className="w-24"
                            value={line.quantity}
                            onChange={(event) => {
                              updateLine(line.key, {
                                quantity: Math.max(1, Math.min(999, Number(event.target.value) || 1)),
                              });
                            }}
                          />
                        </div>
                        <div className="bo-filterbar__field">
                          <label className="text-xs" htmlFor={`discount-${line.key}`}>
                            Diskon baris (%)
                          </label>
                          <Input
                            id={`discount-${line.key}`}
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            className="w-24"
                            value={line.discountPercent}
                            onChange={(event) => {
                              updateLine(line.key, { discountPercent: event.target.value });
                            }}
                          />
                        </div>
                        <p className="text-xs text-ink-muted">
                          Harga satuan {formatIdr(line.unitPrice)}
                        </p>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            removeLine(line.key);
                          }}
                        >
                          Hapus {line.description}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="bo-panel" aria-label="Kendaraan dan teknisi">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title">Kendaraan dan teknisi</h2>
            </div>
            <div className="bo-panel__body flex flex-col gap-4">
              {needsVehicle ? (
                <p className="bo-alert bo-alert--info" role="status">
                  Transaksi ini memerlukan kendaraan.
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold" htmlFor="vehicle-query">
                  Cari kendaraan
                </label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="vehicle-query"
                    className="min-w-0 flex-1"
                    type="search"
                    value={vehicleQuery}
                    placeholder="Nomor polisi"
                    onChange={(event) => {
                      setVehicleQuery(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      void searchVehicles();
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={vehicleSearching}
                    onClick={() => {
                      void searchVehicles();
                    }}
                  >
                    {vehicleSearching ? "Mencari…" : "Cari"}
                  </Button>
                </div>
              </div>
              {vehicleError ? (
                <p className="bo-alert bo-alert--danger" role="alert">
                  {vehicleError}
                </p>
              ) : null}
              {vehicle ? (
                <p className="text-sm" role="status">
                  Kendaraan dipilih: <strong>{vehicle.normalizedPlate}</strong> {vehicle.brand}{" "}
                  {vehicle.model} · {vehicle.customerName}
                </p>
              ) : null}
              <ul className="flex flex-col gap-2">
                {vehicleResults.map((option) => (
                  <li key={option.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <strong>{option.normalizedPlate}</strong> {option.brand} {option.model} ·{" "}
                      {option.customerName}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      aria-label={`Pilih kendaraan ${option.normalizedPlate}`}
                      onClick={() => {
                        setVehicle(option);
                        if (option.odometer !== null && odometer.length === 0) {
                          setOdometer(String(option.odometer));
                        }
                      }}
                    >
                      Pilih
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Odometer" htmlFor="order-odometer" hint="Kilometer saat masuk.">
                  <Input
                    id="order-odometer"
                    type="number"
                    min={0}
                    step={1}
                    value={odometer}
                    onChange={(event) => {
                      setOdometer(event.target.value);
                    }}
                  />
                </Field>
                <Field label="Teknisi" htmlFor="order-technician">
                  <select
                    id="order-technician"
                    className="bo-select"
                    value={technicianId}
                    onChange={(event) => {
                      setTechnicianId(event.target.value);
                    }}
                  >
                    <option value="">Belum ditentukan</option>
                    {technicians.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Catatan" htmlFor="order-notes">
                <Input
                  id="order-notes"
                  value={notes}
                  maxLength={500}
                  onChange={(event) => {
                    setNotes(event.target.value);
                  }}
                />
              </Field>
            </div>
          </section>
        </div>

        <aside className="bo-stack">
          <section className="bo-panel" aria-label="Total transaksi">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title">Total</h2>
            </div>
            <div className="bo-panel__body flex flex-col gap-4">
              {pricing && "error" in pricing ? (
                <p className="bo-alert bo-alert--danger" role="alert">
                  {pricing.error}
                </p>
              ) : null}
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-secondary">Subtotal</dt>
                  <dd className="tabular-nums">{formatIdr(cartSubtotal)}</dd>
                </div>
                {pricing && "value" in pricing ? (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-secondary">Diskon</dt>
                      <dd className="tabular-nums">{formatIdr(pricing.value.discountTotal)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-secondary">PPN {taxRate}%</dt>
                      <dd className="tabular-nums">{formatIdr(pricing.value.taxTotal)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 font-semibold">
                      <dt>Total</dt>
                      <dd className="tabular-nums">{formatIdr(pricing.value.total)}</dd>
                    </div>
                  </>
                ) : null}
              </dl>

              <Field label="Diskon transaksi (%)" htmlFor="order-discount">
                <Input
                  id="order-discount"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={orderDiscountPercent}
                  onChange={(event) => {
                    setOrderDiscountPercent(event.target.value);
                  }}
                  aria-invalid={Boolean(fieldErrors.discountPercent)}
                  aria-describedby={
                    fieldErrors.discountPercent ? "order-discount-error" : "order-discount-hint"
                  }
                />
              </Field>
              {fieldErrors.discountPercent ? (
                <p id="order-discount-error" className="bo-field__error" role="alert">
                  {fieldErrors.discountPercent[0]}
                </p>
              ) : (
                <p id="order-discount-hint" className="bo-field__hint">
                  {role === "CASHIER"
                    ? `Diskon di atas ${cashierDiscountCapPercent}% memerlukan persetujuan Admin atau Pemilik.`
                    : "Diskon di atas batas kasir dicatat di audit bersama alasannya."}
                </p>
              )}

              {aboveCap ? (
                <Field
                  label="Alasan diskon"
                  htmlFor="order-discount-reason"
                  required
                  hint="Tercatat di audit bersama identitas penyetuju."
                >
                  <Input
                    id="order-discount-reason"
                    value={discountReason}
                    maxLength={200}
                    onChange={(event) => {
                      setDiscountReason(event.target.value);
                    }}
                  />
                </Field>
              ) : null}

              {aboveCap && role === "CASHIER" ? (
                <p className="bo-alert bo-alert--warning" role="status">
                  Diskon ini akan ditolak untuk Kasir. Minta Admin atau Pemilik menyimpan transaksi.
                </p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                disabled={pending || cart.length === 0}
                aria-busy={pending}
                aria-describedby="save-order-hint"
              >
                {pending ? "Menyimpan transaksi…" : "Simpan transaksi"}
              </Button>
              <p id="save-order-hint" className="text-xs text-ink-muted">
                {cart.length === 0
                  ? "Tambahkan minimal satu item untuk menyimpan transaksi."
                  : "Total dihitung ulang oleh server saat disimpan."}
              </p>
              {kind === "SERVICE" ? (
                <p className="text-xs text-ink-muted">
                  Nota servis disimpan sebagai draf; lanjutkan estimasi dan persetujuan di halaman
                  transaksi.
                </p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
