"use client";

import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError, type FormErrorState } from "@/components/auth/api-error";
import { Field } from "@/components/back-office/field";
import { DiscardDialog } from "@/components/back-office/discard-dialog";
import { StatusToast } from "@/components/back-office/status-toast";
import { MoneyInput } from "@/components/catalog/money-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function fieldError(error: FormErrorState | null, name: string): string | undefined {
  return error?.fieldErrors[name]?.[0];
}

function toInteger(value: string): number {
  if (!/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}

export function CatalogCreateActions() {
  const router = useRouter();
  const [productOpen, setProductOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [productDirty, setProductDirty] = useState(false);
  const [serviceDirty, setServiceDirty] = useState(false);
  const [discard, setDiscard] = useState<"product" | "service" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function changeProductOpen(next: boolean) {
    if (!next && productDirty) {
      setDiscard("product");
      return;
    }
    setProductOpen(next);
    if (!next) setProductDirty(false);
  }

  function changeServiceOpen(next: boolean) {
    if (!next && serviceDirty) {
      setDiscard("service");
      return;
    }
    setServiceOpen(next);
    if (!next) setServiceDirty(false);
  }

  return (
    <>
      <Dialog open={productOpen} onOpenChange={changeProductOpen}>
        <DialogTrigger asChild>
          <Button variant="primary">Produk baru</Button>
        </DialogTrigger>
        <DialogContent aria-describedby="create-product-description">
          <DialogHeader>
            <DialogTitle>Produk baru</DialogTitle>
            <DialogDescription id="create-product-description">
              Produk adalah spare part yang stoknya dicatat di buku besar. Stok awal di atas nol membuat satu baris
              stok masuk pada transaksi yang sama.
            </DialogDescription>
          </DialogHeader>
          <ProductCreateForm
            onDirty={() => {
              setProductDirty(true);
            }}
            onCreated={(name) => {
              setProductDirty(false);
              setProductOpen(false);
              setMessage(`Produk ${name} dibuat.`);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={serviceOpen} onOpenChange={changeServiceOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary">Jasa baru</Button>
        </DialogTrigger>
        <DialogContent aria-describedby="create-service-description">
          <DialogHeader>
            <DialogTitle>Jasa baru</DialogTitle>
            <DialogDescription id="create-service-description">
              Jasa adalah pekerjaan bengkel tanpa stok, misalnya ganti oli atau servis besar.
            </DialogDescription>
          </DialogHeader>
          <ServiceCreateForm
            onDirty={() => {
              setServiceDirty(true);
            }}
            onCreated={(name) => {
              setServiceDirty(false);
              setServiceOpen(false);
              setMessage(`Jasa ${name} dibuat.`);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <DiscardDialog
        open={discard !== null}
        onKeep={() => {
          setDiscard(null);
        }}
        onDiscard={() => {
          if (discard === "product") {
            setProductDirty(false);
            setProductOpen(false);
          } else {
            setServiceDirty(false);
            setServiceOpen(false);
          }
          setDiscard(null);
        }}
      />

      {message ? <StatusToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </>
  );
}

interface CreatedHandlerProps {
  onCreated: (name: string) => void;
  onDirty: () => void;
}

function CreateError({ error }: { error: FormErrorState | null }) {
  if (!error) return null;
  const fieldCount = Object.keys(error.fieldErrors).length;
  return (
    <div className="bo-alert bo-alert--danger" role="alert">
      <p>{error.message}</p>
      {fieldCount > 0 ? <p>Periksa {fieldCount} kolom yang ditandai.</p> : null}
    </div>
  );
}

function ProductCreateForm({ onCreated, onDirty }: CreatedHandlerProps) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [threshold, setThreshold] = useState("");
  const [openingStock, setOpeningStock] = useState("0");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);

  const missingCore = sku.trim().length === 0 || name.trim().length === 0 || cost.length === 0 || price.length === 0;
  const disabledReason = missingCore ? "Lengkapi SKU, nama, biaya, dan harga untuk menyimpan." : null;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/catalog/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku: sku.trim(),
          name: name.trim(),
          unit: unit.trim() || "pcs",
          cost,
          price,
          lowStockThreshold: threshold.trim().length === 0 ? null : toInteger(threshold),
          openingStock: toInteger(openingStock) || 0,
          openingStockNote: note.trim().length > 0 ? note.trim() : undefined,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      onCreated(name.trim());
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} onInput={onDirty} noValidate>
      <div className="bo-dialog__body">
        <CreateError error={error} />

        <div className="bo-form-grid">
          <Field label="SKU" htmlFor="create-product-sku" required error={fieldError(error, "sku")} hint="Huruf, angka, titik, garis bawah, atau tanda hubung.">
            <Input
              id="create-product-sku"
              value={sku}
              onChange={(event) => {
                setSku(event.currentTarget.value);
              }}
              aria-invalid={Boolean(fieldError(error, "sku")) || undefined}
              aria-describedby={fieldError(error, "sku") ? "create-product-sku-error" : "create-product-sku-hint"}
              autoComplete="off"
            />
          </Field>

          <Field label="Nama produk" htmlFor="create-product-name" required error={fieldError(error, "name")}>
            <Input
              id="create-product-name"
              value={name}
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              aria-invalid={Boolean(fieldError(error, "name")) || undefined}
              aria-describedby={fieldError(error, "name") ? "create-product-name-error" : undefined}
              autoComplete="off"
            />
          </Field>

          <Field label="Satuan" htmlFor="create-product-unit" required error={fieldError(error, "unit")} hint="Contoh: pcs, liter, set.">
            <Input
              id="create-product-unit"
              value={unit}
              onChange={(event) => {
                setUnit(event.currentTarget.value);
              }}
              aria-invalid={Boolean(fieldError(error, "unit")) || undefined}
              aria-describedby={fieldError(error, "unit") ? "create-product-unit-error" : "create-product-unit-hint"}
              autoComplete="off"
            />
          </Field>

          <Field label="Biaya modal" htmlFor="create-product-cost" required error={fieldError(error, "cost")}>
            <MoneyInput
              id="create-product-cost"
              value={cost}
              onChange={setCost}
              invalid={Boolean(fieldError(error, "cost"))}
              describedBy={fieldError(error, "cost") ? "create-product-cost-error" : undefined}
            />
          </Field>

          <Field label="Harga jual" htmlFor="create-product-price" required error={fieldError(error, "price")}>
            <MoneyInput
              id="create-product-price"
              value={price}
              onChange={setPrice}
              invalid={Boolean(fieldError(error, "price"))}
              describedBy={fieldError(error, "price") ? "create-product-price-error" : undefined}
            />
          </Field>

          <Field label="Batas stok menipis" htmlFor="create-product-threshold" error={fieldError(error, "lowStockThreshold")} hint="Opsional. Kosongkan bila produk tidak dipantau.">
            <Input
              id="create-product-threshold"
              value={threshold}
              inputMode="numeric"
              onChange={(event) => {
                setThreshold(event.currentTarget.value.replace(/\D/g, ""));
              }}
              aria-invalid={Boolean(fieldError(error, "lowStockThreshold")) || undefined}
              aria-describedby={fieldError(error, "lowStockThreshold") ? "create-product-threshold-error" : "create-product-threshold-hint"}
            />
          </Field>

          <Field label="Stok awal" htmlFor="create-product-opening-stock" error={fieldError(error, "openingStock")} hint="Jumlah fisik saat produk pertama dicatat.">
            <Input
              id="create-product-opening-stock"
              value={openingStock}
              inputMode="numeric"
              onChange={(event) => {
                setOpeningStock(event.currentTarget.value.replace(/\D/g, ""));
              }}
              aria-invalid={Boolean(fieldError(error, "openingStock")) || undefined}
              aria-describedby={fieldError(error, "openingStock") ? "create-product-opening-stock-error" : "create-product-opening-stock-hint"}
            />
          </Field>
        </div>

        <Field label="Catatan stok awal (opsional)" htmlFor="create-product-note" error={fieldError(error, "openingStockNote")} hint="Jangan masukkan data pribadi yang tidak diperlukan.">
          <Textarea
            id="create-product-note"
            value={note}
            onChange={(event) => {
              setNote(event.currentTarget.value);
            }}
            aria-invalid={Boolean(fieldError(error, "openingStockNote")) || undefined}
            aria-describedby={fieldError(error, "openingStockNote") ? "create-product-note-error" : "create-product-note-hint"}
          />
        </Field>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Batal
          </Button>
        </DialogClose>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || missingCore}
          aria-busy={pending || undefined}
          aria-describedby={disabledReason ? "create-product-requirements" : undefined}
        >
          {pending ? "Menyimpan…" : "Simpan produk"}
        </Button>
      </DialogFooter>
      {disabledReason ? (
        <p className="bo-field__hint bo-form-hint" id="create-product-requirements">
          {disabledReason}
        </p>
      ) : null}
    </form>
  );
}

function ServiceCreateForm({ onCreated, onDirty }: CreatedHandlerProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);

  const missingCore = code.trim().length === 0 || name.trim().length === 0 || price.length === 0;
  const disabledReason = missingCore ? "Lengkapi kode, nama, dan harga untuk menyimpan." : null;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/catalog/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          price,
          durationMinutes: toInteger(duration),
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      onCreated(name.trim());
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} onInput={onDirty} noValidate>
      <div className="bo-dialog__body">
        <CreateError error={error} />

        <div className="bo-form-grid">
          <Field label="Kode jasa" htmlFor="create-service-code" required error={fieldError(error, "code")}>
            <Input
              id="create-service-code"
              value={code}
              onChange={(event) => {
                setCode(event.currentTarget.value);
              }}
              aria-invalid={Boolean(fieldError(error, "code")) || undefined}
              aria-describedby={fieldError(error, "code") ? "create-service-code-error" : undefined}
              autoComplete="off"
            />
          </Field>

          <Field label="Nama jasa" htmlFor="create-service-name" required error={fieldError(error, "name")}>
            <Input
              id="create-service-name"
              value={name}
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              aria-invalid={Boolean(fieldError(error, "name")) || undefined}
              aria-describedby={fieldError(error, "name") ? "create-service-name-error" : undefined}
              autoComplete="off"
            />
          </Field>

          <Field label="Harga jasa" htmlFor="create-service-price" required error={fieldError(error, "price")}>
            <MoneyInput
              id="create-service-price"
              value={price}
              onChange={setPrice}
              invalid={Boolean(fieldError(error, "price"))}
              describedBy={fieldError(error, "price") ? "create-service-price-error" : undefined}
            />
          </Field>

          <Field label="Durasi (menit)" htmlFor="create-service-duration" required error={fieldError(error, "durationMinutes")}>
            <Input
              id="create-service-duration"
              value={duration}
              inputMode="numeric"
              onChange={(event) => {
                setDuration(event.currentTarget.value.replace(/\D/g, ""));
              }}
              aria-invalid={Boolean(fieldError(error, "durationMinutes")) || undefined}
              aria-describedby={fieldError(error, "durationMinutes") ? "create-service-duration-error" : undefined}
            />
          </Field>
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Batal
          </Button>
        </DialogClose>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || missingCore}
          aria-busy={pending || undefined}
          aria-describedby={disabledReason ? "create-service-requirements" : undefined}
        >
          {pending ? "Menyimpan…" : "Simpan jasa"}
        </Button>
      </DialogFooter>
      {disabledReason ? (
        <p className="bo-field__hint bo-form-hint" id="create-service-requirements">
          {disabledReason}
        </p>
      ) : null}
    </form>
  );
}
