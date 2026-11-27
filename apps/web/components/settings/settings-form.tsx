"use client";

import type { OutletSettings, UpdateOutletSettingsRequest } from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import {
  NETWORK_ERROR_MESSAGE,
  readApiError,
  type FormErrorState,
} from "@/components/auth/api-error";
import { Field } from "@/components/back-office/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface SettingsFormProps {
  settings: OutletSettings;
}

interface FormValues {
  taxRate: string;
  cashierDiscountCapPercent: string;
  idleTimeoutMinutes: string;
  receiptPaperWidth: string;
  voidReasonMinLength: string;
  receiptPrefix: string;
  receiptHeaderText: string;
  receiptFooterText: string;
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const router = useRouter();
  const fieldId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>({
    taxRate: String(settings.taxRate),
    cashierDiscountCapPercent: String(settings.cashierDiscountCapPercent),
    idleTimeoutMinutes: String(settings.idleTimeoutMinutes),
    receiptPaperWidth: String(settings.receiptPaperWidth),
    voidReasonMinLength: String(settings.voidReasonMinLength),
    receiptPrefix: settings.receiptPrefix,
    receiptHeaderText: settings.receiptHeaderText ?? "",
    receiptFooterText: settings.receiptFooterText ?? "",
  });

  useEffect(() => {
    if (error) summaryRef.current?.focus();
  }, [error]);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setError(null);
    setSuccess(null);

    const numericRules = [
      { key: "taxRate", label: "Tarif pajak", min: 0, max: 100 },
      { key: "cashierDiscountCapPercent", label: "Batas diskon kasir", min: 0, max: 100 },
      { key: "idleTimeoutMinutes", label: "Batas menganggur sesi", min: 1, max: 1440 },
      { key: "voidReasonMinLength", label: "Panjang minimal alasan void", min: 1, max: 200 },
    ] as const;
    const validationErrors: Record<string, string[]> = {};
    for (const rule of numericRules) {
      const raw = values[rule.key].trim();
      const parsed = Number(raw);
      if (raw.length === 0 || !Number.isInteger(parsed) || parsed < rule.min || parsed > rule.max) {
        validationErrors[rule.key] = [
          `${rule.label} harus bilangan bulat ${rule.min} sampai ${rule.max}.`,
        ];
      }
    }
    if (Object.keys(validationErrors).length > 0) {
      setError({ message: "Periksa isian angka.", fieldErrors: validationErrors });
      return;
    }

    const payload: UpdateOutletSettingsRequest = {
      outletId: settings.outletId,
      taxRate: Number(values.taxRate),
      cashierDiscountCapPercent: Number(values.cashierDiscountCapPercent),
      idleTimeoutMinutes: Number(values.idleTimeoutMinutes),
      receiptPaperWidth: values.receiptPaperWidth === "80" ? 80 : 58,
      voidReasonMinLength: Number(values.voidReasonMinLength),
      receiptPrefix: values.receiptPrefix,
      receiptHeaderText: values.receiptHeaderText,
      receiptFooterText: values.receiptFooterText,
    };

    setPending(true);
    try {
      const response = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }
      setSuccess("Pengaturan disimpan dan dicatat di log audit.");
      router.refresh();
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  const fieldErrors = error?.fieldErrors ?? {};
  const summaryMessages = error
    ? Array.from(new Set([error.message, ...Object.values(fieldErrors).flat()]))
    : [];

