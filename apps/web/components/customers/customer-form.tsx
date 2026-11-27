"use client";

import type { Customer, UpdateCustomerRequest } from "@workshop-pos/contracts";
import { useEffect, useRef, useState, type SubmitEvent } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError, type FormErrorState } from "@/components/auth/api-error";
import { Field } from "@/components/back-office/field";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** PD-02 minimization copy, verbatim from the design system (§9.7). */
const NOTES_HINT = "Jangan masukkan data pribadi yang tidak diperlukan.";

export const ANONYMIZED_EDIT_REASON =
  "Pelanggan ini sudah dianonimkan. Nama, nomor HP, alamat, dan catatan tidak dapat diubah lagi.";

function fieldError(error: FormErrorState | null, name: string): string | undefined {
  return error?.fieldErrors[name]?.[0];
}

interface ValidationSummaryProps {
  prefix: string;
  error: FormErrorState | null;
}

/**
 * Submit-time summary (§6.8): `role="alert"`, a count, and a link to every
 * flagged field. Inline errors stay next to their controls.
 */
function ValidationSummary({ prefix, error }: ValidationSummaryProps) {
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) summaryRef.current?.focus();
  }, [error]);

  if (!error) return null;
  const entries = Object.entries(error.fieldErrors).filter(([, messages]) => messages.length > 0);

  return (
    <div className="bo-alert bo-alert--danger" role="alert" tabIndex={-1} ref={summaryRef}>
      <p>{error.message}</p>
      {entries.length > 0 ? (
        <>
          <p>Periksa {entries.length} kolom yang ditandai.</p>
          <ul className="list-disc pl-5">
            {entries.map(([field, messages]) => (
              <li key={field}>
                <a href={`#${prefix}-${field.replace(/\./g, "-")}`}>{messages[0]}</a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

interface CustomerCreateFormProps {
  onCreated: (name: string) => void;
  onDirty: () => void;
}

export function CustomerCreateForm({ onCreated, onDirty }: CustomerCreateFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);

  const missingCore = name.trim().length < 2 || phone.trim().length === 0;
  const disabledReason = missingCore ? "Lengkapi nama dan nomor HP untuk menyimpan." : null;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          ...(address.trim().length > 0 ? { address: address.trim() } : {}),
          ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
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

  const nameError = fieldError(error, "name");
  const phoneError = fieldError(error, "phone");

  return (
    <form onSubmit={submit} onInput={onDirty} noValidate>
      <div className="bo-dialog__body">
        <ValidationSummary prefix="create-customer" error={error} />

        <div className="bo-form-grid">
          <Field label="Nama pelanggan" htmlFor="create-customer-name" required error={nameError}>
            <Input
              id="create-customer-name"
              value={name}
              autoComplete="name"
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              aria-invalid={Boolean(nameError) || undefined}
              aria-describedby={nameError ? "create-customer-name-error" : undefined}
            />
          </Field>

          <Field
            label="Nomor HP"
            htmlFor="create-customer-phone"
            required
            error={phoneError}
            hint="Contoh: 081234567890. Spasi dan tanda hubung dirapikan otomatis."
          >
            <Input
              id="create-customer-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.currentTarget.value);
              }}
              aria-invalid={Boolean(phoneError) || undefined}
              aria-describedby={phoneError ? "create-customer-phone-error" : "create-customer-phone-hint"}
            />
          </Field>
        </div>

        <Field
          label="Alamat (opsional)"
          htmlFor="create-customer-address"
          error={fieldError(error, "address")}
        >
          <Input
            id="create-customer-address"
            value={address}
            autoComplete="street-address"
            onChange={(event) => {
              setAddress(event.currentTarget.value);
            }}
            aria-invalid={Boolean(fieldError(error, "address")) || undefined}
            aria-describedby={fieldError(error, "address") ? "create-customer-address-error" : undefined}
          />
        </Field>

        <Field
          label="Catatan (opsional)"
          htmlFor="create-customer-notes"
          error={fieldError(error, "notes")}
          hint={NOTES_HINT}
        >
          <Textarea
            id="create-customer-notes"
            value={notes}
            onChange={(event) => {
              setNotes(event.currentTarget.value);
            }}
            aria-invalid={Boolean(fieldError(error, "notes")) || undefined}
            aria-describedby={fieldError(error, "notes") ? "create-customer-notes-error" : "create-customer-notes-hint"}
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
          aria-describedby={disabledReason ? "create-customer-requirements" : undefined}
        >
          {pending ? "Menyimpan…" : "Simpan pelanggan"}
        </Button>
      </DialogFooter>
      {disabledReason ? (
        <p className="bo-field__hint bo-form-hint" id="create-customer-requirements">
          {disabledReason}
        </p>
      ) : null}
    </form>
  );
}

interface CustomerEditFormProps {
  customer: Customer;
  onSaved: (message: string) => void;
  onDirty: () => void;
}

export function CustomerEditForm({ customer, onSaved, onDirty }: CustomerEditFormProps) {
  const anonymized = customer.anonymizedAt !== null;
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [address, setAddress] = useState(customer.address ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);

  const missingCore = name.trim().length < 2 || phone.trim().length === 0;
  const disabledReason = anonymized
    ? ANONYMIZED_EDIT_REASON
    : missingCore
      ? "Lengkapi nama dan nomor HP untuk menyimpan."
      : null;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || anonymized) return;

    const payload: UpdateCustomerRequest = {};
    if (name.trim() !== customer.name) payload.name = name.trim();
    if (phone.trim() !== customer.phone) payload.phone = phone.trim();

    const nextAddress = address.trim().length > 0 ? address.trim() : null;
    if (nextAddress !== customer.address) payload.address = nextAddress;
    const nextNotes = notes.trim().length > 0 ? notes.trim() : null;
    if (nextNotes !== customer.notes) payload.notes = nextNotes;

    if (Object.keys(payload).length === 0) {
      onSaved(`Tidak ada perubahan pada ${customer.name}.`);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      onSaved(`Pelanggan ${payload.name ?? customer.name} diperbarui.`);
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  const nameError = fieldError(error, "name");
  const phoneError = fieldError(error, "phone");

  return (
    <form onSubmit={submit} onInput={onDirty} noValidate>
      <div className="bo-dialog__body">
        {anonymized ? (
          <div className="bo-alert bo-alert--info" id="edit-customer-anonymized">
            <p>{ANONYMIZED_EDIT_REASON}</p>
          </div>
        ) : null}

        <ValidationSummary prefix="edit-customer" error={error} />

        <div className="bo-form-grid">
          <Field label="Nama pelanggan" htmlFor="edit-customer-name" required error={nameError}>
            <Input
              id="edit-customer-name"
              value={name}
              autoComplete="name"
              disabled={anonymized}
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              aria-invalid={Boolean(nameError) || undefined}
              aria-describedby={
                anonymized
                  ? "edit-customer-anonymized"
                  : nameError
                    ? "edit-customer-name-error"
                    : undefined
              }
            />
          </Field>

          <Field
            label="Nomor HP"
            htmlFor="edit-customer-phone"
            required
            error={phoneError}
            hint="Nomor HP wajib diisi."
          >
            <Input
              id="edit-customer-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              disabled={anonymized}
              onChange={(event) => {
                setPhone(event.currentTarget.value);
              }}
              aria-invalid={Boolean(phoneError) || undefined}
              aria-describedby={
                anonymized
                  ? "edit-customer-anonymized"
                  : phoneError
                    ? "edit-customer-phone-error"
                    : "edit-customer-phone-hint"
              }
            />
          </Field>
        </div>

        <Field
          label="Alamat (opsional)"
          htmlFor="edit-customer-address"
          error={fieldError(error, "address")}
        >
          <Input
            id="edit-customer-address"
            value={address}
            autoComplete="street-address"
            disabled={anonymized}
            onChange={(event) => {
              setAddress(event.currentTarget.value);
            }}
            aria-invalid={Boolean(fieldError(error, "address")) || undefined}
            aria-describedby={
              anonymized
                ? "edit-customer-anonymized"
                : fieldError(error, "address")
                  ? "edit-customer-address-error"
                  : undefined
            }
          />
        </Field>

        <Field
          label="Catatan (opsional)"
          htmlFor="edit-customer-notes"
          error={fieldError(error, "notes")}
          hint={NOTES_HINT}
        >
          <Textarea
            id="edit-customer-notes"
            value={notes}
            disabled={anonymized}
            onChange={(event) => {
              setNotes(event.currentTarget.value);
            }}
            aria-invalid={Boolean(fieldError(error, "notes")) || undefined}
            aria-describedby={
              anonymized
                ? "edit-customer-anonymized"
                : fieldError(error, "notes")
                  ? "edit-customer-notes-error"
                  : "edit-customer-notes-hint"
            }
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
          disabled={pending || anonymized || missingCore}
          aria-busy={pending || undefined}
          aria-describedby={disabledReason ? "edit-customer-requirements" : undefined}
        >
          {pending ? "Menyimpan…" : "Simpan perubahan"}
        </Button>
      </DialogFooter>
      {disabledReason ? (
        <p className="bo-field__hint bo-form-hint" id="edit-customer-requirements">
          {disabledReason}
        </p>
      ) : null}
    </form>
  );
}
