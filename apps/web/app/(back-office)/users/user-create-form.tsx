"use client";

import type { AssignableStaffRole, CreateUserRequest, Outlet } from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError, type FormErrorState } from "@/components/auth/api-error";
import { ASSIGNABLE_ROLES, OUTLET_SCOPED_ROLES, ROLE_LABELS } from "@/components/auth/labels";

interface UserCreateFormProps {
  outlets: Outlet[];
}

interface CreateFields {
  name: string;
  email: string;
  username: string;
  phone: string;
  password: string;
}

const EMPTY_FIELDS: CreateFields = {
  name: "",
  email: "",
  username: "",
  phone: "",
  password: "",
};

export function UserCreateForm({ outlets }: UserCreateFormProps) {
  const router = useRouter();
  const fieldId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);

  const [fields, setFields] = useState<CreateFields>(EMPTY_FIELDS);
  const [role, setRole] = useState<AssignableStaffRole | "">("");
  const [outletIds, setOutletIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const needsOutlet = role !== "" && OUTLET_SCOPED_ROLES[role];

  useEffect(() => {
    if (error) summaryRef.current?.focus();
  }, [error]);

  function updateField(key: keyof CreateFields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function toggleOutlets(outletId: string) {
    setOutletIds((current) =>
      current.includes(outletId) ? current.filter((value) => value !== outletId) : [...current, outletId],
    );
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setError(null);
    setSuccess(null);

    if (role === "") {
      setError({
        message: "Periksa kembali isian Anda.",
        fieldErrors: { role: ["Peran wajib dipilih."] },
      });
      return;
    }

    if (OUTLET_SCOPED_ROLES[role] && outletIds.length === 0) {
      setError({
        message: "Periksa kembali isian Anda.",
        fieldErrors: { outletIds: ["Kasir dan mekanik harus ditugaskan ke minimal satu outlet."] },
      });
      return;
    }

    const username = fields.username.trim();
    const payload: CreateUserRequest = {
      name: fields.name.trim(),
      email: fields.email.trim(),
      phone: fields.phone.trim(),
      password: fields.password,
      role,
      outletIds,
      ...(username.length > 0 ? { username } : {}),
    };

    setPending(true);

    try {
      const response = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      setFields(EMPTY_FIELDS);
      setRole("");
      setOutletIds([]);
      setSuccess("Pengguna dibuat.");
      router.refresh();
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  const fieldError = (key: string): string | undefined => error?.fieldErrors[key]?.[0];
  const nameError = fieldError("name");
  const emailError = fieldError("email");
  const usernameError = fieldError("username");
  const phoneError = fieldError("phone");
  const passwordError = fieldError("password");
  const roleError = fieldError("role");
  const outletError = fieldError("outletIds");

  const summaryMessages = error
    ? Array.from(new Set([error.message, ...Object.values(error.fieldErrors).flat()]))
    : [];

  return (
    <section className="wp3-panel" aria-labelledby="create-user-title" id="tambah-pengguna">
      <div className="wp3-panel__header">
        <h2 className="wp3-panel__title" id="create-user-title">
          Tambah pengguna
        </h2>
        <span className="wp3-panel__meta">Peran Pemilik hanya dibuat lewat penyediaan akun.</span>
      </div>
      <div className="wp3-panel__body">
        {error ? (
          <div
            className="wp3-alert wp3-alert--danger"
            role="alert"
            ref={summaryRef}
            tabIndex={-1}
            aria-labelledby="create-user-error-title"
          >
            <p id="create-user-error-title">
              <strong>Pengguna belum tersimpan.</strong> Perbaiki isian berikut.
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
                Nama
              </label>
              <input
                className="wp3-input"
                id={`${fieldId}-name`}
                name="name"
                value={fields.name}
                onChange={(event) => updateField("name", event.target.value)}
                autoComplete="name"
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
              <label className="wp3-label" htmlFor={`${fieldId}-email`}>
                Email
              </label>
              <input
                className="wp3-input"
                id={`${fieldId}-email`}
                name="email"
                type="email"
                value={fields.email}
                onChange={(event) => updateField("email", event.target.value)}
                autoComplete="off"
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? `${fieldId}-email-error` : undefined}
                required
              />
              {emailError ? (
                <p className="wp3-field-error" id={`${fieldId}-email-error`}>
                  {emailError}
                </p>
              ) : null}
            </div>

            <div className="wp3-field">
              <label className="wp3-label" htmlFor={`${fieldId}-username`}>
                Nama pengguna (opsional)
              </label>
              <input
                className="wp3-input"
                id={`${fieldId}-username`}
                name="username"
                value={fields.username}
                onChange={(event) => updateField("username", event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={usernameError ? true : undefined}
                aria-describedby={`${fieldId}-username-help${usernameError ? ` ${fieldId}-username-error` : ""}`}
              />
              <p className="wp3-reason" id={`${fieldId}-username-help`}>
                Huruf kecil, angka, titik, garis bawah, atau tanda hubung. Bisa dipakai untuk masuk.
              </p>
              {usernameError ? (
                <p className="wp3-field-error" id={`${fieldId}-username-error`}>
                  {usernameError}
                </p>
              ) : null}
            </div>

            <div className="wp3-field">
              <label className="wp3-label" htmlFor={`${fieldId}-phone`}>
                Nomor HP
              </label>
              <input
                className="wp3-input"
                id={`${fieldId}-phone`}
                name="phone"
                type="tel"
                inputMode="tel"
                value={fields.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                autoComplete="tel"
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={`${fieldId}-phone-help${phoneError ? ` ${fieldId}-phone-error` : ""}`}
                required
              />
              <p className="wp3-reason" id={`${fieldId}-phone-help`}>
                Contoh: 0812 3456 7890.
              </p>
              {phoneError ? (
                <p className="wp3-field-error" id={`${fieldId}-phone-error`}>
                  {phoneError}
                </p>
              ) : null}
            </div>

            <div className="wp3-field">
              <label className="wp3-label" htmlFor={`${fieldId}-password`}>
                Kata sandi sementara
              </label>
              <input
                className="wp3-input"
                id={`${fieldId}-password`}
                name="password"
                type="password"
                value={fields.password}
                onChange={(event) => updateField("password", event.target.value)}
                autoComplete="new-password"
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={`${fieldId}-password-help${passwordError ? ` ${fieldId}-password-error` : ""}`}
                required
              />
              <p className="wp3-reason" id={`${fieldId}-password-help`}>
                Minimal 8 karakter, memuat huruf dan angka. Sampaikan kepada pengguna setelah akun dibuat.
              </p>
              {passwordError ? (
                <p className="wp3-field-error" id={`${fieldId}-password-error`}>
                  {passwordError}
                </p>
              ) : null}
            </div>

            <div className="wp3-field">
              <label className="wp3-label" htmlFor={`${fieldId}-role`}>
                Peran
              </label>
              <select
                className="wp3-select"
                id={`${fieldId}-role`}
                name="role"
                value={role}
                onChange={(event) => setRole(event.target.value as AssignableStaffRole | "")}
                aria-invalid={roleError ? true : undefined}
                aria-describedby={roleError ? `${fieldId}-role-error` : undefined}
                required
              >
                <option value="">Pilih peran</option>
                {ASSIGNABLE_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </option>
                ))}
              </select>
              {roleError ? (
                <p className="wp3-field-error" id={`${fieldId}-role-error`}>
                  {roleError}
                </p>
              ) : null}
            </div>
          </div>

          <fieldset
            className="wp3-fieldset"
            aria-describedby={`${fieldId}-outlets-help${outletError ? ` ${fieldId}-outlets-error` : ""}`}
          >
            <legend className="wp3-label">Outlet</legend>
            <p className="wp3-reason" id={`${fieldId}-outlets-help`}>
              {needsOutlet
                ? "Kasir dan mekanik harus ditugaskan ke minimal satu outlet."
                : "Pilih outlet yang dapat diakses pengguna. Admin dan Pemilik melihat semua outlet."}{" "}
              Outlet nonaktif tidak dapat ditugaskan.
            </p>
            <div className="wp3-checkbox-list">
              {outlets.map((outlet) => (
                <label className="wp3-checkbox" key={outlet.id}>
                  <input
                    type="checkbox"
                    name="outletIds"
                    value={outlet.id}
                    checked={outletIds.includes(outlet.id)}
                    disabled={!outlet.isActive}
                    onChange={() => toggleOutlets(outlet.id)}
                  />
                  <span>
                    {outlet.name}
                    {outlet.isActive ? "" : " (nonaktif)"}
                  </span>
                </label>
              ))}
            </div>
            {outletError ? (
              <p className="wp3-field-error" id={`${fieldId}-outlets-error`}>
                {outletError}
              </p>
            ) : null}
          </fieldset>

          <div className="wp3-form-actions">
            <button className="wp3-btn wp3-btn--primary" type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan pengguna"}
            </button>
            {pending ? (
              <p className="wp3-reason" role="status">
                Menyimpan perubahan akses…
              </p>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
