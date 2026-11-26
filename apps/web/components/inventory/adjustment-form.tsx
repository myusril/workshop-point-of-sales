"use client";

import {
  movementResponseSchema,
  type AdjustmentRequest,
  type InventoryProduct,
} from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useRef, useState, type SubmitEvent } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError, type FormErrorState } from "@/components/auth/api-error";
import { Field } from "@/components/back-office/field";
import { StatusChip } from "@/components/back-office/status-chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatStockQuantity } from "@/lib/format";

interface AdjustmentFormProps {
  products: InventoryProduct[];
  canOverride: boolean;
}

function fieldError(error: FormErrorState | null, name: string): string | undefined {
  return error?.fieldErrors[name]?.[0];
}

function normalizeSignedQuantity(raw: string): string {
  const cleaned = raw.replace(/[^\d-]/g, "");
  const negative = cleaned.startsWith("-");
  return `${negative ? "-" : ""}${cleaned.replace(/-/g, "")}`;
}

/**
 * Adjustment form (§2.9): a signed movement, a mandatory reason, a live
 * current → resulting preview, and an explicit override confirmation when the
 * result would be negative. Stock is server-authoritative; the form never
 * claims a final quantity before the ledger row is confirmed.
 */
export function AdjustmentForm({ products, canOverride }: AdjustmentFormProps) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submitRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const product = products.find((entry) => entry.id === productId) ?? null;
  const deltaValue = /^-?\d+$/.test(delta) ? Number(delta) : Number.NaN;
  const validDelta = Number.isInteger(deltaValue) && deltaValue !== 0;
  const validReason = reason.trim().length >= 3;
  const projected = product && validDelta ? product.stockOnHand + deltaValue : null;
  const wouldBeNegative = projected !== null && projected < 0;

  const missingReason = !product
    ? "Pilih produk untuk menyesuaikan stok."
    : !validDelta
      ? "Isi jumlah penyesuaian berupa bilangan bulat selain nol."
      : !validReason
        ? "Isi alasan penyesuaian minimal 3 karakter."
        : wouldBeNegative && !canOverride
          ? "Stok tidak cukup dan peran Anda tidak dapat memberi override. Kurangi jumlah atau minta Admin/Pemilik."
          : null;

  async function save(override: boolean) {
    if (!product || !validDelta) return;

    const payload: AdjustmentRequest = {
      productId: product.id,
      quantityDelta: deltaValue,
      reason: reason.trim(),
      reference: reference.trim().length > 0 ? reference.trim() : undefined,
      override,
    };

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/v1/inventory/adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setConfirmOpen(false);
        setError(await readApiError(response));
        return;
      }

      const parsed = movementResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        setConfirmOpen(false);
        setError({
          message: "Penyesuaian tersimpan, tetapi konfirmasi server tidak dapat dibaca. Muat ulang halaman.",
          fieldErrors: {},
        });
        router.refresh();
        return;
      }

      const { entry, stockOnHand } = parsed.data;
      setSuccess(
        `Stok diperbarui: ${formatStockQuantity(entry.quantityBefore)} → ${formatStockQuantity(stockOnHand)}.${
          entry.override ? " Baris buku besar ditandai override." : ""
        }`,
      );
      setConfirmOpen(false);
      setDelta("");
      setReason("");
      setReference("");
      router.refresh();
    } catch {
      setConfirmOpen(false);
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingReason !== null) return;

    if (wouldBeNegative) {
      setConfirmOpen(true);
      return;
    }

    void save(false);
  }

  return (
    <>
      <form onSubmit={submit} noValidate>
        <div className="bo-panel__body">
          <div className="bo-form-grid bo-form-grid--wide">
            <Field label="Produk" htmlFor="adjustment-product" required error={fieldError(error, "productId")}>
              <select
                className="bo-select"
                id="adjustment-product"
                value={productId}
                onChange={(event) => {
                  setProductId(event.currentTarget.value);
                  setSuccess(null);
                }}
                aria-invalid={Boolean(fieldError(error, "productId")) || undefined}
                aria-describedby={fieldError(error, "productId") ? "adjustment-product-error" : undefined}
              >
                <option value="">Pilih produk</option>
                {products.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} — {entry.sku} (stok {formatStockQuantity(entry.stockOnHand)})
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Jumlah penyesuaian"
              htmlFor="adjustment-delta"
              required
              hint="Gunakan angka negatif untuk mengurangi stok, misalnya -3."
              error={fieldError(error, "quantityDelta")}
            >
              <Input
                id="adjustment-delta"
                value={delta}
                inputMode="text"
                autoComplete="off"
                onChange={(event) => {
                  setDelta(normalizeSignedQuantity(event.currentTarget.value));
                }}
                aria-invalid={Boolean(fieldError(error, "quantityDelta")) || undefined}
                aria-describedby={
                  fieldError(error, "quantityDelta") ? "adjustment-delta-error" : "adjustment-delta-hint"
                }
              />
            </Field>

            <Field label="Referensi (opsional)" htmlFor="adjustment-reference" hint="Nomor dokumen pendukung." error={fieldError(error, "reference")}>
              <Input
                id="adjustment-reference"
                value={reference}
                onChange={(event) => {
                  setReference(event.currentTarget.value);
                }}
                aria-invalid={Boolean(fieldError(error, "reference")) || undefined}
                aria-describedby={
                  fieldError(error, "reference") ? "adjustment-reference-error" : "adjustment-reference-hint"
                }
                autoComplete="off"
              />
            </Field>
          </div>

          <div className="bo-field bo-field--spaced">
            <label className="bo-field__label" htmlFor="adjustment-reason">
              Alasan <span className="bo-field__required">Wajib</span>
            </label>
            <Input
              id="adjustment-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.currentTarget.value);
              }}
              aria-invalid={Boolean(fieldError(error, "reason")) || undefined}
              aria-describedby={fieldError(error, "reason") ? "adjustment-reason-error" : "adjustment-reason-hint"}
              autoComplete="off"
            />
            {fieldError(error, "reason") ? (
              <p className="bo-field__error" id="adjustment-reason-error">
                {fieldError(error, "reason")}
              </p>
            ) : (
              <p className="bo-field__hint" id="adjustment-reason-hint">
                Alasan dicatat di buku besar dan log audit.
              </p>
            )}
          </div>

          {projected !== null ? (
            <p
              className={wouldBeNegative ? "bo-stock-preview bo-stock-preview--danger" : "bo-stock-preview"}
              aria-live="polite"
            >
              Stok saat ini <strong>{formatStockQuantity(product?.stockOnHand ?? null)}</strong> → Stok setelah{" "}
              <strong>{formatStockQuantity(projected)}</strong>
              {wouldBeNegative ? (
                <>
                  {" "}
                  <StatusChip tone="danger">Override diperlukan</StatusChip>
                </>
              ) : null}
            </p>
          ) : null}

          <div className="bo-form-actions">
            <Button
              ref={submitRef}
              type="submit"
              variant="secondary"
              disabled={pending || missingReason !== null}
              aria-busy={pending || undefined}
              aria-describedby={missingReason ? "adjustment-requirements" : undefined}
            >
              {pending ? "Menyimpan…" : "Simpan penyesuaian"}
            </Button>
          </div>
          {missingReason ? (
            <p className="bo-field__hint" id="adjustment-requirements">
              {missingReason}
            </p>
          ) : null}

          {error ? (
            <div className="bo-form-status">
              <div className="bo-alert bo-alert--danger" role="alert">
                <p>{error.message}</p>
                {error.code === "CONFLICT" ? (
                  <p>Stok berubah sejak halaman dibuka. Periksa angka terbaru sebelum menyimpan.</p>
                ) : null}
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          destructive
          aria-describedby="adjustment-override-description"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
          }}
          onInteractOutside={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            submitRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Stok akan menjadi minus. Lanjutkan?</DialogTitle>
            <DialogDescription id="adjustment-override-description">
              Stok {product?.name ?? "produk"} akan menjadi <strong>{formatStockQuantity(projected)}</strong> dan
              ditandai override. Baris buku besar menyimpan alasan dan identitas Anda; stok minus harus
              diselesaikan dengan penyesuaian berikutnya.
            </DialogDescription>
          </DialogHeader>
          <div className="bo-dialog__body">
            <p className="bo-stock-preview bo-stock-preview--danger">
              Stok saat ini {formatStockQuantity(product?.stockOnHand ?? null)} → Stok setelah{" "}
              {formatStockQuantity(projected)}
            </p>
            <p className="bo-field__hint">Alasan: {reason.trim() || "—"}</p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button ref={cancelRef} type="button" variant="secondary" autoFocus disabled={pending}>
                Batal
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={() => {
                void save(true);
              }}
            >
              {pending ? "Menyimpan…" : "Simpan penyesuaian"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
