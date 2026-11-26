"use client";

import {
  unlockUserResponseSchema,
  type AssignableStaffRole,
  type Outlet,
  type UpdateUserRequest,
  type UserSummary,
} from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError, type FormErrorState } from "@/components/auth/api-error";
import {
  ASSIGNABLE_ROLES,
  formatDate,
  OUTLET_SCOPED_ROLES,
  ROLE_LABELS,
} from "@/components/auth/labels";

interface UsersTableProps {
  users: UserSummary[];
  outlets: Outlet[];
}

interface EditState {
  name: string;
  email: string;
  username: string;
  phone: string;
  role: AssignableStaffRole | "";
  outletIds: string[];
}

const DEACTIVATE_REASON_MIN = 10;

function editStateFor(user: UserSummary, activeOutletIds: string[]): EditState {
  return {
    name: user.name,
    email: user.email,
    username: user.username ?? "",
    phone: user.phone,
    role: user.role === "OWNER" ? "" : user.role,
    outletIds: user.outletIds.filter((id) => activeOutletIds.includes(id)),
  };
}

function UserRow({
  user,
  outlets,
  outletNames,
  activeOutletIds,
}: {
  user: UserSummary;
  outlets: Outlet[];
  outletNames: Map<string, string>;
  activeOutletIds: string[];
}) {
  const router = useRouter();
  const fieldId = useId();
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const deactivateDialogRef = useRef<HTMLDialogElement>(null);
  const deactivateCancelRef = useRef<HTMLButtonElement>(null);

  const [edit, setEdit] = useState<EditState>(() => editStateFor(user, activeOutletIds));
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<FormErrorState | null>(null);

  const [reason, setReason] = useState("");
  const [deactivatePending, setDeactivatePending] = useState(false);
  const [deactivateError, setDeactivateError] = useState<FormErrorState | null>(null);

  const [unlockPending, setUnlockPending] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<string | null>(null);

  const isOwner = user.role === "OWNER";
  const editNeedsOutlet = edit.role !== "" && OUTLET_SCOPED_ROLES[edit.role];
  const reasonTooShort = reason.trim().length < DEACTIVATE_REASON_MIN;

  const assignedOutlets = isOwner || user.role === "ADMIN"
    ? "Semua outlet"
    : user.outletIds.map((id) => outletNames.get(id) ?? "Outlet tidak dikenal").join(", ") || "Belum ditugaskan";

  function openEdit() {
    setEdit(editStateFor(user, activeOutletIds));
    setEditError(null);
    editDialogRef.current?.showModal();
  }

  function openDeactivate() {
    setReason("");
    setDeactivateError(null);
    deactivateDialogRef.current?.showModal();
    deactivateCancelRef.current?.focus();
  }

  function toggleEditOutlet(outletId: string) {
    setEdit((current) => ({
      ...current,
      outletIds: current.outletIds.includes(outletId)
        ? current.outletIds.filter((value) => value !== outletId)
        : [...current.outletIds, outletId],
    }));
  }

  async function saveEdit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editPending) return;

    setEditError(null);

    if (!isOwner && edit.role === "") {
      setEditError({ message: "Periksa kembali isian Anda.", fieldErrors: { role: ["Peran wajib dipilih."] } });
      return;
    }

    if (!isOwner && edit.role !== "" && OUTLET_SCOPED_ROLES[edit.role] && edit.outletIds.length === 0) {
      setEditError({
        message: "Periksa kembali isian Anda.",
        fieldErrors: { outletIds: ["Kasir dan mekanik harus ditugaskan ke minimal satu outlet."] },
      });
      return;
    }

    const body: UpdateUserRequest = {
      name: edit.name.trim(),
      email: edit.email.trim(),
      username: edit.username.trim().length > 0 ? edit.username.trim() : null,
      phone: edit.phone.trim(),
    };

    if (!isOwner && edit.role !== "") {
      body.role = edit.role;
      body.outletIds = edit.outletIds;
    }

    setEditPending(true);

    try {
      const response = await fetch(`/api/v1/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setEditError(await readApiError(response));
        return;
      }

      editDialogRef.current?.close();
      setFeedback("Pengguna diperbarui.");
      router.refresh();
    } catch {
      setEditError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setEditPending(false);
    }
  }

  async function confirmDeactivate(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deactivatePending || reasonTooShort) return;

    setDeactivatePending(true);
    setDeactivateError(null);

    try {
      const response = await fetch(`/api/v1/users/${user.id}/deactivate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!response.ok) {
        setDeactivateError(await readApiError(response));
        return;
      }

      deactivateDialogRef.current?.close();
      setFeedback("Akses dicabut. Sesi aktif telah diakhiri.");
      router.refresh();
    } catch {
      setDeactivateError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setDeactivatePending(false);
    }
  }

  async function unlockAccount() {
    if (unlockPending) return;

    setUnlockPending(true);
    setUnlockError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/v1/users/${user.id}/unlock`, { method: "POST" });

      if (!response.ok) {
        setUnlockError((await readApiError(response)).message);
        return;
      }

      const parsed = unlockUserResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        setUnlockError("Respons server tidak dikenali. Muat ulang halaman lalu coba lagi.");
        return;
      }

      // Both values are success: the account has no active lock either way.
      setFeedback("Akun berhasil dibuka.");
      router.refresh();
    } catch {
      setUnlockError(NETWORK_ERROR_MESSAGE);
    } finally {
      setUnlockPending(false);
    }
  }

  const editFieldError = (key: string): string | undefined => editError?.fieldErrors[key]?.[0];
  const editSummary = editError
    ? Array.from(new Set([editError.message, ...Object.values(editError.fieldErrors).flat()]))
    : [];

  return (
    <tr>
      <td>
        <div className="wp3-table__name">{user.name}</div>
        <div className="wp3-table__detail wp3-cell-long">{user.email}</div>
        {user.username ? <div className="wp3-table__detail">@{user.username}</div> : null}
      </td>
      <td>
        <span className="wp3-role">{ROLE_LABELS[user.role]}</span>
      </td>
      <td>
        <span className="wp3-cell-long">{assignedOutlets}</span>
      </td>
      <td>
        <span className={`wp3-status ${user.isActive ? "wp3-status--active" : "wp3-status--inactive"}`}>
          {user.isActive ? "Aktif" : "Nonaktif"}
        </span>
      </td>
      <td className="wp3-table__nowrap">{formatDate(user.createdAt)}</td>
      <td>
        <div className="wp3-table__actions">
          <button
            type="button"
            className="wp3-btn"
            onClick={openEdit}
            aria-label={`Ubah ${user.name}`}
          >
            Ubah
          </button>
          {!isOwner ? (
            <button
              type="button"
              className="wp3-btn"
              onClick={() => {
                void unlockAccount();
              }}
              disabled={unlockPending}
              aria-label={`Buka kunci ${user.name}`}
              aria-describedby={unlockPending ? `${fieldId}-unlock-pending` : undefined}
            >
              {unlockPending ? "Membuka…" : "Buka kunci"}
            </button>
          ) : null}
          {user.isActive && !isOwner ? (
            <button
              type="button"
              className="wp3-btn wp3-btn--danger"
              onClick={openDeactivate}
              aria-label={`Nonaktifkan ${user.name}`}
            >
              Nonaktifkan
            </button>
          ) : null}
        </div>
        {unlockPending ? (
          <p className="wp3-reason" id={`${fieldId}-unlock-pending`} role="status">
            Membuka kunci akun…
          </p>
        ) : null}
        {unlockError ? (
          <p className="wp3-alert wp3-alert--danger" role="alert">
            {unlockError}
          </p>
        ) : null}
        {feedback ? (
          <p className="wp3-alert wp3-alert--success" role="status">
            {feedback}
          </p>
        ) : null}

        <dialog className="wp3-dialog" ref={editDialogRef} aria-labelledby={`${fieldId}-edit-title`}>
          <div className="wp3-dialog__header">
            <h2 className="wp3-dialog__title" id={`${fieldId}-edit-title`}>
              Ubah {user.name}
            </h2>
            <p className="wp3-dialog__lead">
              Perubahan peran dan outlet berlaku pada permintaan pengguna berikutnya.
              {isOwner ? " Peran Pemilik tidak dapat diubah." : ""}
            </p>
          </div>
          <form onSubmit={saveEdit} noValidate>
            <div className="wp3-dialog__body">
              {editError ? (
                <div className="wp3-alert wp3-alert--danger" role="alert">
                  {editSummary.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              ) : null}

              <div className="wp3-field">
                <label className="wp3-label" htmlFor={`${fieldId}-edit-name`}>
                  Nama
                </label>
                <input
                  className="wp3-input"
                  id={`${fieldId}-edit-name`}
                  value={edit.name}
                  onChange={(event) => setEdit((current) => ({ ...current, name: event.target.value }))}
                  aria-invalid={editFieldError("name") ? true : undefined}
                  required
                />
                {editFieldError("name") ? <p className="wp3-field-error">{editFieldError("name")}</p> : null}
              </div>

              <div className="wp3-field">
                <label className="wp3-label" htmlFor={`${fieldId}-edit-email`}>
                  Email
                </label>
                <input
                  className="wp3-input"
                  id={`${fieldId}-edit-email`}
                  type="email"
                  value={edit.email}
                  onChange={(event) => setEdit((current) => ({ ...current, email: event.target.value }))}
                  aria-invalid={editFieldError("email") ? true : undefined}
                  required
                />
                {editFieldError("email") ? <p className="wp3-field-error">{editFieldError("email")}</p> : null}
              </div>

              <div className="wp3-field">
                <label className="wp3-label" htmlFor={`${fieldId}-edit-username`}>
                  Nama pengguna (opsional)
                </label>
                <input
                  className="wp3-input"
                  id={`${fieldId}-edit-username`}
                  value={edit.username}
                  onChange={(event) => setEdit((current) => ({ ...current, username: event.target.value }))}
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={editFieldError("username") ? true : undefined}
                />
                {editFieldError("username") ? (
                  <p className="wp3-field-error">{editFieldError("username")}</p>
                ) : null}
              </div>

              <div className="wp3-field">
                <label className="wp3-label" htmlFor={`${fieldId}-edit-phone`}>
                  Nomor HP
                </label>
                <input
                  className="wp3-input"
                  id={`${fieldId}-edit-phone`}
                  type="tel"
                  value={edit.phone}
                  onChange={(event) => setEdit((current) => ({ ...current, phone: event.target.value }))}
                  aria-invalid={editFieldError("phone") ? true : undefined}
                  required
                />
                {editFieldError("phone") ? <p className="wp3-field-error">{editFieldError("phone")}</p> : null}
              </div>

              {isOwner ? (
                <p className="wp3-reason">
                  Akun Pemilik tidak dapat diubah perannya dan tidak dapat dinonaktifkan dari layar ini.
                </p>
              ) : (
                <>
                  <div className="wp3-field">
                    <label className="wp3-label" htmlFor={`${fieldId}-edit-role`}>
                      Peran
                    </label>
                    <select
                      className="wp3-select"
                      id={`${fieldId}-edit-role`}
                      value={edit.role}
                      onChange={(event) =>
                        setEdit((current) => ({
                          ...current,
                          role: event.target.value as AssignableStaffRole | "",
                        }))
                      }
                      aria-invalid={editFieldError("role") ? true : undefined}
                      required
                    >
                      <option value="">Pilih peran</option>
                      {ASSIGNABLE_ROLES.map((value) => (
                        <option key={value} value={value}>
                          {ROLE_LABELS[value]}
                        </option>
                      ))}
                    </select>
                    {editFieldError("role") ? <p className="wp3-field-error">{editFieldError("role")}</p> : null}
                    {edit.role === "ADMIN" ? (
                      <p className="wp3-reason">Admin melihat semua outlet dan dapat mengubah data operasional.</p>
                    ) : null}
                  </div>

                  <fieldset
                    className="wp3-fieldset"
                    aria-describedby={`${fieldId}-edit-outlet-help${
                      editFieldError("outletIds") ? ` ${fieldId}-edit-outlet-error` : ""
                    }`}
                  >
                    <legend className="wp3-label">Outlet</legend>
                    <p className="wp3-reason" id={`${fieldId}-edit-outlet-help`}>
                      {editNeedsOutlet
                        ? "Kasir dan mekanik harus ditugaskan ke minimal satu outlet aktif."
                        : "Pilih outlet yang dapat diakses pengguna."}{" "}
                      Outlet nonaktif tidak dapat ditugaskan.
                    </p>
                    <div className="wp3-checkbox-list">
                      {outlets.map((outlet) => (
                        <label className="wp3-checkbox" key={outlet.id}>
                          <input
                            type="checkbox"
                            checked={edit.outletIds.includes(outlet.id)}
                            disabled={!outlet.isActive}
                            onChange={() => toggleEditOutlet(outlet.id)}
                          />
                          <span>
                            {outlet.name}
                            {outlet.isActive ? "" : " (nonaktif)"}
                          </span>
                        </label>
                      ))}
                    </div>
                    {editFieldError("outletIds") ? (
                      <p className="wp3-field-error" id={`${fieldId}-edit-outlet-error`}>
                        {editFieldError("outletIds")}
                      </p>
                    ) : null}
                  </fieldset>
                </>
              )}
            </div>
            <div className="wp3-dialog__footer">
              <button
                type="button"
                className="wp3-btn"
                onClick={() => editDialogRef.current?.close()}
                disabled={editPending}
              >
                Batal
              </button>
              <button className="wp3-btn wp3-btn--primary" type="submit" disabled={editPending}>
                {editPending ? "Menyimpan…" : "Simpan perubahan"}
              </button>
            </div>
          </form>
        </dialog>

        <dialog
          className="wp3-dialog"
          ref={deactivateDialogRef}
          aria-labelledby={`${fieldId}-deactivate-title`}
          aria-describedby={`${fieldId}-deactivate-consequence`}
        >
          <div className="wp3-dialog__header">
            <h2 className="wp3-dialog__title" id={`${fieldId}-deactivate-title`}>
              Nonaktifkan {user.name}?
            </h2>
            <p className="wp3-dialog__lead" id={`${fieldId}-deactivate-consequence`}>
              Sesi aktif akan diakhiri dan pengguna tidak dapat masuk lagi. Riwayat transaksi dan catatan audit
              tetap tersimpan. Tindakan ini tidak dapat dibatalkan dari layar ini.
            </p>
          </div>
          <form onSubmit={confirmDeactivate} noValidate>
            <div className="wp3-dialog__body">
              {deactivateError ? (
                <div className="wp3-alert wp3-alert--danger" role="alert">
                  {deactivateError.message}
                </div>
              ) : null}

              <div className="wp3-field">
                <label className="wp3-label" htmlFor={`${fieldId}-deactivate-reason`}>
                  Alasan penonaktifan
                </label>
                <textarea
                  className="wp3-input"
                  id={`${fieldId}-deactivate-reason`}
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-describedby={`${fieldId}-deactivate-reason-help`}
                  required
                />
                <p className="wp3-reason" id={`${fieldId}-deactivate-reason-help`}>
                  Alasan minimal {DEACTIVATE_REASON_MIN} karakter dan tercatat di log audit.
                </p>
              </div>
            </div>
            <div className="wp3-dialog__footer">
              <button
                type="button"
                className="wp3-btn"
                ref={deactivateCancelRef}
                onClick={() => deactivateDialogRef.current?.close()}
                disabled={deactivatePending}
              >
                Batal
              </button>
              <button
                className="wp3-btn wp3-btn--danger"
                type="submit"
                disabled={deactivatePending || reasonTooShort}
                aria-describedby={`${fieldId}-deactivate-reason-help`}
              >
                {deactivatePending ? "Menonaktifkan…" : "Nonaktifkan pengguna"}
              </button>
            </div>
          </form>
        </dialog>
      </td>
    </tr>
  );
}

export function UsersTable({ users, outlets }: UsersTableProps) {
  const outletNames = new Map(outlets.map((outlet) => [outlet.id, outlet.name]));
  const activeOutletIds = outlets.filter((outlet) => outlet.isActive).map((outlet) => outlet.id);

  return (
    <div className="wp3-table-scroll">
      <table className="wp3-table">
        <caption className="wp3-visually-hidden">Daftar pengguna bengkel</caption>
        <thead>
          <tr>
            <th scope="col">Pengguna</th>
            <th scope="col">Peran</th>
            <th scope="col">Outlet</th>
            <th scope="col">Status</th>
            <th scope="col">Dibuat</th>
            <th scope="col" aria-label="Tindakan" />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              outlets={outlets}
              outletNames={outletNames}
              activeOutletIds={activeOutletIds}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
