"use client";

import {
  ANONYMIZED_CUSTOMER_NAME,
  ANONYMIZE_REASON_MIN_LENGTH,
  customerResponseSchema,
  type Customer,
  type CustomerListItem,
} from "@workshop-pos/contracts";
import { Download, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject, type SubmitEvent } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError, type FormErrorState } from "@/components/auth/api-error";
import { DiscardDialog } from "@/components/back-office/discard-dialog";
import { Field } from "@/components/back-office/field";
import { StatusToast } from "@/components/back-office/status-toast";
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
import { Textarea } from "@/components/ui/textarea";

import { CustomerCreateForm, CustomerEditForm } from "./customer-form";

export function CustomerCreateAction({
  label = "Tambah pelanggan",
  variant = "primary",
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function changeOpen(next: boolean) {
    if (!next && dirty) {
      setDiscard(true);
      return;
    }
    setOpen(next);
    if (!next) setDirty(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild>
          <Button variant={variant}>{label}</Button>
        </DialogTrigger>
        <DialogContent aria-describedby="create-customer-description">
          <DialogHeader>
            <DialogTitle>Pelanggan baru</DialogTitle>
            <DialogDescription id="create-customer-description">
              Nama dan nomor HP dipakai untuk menemukan pelanggan saat servis. Nomor HP disamarkan di
              daftar; hanya Pemilik yang dapat mengekspor atau menganonimkan data pribadi.
            </DialogDescription>
          </DialogHeader>
          <CustomerCreateForm
            onDirty={() => {
              setDirty(true);
            }}
            onCreated={(name) => {
              setDirty(false);
              setOpen(false);
              setMessage(`Pelanggan ${name} dibuat.`);
              router.refresh();
            }}
          />
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
          setOpen(false);
        }}
      />

      {message ? <StatusToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </>
  );
}

interface CustomerEditDialogProps {
  customer: CustomerListItem;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function CustomerEditDialog({
  customer,
  returnFocusRef,
  onClose,
  onSaved,
}: CustomerEditDialogProps) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [attempt, setAttempt] = useState(0);

  function handleSaved(message: string) {
    router.refresh();
    onSaved(message);
  }

  // The dialog unmounts from the parent's state, so Radix's own close-focus
  // can lose the race; restore the trigger explicitly on unmount.
  useEffect(() => {
    const trigger = returnFocusRef.current;
    return () => {
      trigger?.focus();
    };
  }, [returnFocusRef]);

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
          aria-describedby="customer-edit-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Ubah {customer.name}</DialogTitle>
            <DialogDescription id="customer-edit-description">
              Perubahan nama, nomor HP, alamat, atau catatan dicatat di log audit sebagai nama kolom
              yang berubah, tanpa menyalin nilainya.
            </DialogDescription>
          </DialogHeader>
          <CustomerEditLoader
            key={attempt}
            customerId={customer.id}
            onRetry={() => {
              setAttempt((current) => current + 1);
            }}
            onDirty={() => {
              setDirty(true);
            }}
            onSaved={handleSaved}
          />
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

interface CustomerEditLoaderProps {
  customerId: string;
  onRetry: () => void;
  onDirty: () => void;
  onSaved: (message: string) => void;
}

/**
 * The list row only carries the masked phone, so the edit dialog fetches the
 * full record. The fetch state lives in a keyed child: retry remounts it with
 * a fresh loading state instead of resetting state from an effect.
 */
function CustomerEditLoader({ customerId, onRetry, onDirty, onSaved }: CustomerEditLoaderProps) {
  const [item, setItem] = useState<Customer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/v1/customers/${customerId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setLoadError((await readApiError(response)).message);
          return;
        }
        const parsed = customerResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          setLoadError("Data pelanggan tidak dapat dibaca. Coba lagi.");
          return;
        }
        setItem(parsed.data.item);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(NETWORK_ERROR_MESSAGE);
      });

    return () => controller.abort();
  }, [customerId]);

  if (loadError) {
    return (
      <>
        <div className="bo-dialog__body">
          <div className="bo-alert bo-alert--danger" role="alert">
            <p>{loadError}</p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Batal
            </Button>
          </DialogClose>
          <Button type="button" variant="secondary" onClick={onRetry}>
            Coba lagi
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (!item) {
    return (
      <>
        <div className="bo-dialog__body">
          <p className="bo-muted" role="status">
            Memuat data pelanggan…
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Batal
            </Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  // The form itself disables every control for an anonymized record and
  // explains why, so the dialog keeps a single read/edit surface.
  return <CustomerEditForm customer={item} onSaved={onSaved} onDirty={onDirty} />;
}

interface CustomerPersonalDataDialogProps {
  customer: CustomerListItem;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  exporting: boolean;
  onExport: () => void;
  onAnonymize: () => void;
  onClose: () => void;
}

/**
 * One Owner-only entry point for personal data (DESIGN §9.7). Keeping export
 * and anonymization behind a single row action caps the row at two icons and
 * keeps the destructive action out of the list itself. An already anonymized
 * record can still be exported, but the anonymize action is disabled next to
 * a visible reason rather than silently.
 */
export function CustomerPersonalDataDialog({
  customer,
  returnFocusRef,
  exporting,
  onExport,
  onAnonymize,
  onClose,
}: CustomerPersonalDataDialogProps) {
  const anonymized = customer.anonymizedAt !== null;
  const displayName = anonymized ? ANONYMIZED_CUSTOMER_NAME : customer.name;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby="customer-personal-data-description"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Data pribadi {displayName}</DialogTitle>
          <DialogDescription id="customer-personal-data-description">
            Hanya Pemilik yang dapat mengekspor atau menganonimkan data pribadi. Setiap tindakan
            tercatat di log audit.
          </DialogDescription>
        </DialogHeader>

        <div className="bo-dialog__body">
          <p>Ekspor menyalin nama, nomor HP, alamat, dan catatan pelanggan ini ke berkas JSON.</p>
          {anonymized ? (
            <p className="bo-muted" id="customer-personal-data-anonymized">
              Pelanggan ini sudah dianonimkan. Nama, nomor HP, alamat, dan catatan sudah dihapus;
              ekspor tetap tersedia.
            </p>
          ) : (
            <p className="bo-muted">
              Anonimisasi menghapus nama, nomor HP, alamat, dan catatan secara permanen. Kendaraan
              dan riwayat keuangan tetap tersimpan.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={exporting}
            aria-busy={exporting || undefined}
            onClick={onExport}
          >
            <Download aria-hidden="true" />
            {exporting ? "Mengekspor…" : "Ekspor data"}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={anonymized}
            aria-describedby={anonymized ? "customer-personal-data-anonymized" : undefined}
            onClick={onAnonymize}
          >
            <ShieldOff aria-hidden="true" />
            Anonimkan data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AnonymizeCustomerDialogProps {
  customer: CustomerListItem;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onAnonymized: () => void;
}

const EMPTY_REASON_ERROR: FormErrorState = {
  message: "Periksa kembali isian Anda.",
  fieldErrors: { reason: [`Alasan minimal ${ANONYMIZE_REASON_MIN_LENGTH} karakter.`] },
};

export function AnonymizeCustomerDialog({
  customer,
  returnFocusRef,
  onClose,
  onAnonymized,
}: AnonymizeCustomerDialogProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);
  const [discard, setDiscard] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const trigger = returnFocusRef.current;
    return () => {
      trigger?.focus();
    };
  }, [returnFocusRef]);

  const tooShort = reason.trim().length < ANONYMIZE_REASON_MIN_LENGTH;
  const reasonError = error?.fieldErrors.reason?.[0];

  function requestClose() {
    if (reason.trim().length > 0) {
      setDiscard(true);
      return;
    }
    onClose();
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (tooShort) {
      setError(EMPTY_REASON_ERROR);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/customers/${customer.id}/anonymize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      router.refresh();
      onAnonymized();
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent
          destructive
          aria-describedby="anonymize-customer-description"
          // The handoff from the personal-data dialog restores focus to the row
          // first; take it back explicitly so the safe action starts focused.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Anonimkan {customer.name}?</DialogTitle>
            <DialogDescription id="anonymize-customer-description">
              Tindakan ini tidak dapat dibatalkan dan hanya dapat dilakukan Pemilik.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} noValidate>
            <div className="bo-dialog__body">
              <ul className="list-disc pl-5">
                <li>Nama, nomor HP, alamat, dan catatan pelanggan dihapus permanen.</li>
                <li>Kendaraan pelanggan tetap tersimpan untuk servis berikutnya.</li>
                <li>Riwayat keuangan dan jejak audit tetap tersimpan.</li>
              </ul>

              {error ? (
                <div className="bo-alert bo-alert--danger" role="alert">
                  <p>{error.message}</p>
                </div>
              ) : null}

              <Field
                label="Alasan anonimisasi"
                htmlFor="anonymize-customer-reason"
                required
                error={reasonError}
                hint={`Minimal ${ANONYMIZE_REASON_MIN_LENGTH} karakter. Jangan menyalin data pribadi ke alasan.`}
              >
                <Textarea
                  id="anonymize-customer-reason"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.currentTarget.value);
                  }}
                  aria-invalid={Boolean(reasonError) || undefined}
                  aria-describedby={
                    reasonError ? "anonymize-customer-reason-error" : "anonymize-customer-reason-hint"
                  }
                />
              </Field>
            </div>

            <DialogFooter>
              <Button ref={cancelRef} type="button" variant="secondary" onClick={requestClose}>
                Batal
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={pending || tooShort}
                aria-busy={pending || undefined}
                aria-describedby={tooShort ? "anonymize-customer-requirements" : undefined}
              >
                <ShieldOff aria-hidden="true" />
                {pending ? "Menganonimkan…" : "Anonimkan pelanggan"}
              </Button>
            </DialogFooter>
            {tooShort ? (
              <p className="bo-field__hint bo-form-hint" id="anonymize-customer-requirements">
                Isi alasan minimal {ANONYMIZE_REASON_MIN_LENGTH} karakter untuk menganonimkan pelanggan.
              </p>
            ) : null}
          </form>
        </DialogContent>
      </Dialog>

      <DiscardDialog
        open={discard}
        onKeep={() => {
          setDiscard(false);
        }}
        onDiscard={() => {
          setDiscard(false);
          onClose();
        }}
      />
    </>
  );
}
