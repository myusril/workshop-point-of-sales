"use client";

import type { CreateOutletRequest } from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError, type FormErrorState } from "@/components/auth/api-error";

interface OutletCreateFormProps {
  outletCount: number;
}

export function OutletCreateForm({ outletCount }: OutletCreateFormProps) {
  const router = useRouter();
  const fieldId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [isActive, setIsActive] = useState(true);
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

    const trimmedAddress = address.trim();
    const trimmedPhone = phone.trim();
    const payload: CreateOutletRequest = {
      name: name.trim(),
      isActive,
      ...(trimmedAddress.length > 0 ? { address: trimmedAddress } : {}),
      ...(trimmedPhone.length > 0 ? { phone: trimmedPhone } : {}),
    };

    setPending(true);

    try {
      const response = await fetch("/api/v1/outlets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      setName("");
      setAddress("");
      setPhone("");
      setIsActive(true);
      setSuccess("Outlet dibuat.");
      router.refresh();
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  const nameError = error?.fieldErrors.name?.[0];
  const addressError = error?.fieldErrors.address?.[0];
  const phoneError = error?.fieldErrors.phone?.[0];
  const summaryMessages = error
    ? Array.from(new Set([error.message, ...Object.values(error.fieldErrors).flat()]))
    : [];

  return (
    <section className="wp3-panel" aria-labelledby="create-outlet-title" id="tambah-outlet">
      <div className="wp3-panel__header">
        <h2 className="wp3-panel__title" id="create-outlet-title">
          Tambah outlet
        </h2>
        <span className="wp3-panel__meta">
          {outletCount === 0 ? "Outlet pertama" : `${outletCount} outlet terdaftar`}
        </span>
      </div>
      <div className="wp3-panel__body">
        {error ? (
          <div
            className="wp3-alert wp3-alert--danger"
            role="alert"
            ref={summaryRef}
            tabIndex={-1}
            aria-labelledby="create-outlet-error-title"
          >
            <p id="create-outlet-error-title">
              <strong>Outlet belum tersimpan.</strong> Perbaiki isian berikut.
            </p>
            <ul>
              {summaryMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {success ? (
          <p className="wp3-alert wp3-alert--success" role="status">
            {success}
          </p>
        ) : null}

        <form onSubmit={submit} aria-busy={pending} noValidate>
          <div className="wp3-form-grid">
            <div className="wp3-field">
              <label className="wp3-label" htmlFor={`${fieldId}-name`}>
                Nama outlet
              </label>
              <input
                className="wp3-input"
                id={`${fieldId}-name`}
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? `${fieldId}-name-error` : undefined}
                required
              />
              {nameError ? (
                <p className="wp3-field-error" id={`${fieldId}-name-error`}>
                  {nameError}
                </p>
              ) : null}
            </div>

            <div className="wp3-field">
              <label className="wp3-label" htmlFor={`${fieldId}-phone`}>
                Nomor HP (opsional)
              </label>
              <input
                className="wp3-input"
                id={`${fieldId}-phone`}
                name="phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? `${fieldId}-phone-error` : undefined}
              />
              {phoneError ? (
                <p className="wp3-field-error" id={`${fieldId}-phone-error`}>
                  {phoneError}
                </p>
              ) : null}
            </div>

            <div className="wp3-field">
              <label className="wp3-label" htmlFor={`${fieldId}-address`}>
                Alamat (opsional)
              </label>
              <textarea
                className="wp3-input"
                id={`${fieldId}-address`}
                name="address"
                rows={2}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                aria-invalid={addressError ? true : undefined}
                aria-describedby={addressError ? `${fieldId}-address-error` : undefined}
              />
              {addressError ? (
                <p className="wp3-field-error" id={`${fieldId}-address-error`}>
                  {addressError}
                </p>
              ) : null}
            </div>
          </div>

          <fieldset className="wp3-fieldset">
            <legend className="wp3-label">Status</legend>
            <label className="wp3-checkbox">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              <span>Aktif dan dapat dipilih sebagai outlet kerja</span>
            </label>
          </fieldset>

          <div className="wp3-form-actions">
            <button className="wp3-btn wp3-btn--primary" type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan outlet"}
            </button>
            {pending ? (
              <p className="wp3-reason" role="status">
                Menyimpan outlet…
              </p>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
