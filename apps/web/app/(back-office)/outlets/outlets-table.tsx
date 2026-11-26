"use client";

import type { Outlet, UpdateOutletRequest } from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError, type FormErrorState } from "@/components/auth/api-error";
import { formatDate } from "@/components/auth/labels";

interface OutletsTableProps {
  outlets: Outlet[];
}

interface OutletEditState {
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
}

function editStateFor(outlet: Outlet): OutletEditState {
  return {
    name: outlet.name,
    address: outlet.address ?? "",
    phone: outlet.phone ?? "",
    isActive: outlet.isActive,
  };
}

function OutletRow({ outlet }: { outlet: Outlet }) {
  const router = useRouter();
  const fieldId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [edit, setEdit] = useState<OutletEditState>(() => editStateFor(outlet));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function openEdit() {
    setEdit(editStateFor(outlet));
    setError(null);
    dialogRef.current?.showModal();
  }

  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setError(null);

    const trimmedAddress = edit.address.trim();
    const trimmedPhone = edit.phone.trim();
    const body: UpdateOutletRequest = {
      name: edit.name.trim(),
      address: trimmedAddress.length > 0 ? trimmedAddress : null,
      phone: trimmedPhone.length > 0 ? trimmedPhone : null,
      isActive: edit.isActive,
    };

    setPending(true);

    try {
      const response = await fetch(`/api/v1/outlets/${outlet.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      dialogRef.current?.close();
      setFeedback("Outlet diperbarui.");
      router.refresh();
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  const fieldError = (key: string): string | undefined => error?.fieldErrors[key]?.[0];

  return (
    <tr>
      <td>
        <div className="wp3-table__name">{outlet.name}</div>
      </td>
      <td>
        <span className="wp3-cell-long">{outlet.address ?? "—"}</span>
      </td>
      <td>
        <span className="wp3-mono">{outlet.phone ?? "—"}</span>
      </td>
      <td>
        <span className={`wp3-status ${outlet.isActive ? "wp3-status--active" : "wp3-status--inactive"}`}>
          {outlet.isActive ? "Aktif" : "Nonaktif"}
        </span>
      </td>
      <td className="wp3-table__nowrap">{formatDate(outlet.createdAt)}</td>
      <td>
        <div className="wp3-table__actions">
          <button type="button" className="wp3-btn" onClick={openEdit} aria-label={`Ubah ${outlet.name}`}>
            Ubah
          </button>
        </div>
        {feedback ? (
          <p className="wp3-alert wp3-alert--success" role="status">
            {feedback}
          </p>
        ) : null}

        <dialog className="wp3-dialog" ref={dialogRef} aria-labelledby={`${fieldId}-edit-title`}>
          <div className="wp3-dialog__header">
            <h2 className="wp3-dialog__title" id={`${fieldId}-edit-title`}>
              Ubah {outlet.name}
            </h2>
            <p className="wp3-dialog__lead">
              Outlet nonaktif tidak ditawarkan sebagai outlet kerja, tetapi riwayat transaksinya tetap tersimpan.
            </p>
          </div>
          <form onSubmit={save} noValidate>
            <div className="wp3-dialog__body">
              {error ? (
                <div className="wp3-alert wp3-alert--danger" role="alert">
                  {Array.from(new Set([error.message, ...Object.values(error.fieldErrors).flat()])).map(
                    (message) => (
                      <p key={message}>{message}</p>
                    ),
                  )}
                </div>
              ) : null}

              <div className="wp3-field">
                <label className="wp3-label" htmlFor={`${fieldId}-edit-name`}>
                  Nama outlet
                </label>
                <input
                  className="wp3-input"
                  id={`${fieldId}-edit-name`}
                  value={edit.name}
                  onChange={(event) => setEdit((current) => ({ ...current, name: event.target.value }))}
                  aria-invalid={fieldError("name") ? true : undefined}
                  required
                />
                {fieldError("name") ? <p className="wp3-field-error">{fieldError("name")}</p> : null}
              </div>

              <div className="wp3-field">
                <label className="wp3-label" htmlFor={`${fieldId}-edit-address`}>
                  Alamat (opsional)
                </label>
                <textarea
                  className="wp3-input"
                  id={`${fieldId}-edit-address`}
                  rows={2}
                  value={edit.address}
                  onChange={(event) => setEdit((current) => ({ ...current, address: event.target.value }))}
                  aria-invalid={fieldError("address") ? true : undefined}
                />
                {fieldError("address") ? <p className="wp3-field-error">{fieldError("address")}</p> : null}
              </div>

              <div className="wp3-field">
                <label className="wp3-label" htmlFor={`${fieldId}-edit-phone`}>
                  Nomor HP (opsional)
                </label>
                <input
                  className="wp3-input"
                  id={`${fieldId}-edit-phone`}
                  type="tel"
                  inputMode="tel"
                  value={edit.phone}
                  onChange={(event) => setEdit((current) => ({ ...current, phone: event.target.value }))}
                  aria-invalid={fieldError("phone") ? true : undefined}
                />
                {fieldError("phone") ? <p className="wp3-field-error">{fieldError("phone")}</p> : null}
              </div>

              <fieldset className="wp3-fieldset">
                <legend className="wp3-label">Status</legend>
                <label className="wp3-checkbox">
                  <input
                    type="checkbox"
                    checked={edit.isActive}
                    onChange={(event) =>
                      setEdit((current) => ({ ...current, isActive: event.target.checked }))
                    }
                  />
                  <span>Aktif dan dapat dipilih sebagai outlet kerja</span>
                </label>
              </fieldset>
            </div>
            <div className="wp3-dialog__footer">
              <button
                type="button"
                className="wp3-btn"
                onClick={() => dialogRef.current?.close()}
                disabled={pending}
              >
                Batal
              </button>
              <button className="wp3-btn wp3-btn--primary" type="submit" disabled={pending}>
                {pending ? "Menyimpan…" : "Simpan perubahan"}
              </button>
            </div>
          </form>
        </dialog>
      </td>
    </tr>
  );
}

export function OutletsTable({ outlets }: OutletsTableProps) {
  return (
    <div className="wp3-table-scroll">
      <table className="wp3-table">
        <caption className="wp3-visually-hidden">Daftar outlet bengkel</caption>
        <thead>
          <tr>
            <th scope="col">Nama outlet</th>
            <th scope="col">Alamat</th>
            <th scope="col">Telepon</th>
            <th scope="col">Status</th>
            <th scope="col">Dibuat</th>
            <th scope="col" aria-label="Tindakan" />
          </tr>
        </thead>
        <tbody>
          {outlets.map((outlet) => (
            <OutletRow key={outlet.id} outlet={outlet} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
