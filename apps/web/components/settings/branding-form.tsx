"use client";

import type { Branding, UpdateBrandingRequest } from "@workshop-pos/contracts";
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

interface BrandingFormProps {
  branding: Branding;
}

export function BrandingForm({ branding }: BrandingFormProps) {
  const router = useRouter();
  const fieldId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [productName, setProductName] = useState(branding.productName);
  const [logoPath, setLogoPath] = useState(branding.logoPath ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (error) summaryRef.current?.focus();
  }, [error]);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setError(null);
    setSuccess(null);
    const payload: UpdateBrandingRequest = {
      productName,
      logoPath: logoPath.trim().length > 0 ? logoPath.trim() : null,
    };

    setPending(true);
    try {
      const response = await fetch("/api/v1/settings/branding", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }
      setSuccess("Merek produk disimpan dan dicatat di log audit.");
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
    <section className="bo-panel" aria-labelledby="branding-title">
      <div className="bo-panel__header">
        <h2 className="bo-panel__title" id="branding-title">
          Merek produk
        </h2>
        <span className="bo-panel__meta">FR-071</span>
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
              <strong>Merek belum tersimpan.</strong> Perbaiki isian berikut.
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
            label="Nama produk"
            htmlFor={`${fieldId}-name`}
            required
            hint="Nama yang tampil di aplikasi dan dokumen. Tidak ada aset merek pihak ketiga."
            error={fieldErrors.productName?.[0]}
          >
            <Input
              id={`${fieldId}-name`}
              name="productName"
              maxLength={80}
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              aria-invalid={fieldErrors.productName ? true : undefined}
              aria-describedby={
                fieldErrors.productName ? `${fieldId}-name-error` : `${fieldId}-name-hint`
              }
              required
            />
          </Field>

          <Field
            label="Path atau URL logo"
            htmlFor={`${fieldId}-logo`}
            hint="Path lokal seperti /logo.svg atau URL https. Unggah berkas tidak tersedia pada versi ini."
            error={fieldErrors.logoPath?.[0]}
          >
            <Input
              id={`${fieldId}-logo`}
              name="logoPath"
              maxLength={300}
              placeholder="/logo.svg"
              value={logoPath}
              onChange={(event) => setLogoPath(event.target.value)}
              aria-invalid={fieldErrors.logoPath ? true : undefined}
              aria-describedby={
                fieldErrors.logoPath ? `${fieldId}-logo-error` : `${fieldId}-logo-hint`
              }
            />
          </Field>

          <div className="bo-form-actions">
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? "Menyimpan…" : "Simpan merek"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
