"use client";

import { movementResponseSchema, type InventoryProduct, type StockInRequest } from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError, type FormErrorState } from "@/components/auth/api-error";
import { Field } from "@/components/back-office/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatStockQuantity } from "@/lib/format";

interface StockInFormProps {
  products: InventoryProduct[];
}

function fieldError(error: FormErrorState | null, name: string): string | undefined {
  return error?.fieldErrors[name]?.[0];
}

/**
 * Stock-in form (§2.9): picking an item shows the current stock and the
 * resulting stock before saving. Success reports the server-confirmed
 * before → after pair and refreshes the ledger and low-stock panel.
 */
export function StockInForm({ products }: StockInFormProps) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const product = products.find((entry) => entry.id === productId) ?? null;
  const quantityNumber = /^\d+$/.test(quantity) ? Number(quantity) : Number.NaN;
  const validQuantity = Number.isInteger(quantityNumber) && quantityNumber > 0;
  const projected = product && validQuantity ? product.stockOnHand + quantityNumber : null;
  const missingReason = !product
    ? "Pilih produk untuk mencatat stok masuk."
    : !validQuantity
      ? "Isi jumlah stok masuk minimal 1."
      : null;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || !validQuantity) return;

    const payload: StockInRequest = {
      productId: product.id,
      quantity: quantityNumber,
      note: note.trim().length > 0 ? note.trim() : undefined,
      reference: reference.trim().length > 0 ? reference.trim() : undefined,
    };

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/v1/inventory/stock-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      const parsed = movementResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        setError({
          message: "Stok masuk tersimpan, tetapi konfirmasi server tidak dapat dibaca. Muat ulang halaman.",
          fieldErrors: {},
        });
        router.refresh();
        return;
      }

      setSuccess(
        `Stok diperbarui: ${formatStockQuantity(parsed.data.entry.quantityBefore)} → ${formatStockQuantity(
          parsed.data.stockOnHand,
        )}.`,
      );
      setQuantity("");
      setNote("");
      setReference("");
      router.refresh();
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="bo-panel__body">
        <div className="bo-form-grid bo-form-grid--wide">
          <Field label="Produk" htmlFor="stock-in-product" required error={fieldError(error, "productId")}>
            <select
              className="bo-select"
              id="stock-in-product"
              value={productId}
              onChange={(event) => {
                setProductId(event.currentTarget.value);
                setSuccess(null);
              }}
              aria-invalid={Boolean(fieldError(error, "productId")) || undefined}
              aria-describedby={fieldError(error, "productId") ? "stock-in-product-error" : undefined}
            >
              <option value="">Pilih produk</option>
              {products.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} — {entry.sku} (stok {formatStockQuantity(entry.stockOnHand)})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Jumlah masuk" htmlFor="stock-in-quantity" required hint="Bilangan bulat lebih dari nol." error={fieldError(error, "quantity")}>
            <Input
              id="stock-in-quantity"
              value={quantity}
              inputMode="numeric"
              onChange={(event) => {
                setQuantity(event.currentTarget.value.replace(/\D/g, ""));
              }}
              aria-invalid={Boolean(fieldError(error, "quantity")) || undefined}
              aria-describedby={
                fieldError(error, "quantity") ? "stock-in-quantity-error" : "stock-in-quantity-hint"
              }
            />
          </Field>

          <Field label="Referensi (opsional)" htmlFor="stock-in-reference" hint="Nomor surat jalan atau nota pemasok." error={fieldError(error, "reference")}>
            <Input
              id="stock-in-reference"
              value={reference}
              onChange={(event) => {
                setReference(event.currentTarget.value);
              }}
              aria-invalid={Boolean(fieldError(error, "reference")) || undefined}
              aria-describedby={fieldError(error, "reference") ? "stock-in-reference-error" : "stock-in-reference-hint"}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="bo-field bo-field--spaced">
          <label className="bo-field__label" htmlFor="stock-in-note">
            Catatan (opsional)
          </label>
          <Textarea
            id="stock-in-note"
            value={note}
            onChange={(event) => {
              setNote(event.currentTarget.value);
            }}
            aria-invalid={Boolean(fieldError(error, "note")) || undefined}
            aria-describedby={fieldError(error, "note") ? "stock-in-note-error" : "stock-in-note-hint"}
          />
          {fieldError(error, "note") ? (
            <p className="bo-field__error" id="stock-in-note-error">
              {fieldError(error, "note")}
            </p>
          ) : (
            <p className="bo-field__hint" id="stock-in-note-hint">
              Jangan masukkan data pribadi yang tidak diperlukan.
            </p>
          )}
        </div>

        {projected !== null ? (
          <p className="bo-stock-preview" aria-live="polite">
            Stok saat ini <strong>{formatStockQuantity(product?.stockOnHand ?? null)}</strong> → Stok setelah{" "}
            <strong>{formatStockQuantity(projected)}</strong>
          </p>
        ) : null}

        <div className="bo-form-actions">
          <Button
            type="submit"
            variant="primary"
            disabled={pending || missingReason !== null}
            aria-busy={pending || undefined}
            aria-describedby={missingReason ? "stock-in-requirements" : undefined}
          >
            {pending ? "Menyimpan…" : "Simpan stok masuk"}
          </Button>
        </div>
        {missingReason ? (
          <p className="bo-field__hint" id="stock-in-requirements">
            {missingReason}
          </p>
        ) : null}

        {error ? (
          <div className="bo-form-status">
            <div className="bo-alert bo-alert--danger" role="alert">
              <p>{error.message}</p>
            </div>
          </div>
        ) : null}

        {success ? (
          <div className="bo-form-status">
            <p className="bo-alert bo-alert--success" role="status">
              {success}
            </p>
          </div>
        ) : null}
      </div>
    </form>
  );
}
