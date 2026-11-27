"use client";

import { customerListResponseSchema, type CustomerListItem } from "@workshop-pos/contracts";
import { useEffect, useState } from "react";

import { NETWORK_ERROR_MESSAGE } from "@/components/auth/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface PickedCustomer {
  id: string;
  name: string;
}

interface CustomerPickerProps {
  idPrefix: string;
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer) => void;
  /** Guarded navigation owned by the form, so a dirty draft is never lost. */
  onCreateCustomer: () => void;
  error?: string;
  disabled?: boolean;
}

export interface CustomerPickerResultState {
  /** Identifies the request; a stale response never replaces the current one. */
  key: string;
  status: "loading" | "ready" | "error";
  items: CustomerListItem[];
  total: number;
  /** The applied search, echoed in the zero-result copy. */
  query: string;
  message?: string;
}

const PICKER_PAGE_SIZE = "25";

interface CustomerPickerResultsProps {
  idPrefix: string;
  state: CustomerPickerResultState;
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer) => void;
  onRetry: () => void;
  disabled: boolean;
}

/**
 * Result region for the customer chooser. Split out from the fetch so the
 * loading, empty, error, and "N of total" states are rendered (and tested)
 * without a network round trip.
 */
export function CustomerPickerResults({
  idPrefix,
  state,
  value,
  onChange,
  onRetry,
  disabled,
}: CustomerPickerResultsProps) {
  const listId = `${idPrefix}-customer-list`;
  const selectedId = `${idPrefix}-customer-selected`;

  if (state.status === "loading") {
    return (
      <p className="bo-muted" role="status">
        Memuat pelanggan…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div className="bo-alert bo-alert--danger" role="alert">
        <p>{state.message}</p>
        <Button type="button" variant="secondary" disabled={disabled} onClick={onRetry}>
          Coba lagi
        </Button>
      </div>
    );
  }

  if (state.total === 0) {
    return (
      <>
        <p className="bo-muted">
          {state.query.length > 0
            ? `Tidak ada pelanggan yang cocok dengan "${state.query}".`
            : "Belum ada pelanggan pada bisnis ini."}
        </p>
        <p className="bo-field__hint">
          {state.query.length > 0
            ? "Periksa ejaan nama atau nomor HP, lalu cari lagi."
            : "Tambahkan pelanggan lewat tombol Tambah pelanggan di atas, lalu pilih di sini."}
        </p>
      </>
    );
  }

  return (
    <>
      <p className="bo-muted" role="status">
        Menampilkan {state.items.length} dari {state.total} pelanggan.
        {state.total > state.items.length
          ? " Persempit pencarian untuk menemukan pelanggan lain."
          : ""}
      </p>
      <ul
        className="max-h-64 overflow-y-auto rounded-control border border-line"
        id={listId}
        role="radiogroup"
        aria-labelledby={`${idPrefix}-customer-label`}
        aria-describedby={selectedId}
      >
        {state.items.map((item) => (
          <li key={item.id}>
            <label className="flex min-h-11 items-center gap-2 rounded-control px-2 hover:bg-hover">
              <input
                type="radio"
                name={`${idPrefix}-customer`}
                value={item.id}
                checked={value?.id === item.id}
                disabled={disabled}
                onChange={() => {
                  onChange({ id: item.id, name: item.name });
                }}
              />
              <span className="bo-cell-name">
                <span className="bo-cell-name__primary">{item.name}</span>
                <span className="bo-cell-sub">{item.phoneMasked}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Customer chooser for the vehicle form. Searches the customer endpoint with
 * the same masked-phone payload as the list, keeps the chosen customer visible,
 * and routes "Tambah pelanggan" through the form's guarded navigation.
 */
export function CustomerPicker({
  idPrefix,
  value,
  onChange,
  onCreateCustomer,
  error,
  disabled = false,
}: CustomerPickerProps) {
  const [search, setSearch] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<CustomerPickerResultState | null>(null);

  const requestKey = `${appliedQuery}\u0000${attempt}`;
  const selectedId = `${idPrefix}-customer-selected`;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ pageSize: PICKER_PAGE_SIZE });
    if (appliedQuery.length > 0) params.set("q", appliedQuery);

    fetch(`/api/v1/customers?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setResult({
            key: requestKey,
            status: "error",
            items: [],
            total: 0,
            query: appliedQuery,
            message: "Daftar pelanggan gagal dimuat. Periksa koneksi, lalu coba lagi.",
          });
          return;
        }

        const parsed = customerListResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          setResult({
            key: requestKey,
            status: "error",
            items: [],
            total: 0,
            query: appliedQuery,
            message: "Daftar pelanggan tidak dapat dibaca. Coba lagi.",
          });
          return;
        }

        setResult({
          key: requestKey,
          status: "ready",
          items: parsed.data.items,
          total: parsed.data.total,
          query: appliedQuery,
        });
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setResult({
          key: requestKey,
          status: "error",
          items: [],
          total: 0,
          query: appliedQuery,
          message: NETWORK_ERROR_MESSAGE,
        });
      });

    return () => controller.abort();
  }, [appliedQuery, attempt, requestKey]);

  function runSearch() {
    setAppliedQuery(search.trim());
    setAttempt((current) => current + 1);
  }

  const state: CustomerPickerResultState =
    result !== null && result.key === requestKey
      ? result
      : { key: requestKey, status: "loading", items: [], total: 0, query: appliedQuery };

  return (
    <div className="bo-field" id={`${idPrefix}-customer`} tabIndex={-1}>
      <span className="bo-field__label" id={`${idPrefix}-customer-label`}>
        Pelanggan
        <span className="bo-field__required"> Wajib</span>
      </span>
      <p className="bo-field__hint" id={selectedId}>
        {value ? `Dipilih: ${value.name}` : "Pilih pelanggan pemilik kendaraan."}
      </p>

      <div className="bo-form-actions" role="search" aria-labelledby={`${idPrefix}-customer-label`}>
        <div className="bo-search">
          <Input
            id={`${idPrefix}-customer-search`}
            type="search"
            value={search}
            placeholder="Nama atau nomor HP"
            autoComplete="off"
            disabled={disabled}
            aria-label="Cari pelanggan"
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? `${idPrefix}-customer-error` : selectedId}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              runSearch();
            }}
          />
          <Button type="button" variant="secondary" disabled={disabled} onClick={runSearch}>
            Cari
          </Button>
        </div>
        <Button type="button" variant="ghost" disabled={disabled} onClick={onCreateCustomer}>
          Tambah pelanggan
        </Button>
      </div>

      <CustomerPickerResults
        idPrefix={idPrefix}
        state={state}
        value={value}
        onChange={onChange}
        onRetry={runSearch}
        disabled={disabled}
      />

      {error ? (
        <p className="bo-field__error" id={`${idPrefix}-customer-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