  return (
    <section className="bo-panel" aria-labelledby="settings-title">
      <div className="bo-panel__header">
        <h2 className="bo-panel__title" id="settings-title">
          Pengaturan outlet {settings.outletName}
        </h2>
        <span className="bo-panel__meta">
          {settings.updatedAt ? `Terakhir diubah ${settings.updatedByName ?? "—"}` : "Masih memakai bawaan"}
        </span>
      </div>
      <div className="bo-panel__body">
        {error ? (
          <div
            className="bo-alert bo-alert--danger"
            role="alert"
            tabIndex={-1}
            ref={summaryRef}
            aria-labelledby={`${fieldId}-error-title`}
          >
            <p id={`${fieldId}-error-title`}>
              <strong>Pengaturan belum tersimpan.</strong> Perbaiki isian berikut.
            </p>
            <ul>
              {summaryMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {success ? (
          <p className="bo-alert bo-alert--success" role="status">
            {success}
          </p>
        ) : null}

        <form onSubmit={submit} aria-busy={pending} noValidate className="bo-form-grid">
          <Field
            label="Tarif pajak (%)"
            htmlFor={`${fieldId}-tax`}
            required
            hint="0 sampai 100. Perubahan tidak mengubah transaksi yang sudah ada."
            error={fieldErrors.taxRate?.[0]}
          >
            <Input
              id={`${fieldId}-tax`}
              name="taxRate"
              type="number"
              min={0}
              max={100}
              step={1}
              value={values.taxRate}
              onChange={(event) => update("taxRate", event.target.value)}
              aria-invalid={fieldErrors.taxRate ? true : undefined}
              aria-describedby={
                fieldErrors.taxRate ? `${fieldId}-tax-error` : `${fieldId}-tax-hint`
              }
            />
          </Field>

          <Field
            label="Batas diskon kasir (%)"
            htmlFor={`${fieldId}-cap`}
            required
            hint="Diskon di atas batas ini memerlukan Admin atau Owner dan dicatat di log audit."
            error={fieldErrors.cashierDiscountCapPercent?.[0]}
          >
            <Input
              id={`${fieldId}-cap`}
              name="cashierDiscountCapPercent"
              type="number"
              min={0}
              max={100}
              step={1}
              value={values.cashierDiscountCapPercent}
              onChange={(event) => update("cashierDiscountCapPercent", event.target.value)}
              aria-invalid={fieldErrors.cashierDiscountCapPercent ? true : undefined}
              aria-describedby={
                fieldErrors.cashierDiscountCapPercent
                  ? `${fieldId}-cap-error`
                  : `${fieldId}-cap-hint`
              }
            />
          </Field>

          <Field
            label="Batas menganggur sesi (menit)"
            htmlFor={`${fieldId}-idle`}
            required
            hint="Sesi yang menganggur lebih lama dari ini meminta masuk ulang."
            error={fieldErrors.idleTimeoutMinutes?.[0]}
          >
            <Input
              id={`${fieldId}-idle`}
              name="idleTimeoutMinutes"
              type="number"
              min={1}
              max={1440}
              step={1}
              value={values.idleTimeoutMinutes}
              onChange={(event) => update("idleTimeoutMinutes", event.target.value)}
              aria-invalid={fieldErrors.idleTimeoutMinutes ? true : undefined}
              aria-describedby={
                fieldErrors.idleTimeoutMinutes
                  ? `${fieldId}-idle-error`
                  : `${fieldId}-idle-hint`
              }
            />
          </Field>

          <Field
            label="Lebar kertas struk"
            htmlFor={`${fieldId}-width`}
            required
            error={fieldErrors.receiptPaperWidth?.[0]}
          >
            <select
              className="bo-select"
              id={`${fieldId}-width`}
              name="receiptPaperWidth"
              value={values.receiptPaperWidth}
              onChange={(event) => update("receiptPaperWidth", event.target.value)}
              aria-invalid={fieldErrors.receiptPaperWidth ? true : undefined}
              aria-describedby={
                fieldErrors.receiptPaperWidth ? `${fieldId}-width-error` : undefined
              }
            >
              <option value="58">58 mm</option>
              <option value="80">80 mm</option>
            </select>
          </Field>

          <Field
            label="Panjang minimal alasan void"
            htmlFor={`${fieldId}-void`}
            required
            hint="Jumlah karakter minimal sebelum transaksi dapat dibatalkan."
            error={fieldErrors.voidReasonMinLength?.[0]}
          >
            <Input
              id={`${fieldId}-void`}
              name="voidReasonMinLength"
              type="number"
              min={1}
              max={200}
              step={1}
              value={values.voidReasonMinLength}
              onChange={(event) => update("voidReasonMinLength", event.target.value)}
              aria-invalid={fieldErrors.voidReasonMinLength ? true : undefined}
              aria-describedby={
                fieldErrors.voidReasonMinLength
                  ? `${fieldId}-void-error`
                  : `${fieldId}-void-hint`
              }
            />
          </Field>

          <Field
            label="Awalan nomor struk"
            htmlFor={`${fieldId}-prefix`}
            hint="Huruf, angka, garis miring, atau tanda hubung. Boleh kosong."
            error={fieldErrors.receiptPrefix?.[0]}
          >
            <Input
              id={`${fieldId}-prefix`}
              name="receiptPrefix"
              maxLength={20}
              value={values.receiptPrefix}
              onChange={(event) => update("receiptPrefix", event.target.value)}
              aria-invalid={fieldErrors.receiptPrefix ? true : undefined}
              aria-describedby={
                fieldErrors.receiptPrefix ? `${fieldId}-prefix-error` : `${fieldId}-prefix-hint`
              }
            />
          </Field>

          <Field
            label="Teks kepala struk"
            htmlFor={`${fieldId}-header`}
            hint="Muncul di bagian atas struk. Boleh kosong."
            error={fieldErrors.receiptHeaderText?.[0]}
          >
            <Textarea
              id={`${fieldId}-header`}
              name="receiptHeaderText"
              rows={3}
              maxLength={300}
              value={values.receiptHeaderText}
              onChange={(event) => update("receiptHeaderText", event.target.value)}
              aria-invalid={fieldErrors.receiptHeaderText ? true : undefined}
              aria-describedby={
                fieldErrors.receiptHeaderText
                  ? `${fieldId}-header-error`
                  : `${fieldId}-header-hint`
              }
            />
          </Field>

          <Field
            label="Teks kaki struk"
            htmlFor={`${fieldId}-footer`}
            hint="Muncul di bagian bawah struk. Boleh kosong."
            error={fieldErrors.receiptFooterText?.[0]}
          >
            <Textarea
              id={`${fieldId}-footer`}
              name="receiptFooterText"
              rows={3}
              maxLength={300}
              value={values.receiptFooterText}
              onChange={(event) => update("receiptFooterText", event.target.value)}
              aria-invalid={fieldErrors.receiptFooterText ? true : undefined}
              aria-describedby={
                fieldErrors.receiptFooterText
                  ? `${fieldId}-footer-error`
                  : `${fieldId}-footer-hint`
              }
            />
          </Field>

          <div className="bo-form-actions">
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? "Menyimpan…" : "Simpan pengaturan"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
