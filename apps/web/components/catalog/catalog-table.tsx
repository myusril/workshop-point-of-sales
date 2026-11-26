"use client";

import {
  catalogSortSchema,
  type CatalogItem,
  type ProductItem,
  type ServiceItem,
  type SortDirection,
  type UpdateProductRequest,
  type UpdateServiceRequest,
} from "@workshop-pos/contracts";
import { ArrowUpDown, Pencil, Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode, type RefObject, type SubmitEvent } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError, type FormErrorState } from "@/components/auth/api-error";
import { DataTable, type DataTableColumn } from "@/components/back-office/data-table";
import { DiscardDialog } from "@/components/back-office/discard-dialog";
import { Field } from "@/components/back-office/field";
import { StatusChip } from "@/components/back-office/status-chip";
import { StatusToast } from "@/components/back-office/status-toast";
import { MoneyInput } from "@/components/catalog/money-input";
import { Badge } from "@/components/ui/badge";
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
import { formatIdr, formatStockQuantity } from "@/lib/format";

export type CatalogSortColumn = "name" | "sku" | "price" | "stock";

type CatalogSortKey = (typeof catalogSortSchema.options)[number];

interface CatalogTableProps {
  items: CatalogItem[];
  canManageCatalog: boolean;
  sort: CatalogSortKey;
  dir: SortDirection;
  sortLinks: Record<CatalogSortColumn, string>;
  empty?: ReactNode;
}

function ariaSortFor(column: CatalogSortColumn, sort: CatalogSortKey, dir: SortDirection) {
  if (sort !== column) return "none" as const;
  return dir === "asc" ? ("ascending" as const) : ("descending" as const);
}

function SortHeader({
  label,
  href,
  active,
  dir,
}: {
  label: string;
  href: string;
  active: boolean;
  dir: SortDirection;
}) {
  return (
    <a className="bo-sort-link" href={href}>
      {label}
      <ArrowUpDown aria-hidden="true" />
      <span className="bo-sr-only">
        {active ? (dir === "asc" ? "urut menaik, aktif" : "urut menurun, aktif") : "urutkan"}
      </span>
    </a>
  );
}

function fieldError(error: FormErrorState | null, name: string): string | undefined {
  return error?.fieldErrors[name]?.[0];
}

