"use client";

import {
  vehicleDetailResponseSchema,
  type Vehicle,
  type VehicleListItem,
} from "@workshop-pos/contracts";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError } from "@/components/auth/api-error";
import { DataTable, type DataTableColumn } from "@/components/back-office/data-table";
import { DiscardDialog } from "@/components/back-office/discard-dialog";
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
} from "@/components/ui/dialog";

import { VehicleForm } from "./vehicle-form";

interface VehiclesTableProps {
  items: VehicleListItem[];
  canManageVehicles: boolean;
  empty?: ReactNode;
}

/**
 * Vehicle list: canonical plate in the mono layer links to the read-only
 * history, and the row action opens the edit dialog only for roles that may
 * manage vehicles. The list row omits VIN and notes, so the dialog reads the
 * full record before rendering the form; otherwise saving the odometer would
 * wipe the fields the row never carried.
 */
export function VehiclesTable({ items, canManageVehicles, empty }: VehiclesTableProps) {
  const [editing, setEditing] = useState<VehicleListItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Stable columns keep the edit button mounted while its dialog is open.
  const columns = useMemo<DataTableColumn<VehicleListItem>[]>(() => {
    const definition: DataTableColumn<VehicleListItem>[] = [
      {
        id: "plate",
        header: "Plat",
        cell: (item) => (
          <Link
            className="bo-cell-mono inline-flex min-h-11 items-center"
            href={`/vehicles/${item.id}`}
            aria-label={`Buka riwayat ${item.normalizedPlate}`}
          >
            {item.normalizedPlate}
          </Link>
        ),
      },
      {
        id: "vehicle",
        header: "Kendaraan",
        cell: (item) => (
          <div className="bo-cell-name">
            <span className="bo-cell-name__primary">
              {item.brand} {item.model}
            </span>
            {item.year !== null ? <span className="bo-cell-sub">{item.year}</span> : null}
          </div>
        ),
      },
      {
        id: "customer",
        header: "Pelanggan",
        cell: (item) => (
          <div className="bo-cell-name">
            <span className="bo-cell-name__primary">{item.customerName}</span>
            {item.customerAnonymized ? (
              <span className="bo-cell-sub">Data pelanggan dianonimkan</span>
            ) : null}
          </div>
        ),
      },
      {
        id: "odometer",
        header: "Odometer",
        numeric: true,
        cell: (item) => (
          <span className="bo-nowrap">
            {item.odometer === null ? "—" : `${item.odometer.toLocaleString("id-ID")} km`}
          </span>
        ),
      },
    ];

    if (canManageVehicles) {
      definition.push({
        id: "actions",
        header: "Aksi",
        sticky: true,
        className: "bo-cell-actions",
        cell: (item) => (
          <div className="bo-row-actions">
            <button
              type="button"
              className="bo-icon-button"
              aria-label={`Ubah ${item.normalizedPlate}`}
              onClick={(event) => {
                editTriggerRef.current = event.currentTarget;
                setEditing(item);
              }}
            >
              <Pencil aria-hidden="true" />
            </button>
          </div>
        ),
      });
    }

    return definition;
  }, [canManageVehicles]);

  return (
    <>
      <DataTable
        caption="Daftar kendaraan"
        columns={columns}
        data={items}
        getRowKey={(item) => item.id}
        empty={empty}
      />

      {editing ? (
        <VehicleEditDialog
          vehicle={editing}
          returnFocusRef={editTriggerRef}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={(nextMessage) => {
            setEditing(null);
            setMessage(nextMessage);
          }}
        />
      ) : null}

      {message ? <StatusToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </>
  );
}

interface VehicleEditDialogProps {
  vehicle: VehicleListItem;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function VehicleEditDialog({ vehicle, returnFocusRef, onClose, onSaved }: VehicleEditDialogProps) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [attempt, setAttempt] = useState(0);

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
          aria-describedby="vehicle-edit-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Ubah {vehicle.normalizedPlate}</DialogTitle>
            <DialogDescription id="vehicle-edit-description">
              Plat disimpan dalam bentuk kanonik tanpa spasi. Perubahan dicatat di log audit sebagai
              nama kolom yang berubah, tanpa menyalin nomor rangka atau catatan.
            </DialogDescription>
          </DialogHeader>
          <VehicleEditLoader
            key={attempt}
            vehicleId={vehicle.id}
            onRetry={() => {
              setAttempt((current) => current + 1);
            }}
            onDirty={() => {
              setDirty(true);
            }}
            onSaved={(result) => {
              router.refresh();
              onSaved(result.message);
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
          onClose();
        }}
      />
    </>
  );
}

interface VehicleEditLoaderProps {
  vehicleId: string;
  onRetry: () => void;
  onDirty: () => void;
  onSaved: (result: { message: string }) => void;
}

/**
 * The list row omits VIN and notes, so the edit dialog fetches the full record
 * first. The fetch state lives in a keyed child: retry remounts it with a fresh
 * loading state instead of resetting state from an effect.
 */
function VehicleEditLoader({ vehicleId, onRetry, onDirty, onSaved }: VehicleEditLoaderProps) {
  const [item, setItem] = useState<Vehicle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/v1/vehicles/${vehicleId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setLoadError((await readApiError(response)).message);
          return;
        }
        // The detail read answers `{ item }` without the create-only `reused` flag.
        const body = (await response.json()) as { item?: unknown };
        const parsed = vehicleDetailResponseSchema.safeParse(body);
        if (!parsed.success) {
          setLoadError("Data kendaraan tidak dapat dibaca. Coba lagi.");
          return;
        }
        setItem(parsed.data.item);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(NETWORK_ERROR_MESSAGE);
      });

    return () => controller.abort();
  }, [vehicleId]);

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
            Memuat data kendaraan…
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

  return <VehicleForm mode="edit" vehicle={item} onSaved={onSaved} onDirty={onDirty} />;
}
