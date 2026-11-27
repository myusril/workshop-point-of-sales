"use client";

import { ANONYMIZED_CUSTOMER_NAME, type CustomerListItem } from "@workshop-pos/contracts";
import { Pencil, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError } from "@/components/auth/api-error";
import { DataTable, type DataTableColumn } from "@/components/back-office/data-table";
import { StatusChip } from "@/components/back-office/status-chip";
import { StatusToast } from "@/components/back-office/status-toast";
import { formatWibDate } from "@/lib/format";

import {
  AnonymizeCustomerDialog,
  CustomerEditDialog,
  CustomerPersonalDataDialog,
} from "./customer-dialogs";

interface CustomersTableProps {
  items: CustomerListItem[];
  canManageCustomers: boolean;
  canManagePersonalData: boolean;
  empty?: ReactNode;
}

interface ToastState {
  message: string;
  tone: "success" | "danger";
}

function asDownloadName(id: string): string {
  return `pelanggan-${id}.json`;
}

/**
 * Customer list (§9.7): masked phones in the table, full phone only inside the
 * edit dialog fetched from the record endpoint. Row actions stay at two icons:
 * "Ubah" for managers, and one Owner-only "Data pribadi" entry point that
 * holds the export and anonymization actions. An anonymized row never offers
 * "Ubah" or a repeat anonymization, but its export stays available.
 */
export function CustomersTable({
  items,
  canManageCustomers,
  canManagePersonalData,
  empty,
}: CustomersTableProps) {
  const [editing, setEditing] = useState<CustomerListItem | null>(null);
  const [personalData, setPersonalData] = useState<CustomerListItem | null>(null);
  const [anonymizing, setAnonymizing] = useState<CustomerListItem | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const personalDataTriggerRef = useRef<HTMLButtonElement | null>(null);

  const exportPersonalData = useCallback(async (item: CustomerListItem): Promise<boolean> => {
    setExportingId(item.id);
    try {
      const response = await fetch(`/api/v1/customers/${item.id}/export`);
      if (!response.ok) {
        const failure = await readApiError(response);
        setToast({ message: `Ekspor gagal. ${failure.message}`, tone: "danger" });
        return false;
      }

      const text = await response.text();
      const filename = asDownloadName(item.id);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setToast({ message: `Data pribadi pelanggan diekspor ke ${filename}.`, tone: "success" });
      return true;
    } catch {
      setToast({ message: NETWORK_ERROR_MESSAGE, tone: "danger" });
      return false;
    } finally {
      setExportingId(null);
    }
  }, []);

  // Stable columns keep row action buttons mounted while a dialog is open, so
  // closing the dialog can return focus to the button that opened it.
  const columns = useMemo<DataTableColumn<CustomerListItem>[]>(() => {
    const definition: DataTableColumn<CustomerListItem>[] = [
      {
        id: "name",
        header: "Nama",
        cell: (item) => {
          const anonymized = item.anonymizedAt !== null;
          return (
            <div className="bo-cell-name">
              <span className="bo-cell-name__primary">
                {anonymized ? ANONYMIZED_CUSTOMER_NAME : item.name}
              </span>
              {anonymized ? (
                <StatusChip tone="neutral" className="justify-self-start">
                  Dianonimkan
                </StatusChip>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "phone",
        header: "Telepon",
        cell: (item) => (
          <span className="bo-nowrap">{item.anonymizedAt !== null ? "—" : item.phoneMasked}</span>
        ),
      },
      {
        id: "vehicles",
        header: "Kendaraan",
        numeric: true,
        cell: (item) => {
          const displayName = item.anonymizedAt !== null ? ANONYMIZED_CUSTOMER_NAME : item.name;
          return (
            <Link
              className="inline-flex min-h-11 items-center justify-end text-accent-ink underline underline-offset-4 hover:text-accent-hover"
              href={`/vehicles?customerId=${item.id}`}
              aria-label={`Lihat ${item.vehicleCount} kendaraan ${displayName}`}
            >
              {item.vehicleCount}
            </Link>
          );
        },
      },
      {
        id: "updatedAt",
        header: "Diperbarui",
        cell: (item) => <span className="bo-nowrap">{formatWibDate(item.updatedAt)}</span>,
      },
    ];

    const canEditAny = canManageCustomers && items.some((item) => item.anonymizedAt === null);
    if (canManagePersonalData || canEditAny) {
      definition.push({
        id: "actions",
        header: "Aksi",
        sticky: true,
        className: "bo-cell-actions",
        cell: (item) => {
          const anonymized = item.anonymizedAt !== null;
          const displayName = anonymized ? ANONYMIZED_CUSTOMER_NAME : item.name;

          return (
            <div className="bo-row-actions">
              {canManageCustomers && !anonymized ? (
                <button
                  type="button"
                  className="bo-icon-button"
                  aria-label={`Ubah ${displayName}`}
                  onClick={(event) => {
                    editTriggerRef.current = event.currentTarget;
                    setEditing(item);
                  }}
                >
                  <Pencil aria-hidden="true" />
                </button>
              ) : null}

              {canManagePersonalData ? (
                <button
                  type="button"
                  className="bo-icon-button"
                  aria-label={`Data pribadi ${displayName}`}
                  onClick={(event) => {
                    personalDataTriggerRef.current = event.currentTarget;
                    setPersonalData(item);
                  }}
                >
                  <UserRound aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        },
      });
    }

    return definition;
  }, [canManageCustomers, canManagePersonalData, items]);

  return (
    <>
      <DataTable
        caption="Daftar pelanggan"
        columns={columns}
        data={items}
        getRowKey={(item) => item.id}
        empty={empty}
      />

      {editing ? (
        <CustomerEditDialog
          customer={editing}
          returnFocusRef={editTriggerRef}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={(message) => {
            setEditing(null);
            setToast({ message, tone: "success" });
          }}
        />
      ) : null}

      {personalData ? (
        <CustomerPersonalDataDialog
          customer={personalData}
          returnFocusRef={personalDataTriggerRef}
          exporting={exportingId === personalData.id}
          onExport={() => {
            void exportPersonalData(personalData).then((exported) => {
              // The toast sits outside the modal, so it is only announced once
              // the dialog closes; keep the dialog open on failure to retry.
              if (exported) setPersonalData(null);
            });
          }}
          onAnonymize={() => {
            setAnonymizing(personalData);
            setPersonalData(null);
          }}
          onClose={() => {
            setPersonalData(null);
          }}
        />
      ) : null}

      {anonymizing ? (
        <AnonymizeCustomerDialog
          customer={anonymizing}
          returnFocusRef={personalDataTriggerRef}
          onClose={() => {
            setAnonymizing(null);
          }}
          onAnonymized={() => {
            setAnonymizing(null);
            setToast({
              message:
                "Data pribadi pelanggan dianonimkan. Nama, nomor HP, alamat, dan catatan dihapus.",
              tone: "success",
            });
          }}
        />
      ) : null}

      {toast ? (
        <StatusToast
          message={toast.message}
          tone={toast.tone}
          onDismiss={() => {
            setToast(null);
          }}
        />
      ) : null}
    </>
  );
}