function toInteger(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

export function CatalogTable({ items, canManageCatalog, sort, dir, sortLinks, empty }: CatalogTableProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [deactivating, setDeactivating] = useState<CatalogItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const statusTriggerRef = useRef<HTMLButtonElement | null>(null);

  function announce(nextMessage: string) {
    setMessage(nextMessage);
    setEditing(null);
    setDeactivating(null);
    router.refresh();
  }

  const columns = useMemo<DataTableColumn<CatalogItem>[]>(() => {
    const definition: DataTableColumn<CatalogItem>[] = [
      {
        id: "name",
        ariaSort: ariaSortFor("name", sort, dir),
        header: (
          <SortHeader label="Nama" href={sortLinks.name} active={sort === "name"} dir={dir} />
        ),
        cell: (item) => (
          <div className="bo-cell-name">
            <span className="bo-cell-name__primary">{item.name}</span>
            <span className="bo-cell-sub">
              {item.itemType === "PRODUCT" ? `Produk · ${item.unit}` : `Jasa · ${item.durationMinutes} menit`}
            </span>
          </div>
        ),
      },
      {
        id: "sku",
        ariaSort: ariaSortFor("sku", sort, dir),
        header: (
          <SortHeader label="SKU / kode" href={sortLinks.sku} active={sort === "sku"} dir={dir} />
        ),
        cell: (item) => (
          <span className="bo-cell-mono">{item.itemType === "PRODUCT" ? item.sku : item.code}</span>
        ),
      },
      {
        id: "type",
        header: "Jenis",
        cell: (item) => (
          <Badge tone="neutral">{item.itemType === "PRODUCT" ? "Produk" : "Jasa"}</Badge>
        ),
      },
      {
        id: "price",
        numeric: true,
        ariaSort: ariaSortFor("price", sort, dir),
        header: (
          <SortHeader label="Harga" href={sortLinks.price} active={sort === "price"} dir={dir} />
        ),
        cell: (item) => <span className="bo-nowrap">{formatIdr(item.price)}</span>,
      },
      {
        id: "stock",
        numeric: true,
        ariaSort: ariaSortFor("stock", sort, dir),
        header: (
          <SortHeader label="Stok" href={sortLinks.stock} active={sort === "stock"} dir={dir} />
        ),
        cell: (item) => {
          if (item.itemType !== "PRODUCT") return <span aria-hidden="true">—</span>;
          return (
            <span className="bo-row-actions bo-row-actions--end">
              <span className="bo-nowrap">{formatStockQuantity(item.stockOnHand)}</span>
              {item.stockOnHand < 0 ? (
                <StatusChip tone="danger">Stok minus</StatusChip>
              ) : item.isLowStock ? (
                <StatusChip tone="warning">Stok menipis</StatusChip>
              ) : null}
            </span>
          );
        },
      },
    ];

    if (canManageCatalog) {
      definition.push({
        id: "cost",
        numeric: true,
        header: "Biaya",
        cell: (item) =>
          item.itemType === "PRODUCT" ? (
            <span className="bo-nowrap">{formatIdr(item.cost ?? null)}</span>
          ) : (
            <span aria-hidden="true">—</span>
          ),
      });
    }

    definition.push({
      id: "status",
      header: "Status",
      cell: (item) =>
        item.isActive ? (
          <StatusChip tone="success">Aktif</StatusChip>
        ) : (
          <StatusChip tone="neutral">Nonaktif</StatusChip>
        ),
    });

    if (canManageCatalog) {
      definition.push({
        id: "actions",
        header: "Aksi",
        sticky: true,
        className: "bo-cell-actions",
        cell: (item) => (
          <div className="bo-row-actions">
            <button
              type="button"
              className="bo-icon-button"
              aria-label={`Ubah ${item.name}`}
              onClick={(event) => {
                editTriggerRef.current = event.currentTarget;
                setEditing(item);
              }}
            >
              <Pencil aria-hidden="true" />
            </button>
            <button
              type="button"
              className="bo-icon-button"
              aria-label={`${item.isActive ? "Nonaktifkan" : "Aktifkan"} ${item.name}`}
              onClick={(event) => {
                statusTriggerRef.current = event.currentTarget;
                setDeactivating(item);
              }}
            >
              <Power aria-hidden="true" />
            </button>
          </div>
        ),
      });
    }

    return definition;
  }, [canManageCatalog, dir, sort, sortLinks]);

  return (
    <>
      <DataTable
        caption="Daftar produk dan jasa"
        columns={columns}
        data={items}
        getRowKey={(item) => item.id}
        empty={empty}
      />

      {editing ? (
        <EditDialog
          item={editing}
          returnFocusRef={editTriggerRef}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={announce}
        />
      ) : null}

      {deactivating ? (
        <StatusDialog
          item={deactivating}
          returnFocusRef={statusTriggerRef}
          onClose={() => {
            setDeactivating(null);
          }}
          onSaved={announce}
        />
      ) : null}

      {message ? <StatusToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </>
  );
}

interface EditDialogProps {
  item: CatalogItem;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function EditDialog({ item, returnFocusRef, onClose, onSaved }: EditDialogProps) {
  const title = `Ubah ${item.name}`;
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (open) return;
          if (dirty) {
            setDiscard(true);
            return;
          }
          onClose();
        }}
      >
        <DialogContent
          aria-describedby="catalog-edit-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription id="catalog-edit-description">
              Perubahan harga dan biaya dicatat terpisah di log audit dengan nilai sebelum dan sesudah.
            </DialogDescription>
          </DialogHeader>
          {item.itemType === "PRODUCT" ? (
            <ProductEditForm
              item={item}
              onSaved={onSaved}
              onDirty={() => {
                setDirty(true);
              }}
            />
          ) : (
            <ServiceEditForm
              item={item}
              onSaved={onSaved}
              onDirty={() => {
                setDirty(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <DiscardDialog
        open={discard}
        onKeep={() => {
          setDiscard(false);
        }}
        onDiscard={() => {
          setDiscard(false);
          setDirty(false);
          onClose();
        }}
      />
    </>
  );
}

interface EditFormProps<T> {
  item: T;
  onSaved: (message: string) => void;
  onDirty: () => void;
}

function ProductEditForm({
  item,
  onSaved,
  onDirty,
}: EditFormProps<ProductItem>) {
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);
  const [cost, setCost] = useState(item.cost ?? "");
  const [price, setPrice] = useState(item.price);
  const [threshold, setThreshold] = useState(item.lowStockThreshold === null ? "" : String(item.lowStockThreshold));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);

  const missingCore = name.trim().length === 0 || unit.trim().length === 0 || cost.length === 0 || price.length === 0;
  const disabledReason = missingCore ? "Lengkapi nama, satuan, biaya, dan harga untuk menyimpan." : null;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: UpdateProductRequest = {};
    if (name.trim() !== item.name) payload.name = name.trim();
    if (unit.trim() !== item.unit) payload.unit = unit.trim();
    if (cost !== (item.cost ?? "")) payload.cost = cost;
    if (price !== item.price) payload.price = price;
    const nextThreshold = threshold.trim().length === 0 ? null : toInteger(threshold);
    if (nextThreshold !== item.lowStockThreshold) payload.lowStockThreshold = nextThreshold;

    if (Object.keys(payload).length === 0) {
      onSaved(`Tidak ada perubahan pada ${item.name}.`);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/catalog/products/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      onSaved(`Produk ${payload.name ?? item.name} diperbarui.`);
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} onInput={onDirty} noValidate>
      <div className="bo-dialog__body">
        {error ? (
          <div className="bo-alert bo-alert--danger" role="alert">
            <p>{error.message}</p>
          </div>
        ) : null}

        <div className="bo-form-grid">
          <Field label="Nama produk" htmlFor="edit-product-name" required error={fieldError(error, "name")}>
            <Input
              id="edit-product-name"
              value={name}
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              aria-invalid={Boolean(fieldError(error, "name")) || undefined}
              aria-describedby={fieldError(error, "name") ? "edit-product-name-error" : undefined}
            />
          </Field>

          <Field label="Satuan" htmlFor="edit-product-unit" required error={fieldError(error, "unit")}>
            <Input
              id="edit-product-unit"
              value={unit}
              onChange={(event) => {
                setUnit(event.currentTarget.value);
              }}
              aria-invalid={Boolean(fieldError(error, "unit")) || undefined}
              aria-describedby={fieldError(error, "unit") ? "edit-product-unit-error" : undefined}
            />
          </Field>

          <Field label="Biaya modal" htmlFor="edit-product-cost" required error={fieldError(error, "cost")}>
            <MoneyInput
              id="edit-product-cost"
              value={cost}
              onChange={setCost}
              invalid={Boolean(fieldError(error, "cost"))}
              describedBy={fieldError(error, "cost") ? "edit-product-cost-error" : undefined}
            />
          </Field>

          <Field label="Harga jual" htmlFor="edit-product-price" required error={fieldError(error, "price")}>
            <MoneyInput
              id="edit-product-price"
              value={price}
              onChange={setPrice}
              invalid={Boolean(fieldError(error, "price"))}
              describedBy={fieldError(error, "price") ? "edit-product-price-error" : undefined}
            />
          </Field>

          <Field label="Batas stok menipis" htmlFor="edit-product-threshold" error={fieldError(error, "lowStockThreshold")} hint="Kosongkan bila tidak dipantau.">
            <Input
              id="edit-product-threshold"
              value={threshold}
              inputMode="numeric"
              onChange={(event) => {
                setThreshold(event.currentTarget.value.replace(/\D/g, ""));
              }}
              aria-invalid={Boolean(fieldError(error, "lowStockThreshold")) || undefined}
              aria-describedby={fieldError(error, "lowStockThreshold") ? "edit-product-threshold-error" : "edit-product-threshold-hint"}
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
          aria-describedby={disabledReason ? "edit-product-requirements" : undefined}
        >
          {pending ? "Menyimpan…" : "Simpan perubahan"}
        </Button>
      </DialogFooter>
      {disabledReason ? (
        <p className="bo-field__hint bo-form-hint" id="edit-product-requirements">
          {disabledReason}
        </p>
      ) : null}
    </form>
  );
}

function ServiceEditForm({
  item,
  onSaved,
  onDirty,
}: EditFormProps<ServiceItem>) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price);
  const [duration, setDuration] = useState(String(item.durationMinutes));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);

  const missingCore = name.trim().length === 0 || price.length === 0 || duration.trim().length === 0;
  const disabledReason = missingCore ? "Lengkapi nama, harga, dan durasi untuk menyimpan." : null;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: UpdateServiceRequest = {};
    if (name.trim() !== item.name) payload.name = name.trim();
    if (price !== item.price) payload.price = price;
    const nextDuration = toInteger(duration);
    if (nextDuration !== item.durationMinutes) payload.durationMinutes = nextDuration;

    if (Object.keys(payload).length === 0) {
      onSaved(`Tidak ada perubahan pada ${item.name}.`);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/catalog/services/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      onSaved(`Jasa ${payload.name ?? item.name} diperbarui.`);
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} onInput={onDirty} noValidate>
      <div className="bo-dialog__body">
        {error ? (
          <div className="bo-alert bo-alert--danger" role="alert">
            <p>{error.message}</p>
          </div>
        ) : null}

        <div className="bo-form-grid">
          <Field label="Nama jasa" htmlFor="edit-service-name" required error={fieldError(error, "name")}>
            <Input
              id="edit-service-name"
              value={name}
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              aria-invalid={Boolean(fieldError(error, "name")) || undefined}
              aria-describedby={fieldError(error, "name") ? "edit-service-name-error" : undefined}
            />
          </Field>

          <Field label="Harga jasa" htmlFor="edit-service-price" required error={fieldError(error, "price")}>
            <MoneyInput
              id="edit-service-price"
              value={price}
              onChange={setPrice}
              invalid={Boolean(fieldError(error, "price"))}
              describedBy={fieldError(error, "price") ? "edit-service-price-error" : undefined}
            />
          </Field>

          <Field label="Durasi (menit)" htmlFor="edit-service-duration" required error={fieldError(error, "durationMinutes")}>
            <Input
              id="edit-service-duration"
              value={duration}
              inputMode="numeric"
              onChange={(event) => {
                setDuration(event.currentTarget.value.replace(/\D/g, ""));
              }}
              aria-invalid={Boolean(fieldError(error, "durationMinutes")) || undefined}
              aria-describedby={fieldError(error, "durationMinutes") ? "edit-service-duration-error" : undefined}
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
          aria-describedby={disabledReason ? "edit-service-requirements" : undefined}
        >
          {pending ? "Menyimpan…" : "Simpan perubahan"}
        </Button>
      </DialogFooter>
      {disabledReason ? (
        <p className="bo-field__hint bo-form-hint" id="edit-service-requirements">
          {disabledReason}
        </p>
      ) : null}
    </form>
  );
}

function StatusDialog({
  item,
  returnFocusRef,
  onClose,
  onSaved,
}: {
  item: CatalogItem;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);
  const nextActive = !item.isActive;
  const noun = item.itemType === "PRODUCT" ? "Produk" : "Jasa";
  const lowerNoun = item.itemType === "PRODUCT" ? "produk" : "jasa";

  async function submit() {
    setPending(true);
    setError(null);

    try {
      const path =
        item.itemType === "PRODUCT"
          ? `/api/v1/catalog/products/${item.id}`
          : `/api/v1/catalog/services/${item.id}`;
      const response = await fetch(path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      onSaved(
        nextActive
          ? `${noun} ${item.name} diaktifkan kembali.`
          : `${noun} ${item.name} dinonaktifkan.`,
      );
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        destructive
        aria-describedby="catalog-status-description"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {nextActive ? `Aktifkan kembali ${item.name}?` : `Nonaktifkan ${item.name}?`}
          </DialogTitle>
          <DialogDescription id="catalog-status-description">
            {nextActive
              ? `${noun} ini akan tersedia lagi untuk transaksi baru.`
              : `${noun} nonaktif tidak muncul di katalog penjualan dan tidak dapat dipilih pada transaksi baru. Riwayat stok dan buku besar tetap tersimpan, dan ${lowerNoun} dapat diaktifkan kembali.`}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="bo-dialog__body">
            <div className="bo-alert bo-alert--danger" role="alert">
              <p>{error.message}</p>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" autoFocus disabled={pending}>
              Batal
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={nextActive ? "primary" : "danger"}
            onClick={() => {
              void submit();
            }}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending
              ? "Menyimpan…"
              : nextActive
                ? `Aktifkan ${lowerNoun}`
                : `Nonaktifkan ${lowerNoun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
