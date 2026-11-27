"use client";

import {
  vehicleResponseSchema,
  type CreateVehicleRequest,
  type UpdateVehicleRequest,
  type Vehicle,
} from "@workshop-pos/contracts";
import { PLATE_MAX_LENGTH, isValidPlate, normalizePlate } from "@workshop-pos/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError, type FormErrorState } from "@/components/auth/api-error";
import { DiscardDialog } from "@/components/back-office/discard-dialog";
import { Field } from "@/components/back-office/field";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { CustomerPicker, type PickedCustomer } from "./customer-picker";

/** PD-02 minimization copy, verbatim from the design system (§9.7). */
const NOTES_HINT = "Jangan masukkan data pribadi yang tidak diperlukan.";

export interface VehicleFormResult {
  message: string;
}

function fieldError(error: FormErrorState | null, name: string): string | undefined {
  return error?.fieldErrors[name]?.[0];
}

function plateValidationMessage(raw: string): string | null {
  if (raw.trim().length === 0) return "Nomor polisi wajib diisi.";
  if (!isValidPlate(raw)) {
    return `Nomor polisi hanya boleh huruf dan angka, maksimal ${PLATE_MAX_LENGTH} karakter.`;
  }
  return null;
}

interface ValidationSummaryProps {
  prefix: string;
  error: FormErrorState | null;
}

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
                <a href={`#${prefix}-${field === "customerId" ? "customer" : field}`}>{messages[0]}</a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

interface VehicleReuseNoticeProps {
  vehicleId: string;
  plate: string;
  /** Registered owner of the existing vehicle, from the create response. */
  ownerName: string;
  /** Customer selected in the form that triggered the duplicate. */
  selectedCustomerName: string;
  /** True when the existing vehicle belongs to someone else. */
  differentOwner: boolean;
  /** Guarded navigation so a dirty draft is confirmed before leaving. */
  onOpen: (href: string) => void;
}

/**
 * AC4.2 duplicate guard result: the existing vehicle is returned (HTTP 200)
 * and named here with its registered owner, so the UI never claims a second
 * record was created and never hides a mismatch between the owner and the
 * customer the user picked.
 */
export function VehicleReuseNotice({
  vehicleId,
  plate,
  ownerName,
  selectedCustomerName,
  differentOwner,
  onOpen,
}: VehicleReuseNoticeProps) {
  return (
    <div className="bo-alert bo-alert--warning" role="status">
      <p>
        <strong>Kendaraan dengan plat ini sudah ada dan digunakan kembali.</strong>
      </p>
      <p>
        Tidak ada kendaraan baru yang dibuat. Kendaraan ini terdaftar atas nama {ownerName}.
      </p>
      {differentOwner ? (
        <p>
          <strong>Pelanggan berbeda.</strong> Anda memilih {selectedCustomerName}, bukan {ownerName}.
          Periksa kembali sebelum melanjutkan servis.
        </p>
      ) : null}
      <button
        type="button"
        className="bo-link-button"
        onClick={() => {
          onOpen(`/vehicles/${vehicleId}`);
        }}
      >
        Buka kendaraan {plate}
      </button>
    </div>
  );
}

interface VehicleFormProps {
  mode: "create" | "edit";
  vehicle?: Vehicle;
  onDirty: () => void;
  onSaved: (result: VehicleFormResult) => void;
}

export function VehicleForm({ mode, vehicle, onDirty, onSaved }: VehicleFormProps) {
  const idPrefix = mode === "create" ? "create-vehicle" : "edit-vehicle";
  const router = useRouter();

  const [plate, setPlate] = useState(vehicle?.normalizedPlate ?? "");
  const [brand, setBrand] = useState(vehicle?.brand ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [year, setYear] = useState(vehicle?.year === null || vehicle?.year === undefined ? "" : String(vehicle.year));
  const [color, setColor] = useState(vehicle?.color ?? "");
  const [odometer, setOdometer] = useState(
    vehicle?.odometer === null || vehicle?.odometer === undefined ? "" : String(vehicle.odometer),
  );
  const [vin, setVin] = useState(vehicle?.vin ?? "");
  const [notes, setNotes] = useState(vehicle?.notes ?? "");
  const [customer, setCustomer] = useState<PickedCustomer | null>(
    vehicle ? { id: vehicle.customerId, name: vehicle.customerName } : null,
  );
  const [reused, setReused] = useState<{
    vehicleId: string;
    plate: string;
    ownerName: string;
    ownerId: string;
  } | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);
  const [dirty, setDirty] = useState(false);
  // A link inside the form may navigate away; hold the target until the user
  // confirms discarding the draft instead of dropping it silently.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  function markDirty() {
    setDirty(true);
    onDirty();
  }

  function guardNavigation(href: string) {
    if (!dirty) {
      router.push(href);
      return;
    }
    setPendingHref(href);
  }

  const normalizedPlate = normalizePlate(plate);
  const plateHint =
    normalizedPlate.length > 0 ? `Bentuk tersimpan: ${normalizedPlate}` : "Bentuk tersimpan: —";

  const missingCore =
    plate.trim().length === 0 ||
    brand.trim().length === 0 ||
    model.trim().length === 0 ||
    customer === null;
  const disabledReason = missingCore
    ? "Lengkapi nomor polisi, merek, model, dan pelanggan untuk menyimpan."
    : null;

  function clearLocalError(name: string) {
    setLocalErrors((current) => {
      if (!(name in current)) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};

    const plateMessage = plateValidationMessage(plate);
    if (plateMessage) next.plate = plateMessage;
    if (brand.trim().length === 0) next.brand = "Merek wajib diisi.";
    if (model.trim().length === 0) next.model = "Model wajib diisi.";
    if (!customer) next.customerId = "Pelanggan wajib dipilih.";

    if (year.trim().length > 0) {
      const parsedYear = Number(year);
      if (!/^\d+$/.test(year) || parsedYear < 1886 || parsedYear > 2200) {
        next.year = "Tahun harus bilangan bulat antara 1886 dan 2200.";
      }
    }

    if (odometer.trim().length > 0) {
      if (!/^\d+$/.test(odometer)) next.odometer = "Odometer harus bilangan bulat nol atau lebih.";
      else if (Number(odometer) > 10_000_000) next.odometer = "Odometer terlalu besar.";
    }

    if (vin.trim().length > 0 && !/^[A-Z0-9-]+$/.test(vin.trim().toUpperCase())) {
      next.vin = "Nomor rangka hanya boleh huruf, angka, atau tanda hubung.";
    }

    return next;
  }

  function localErrorState(next: Record<string, string>): FormErrorState {
    return {
      message: "Periksa kembali isian Anda.",
      fieldErrors: Object.fromEntries(Object.entries(next).map(([name, message]) => [name, [message]])),
    };
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const nextLocalErrors = validate();
    if (Object.keys(nextLocalErrors).length > 0) {
      setLocalErrors(nextLocalErrors);
      setError(localErrorState(nextLocalErrors));
      return;
    }

    setLocalErrors({});
    setError(null);
    setReused(null);
    setPending(true);

    try {
      if (mode === "create") {
        const input: CreateVehicleRequest = {
          plate: plate.trim(),
          brand: brand.trim(),
          model: model.trim(),
          customerId: customer!.id,
          ...(year.trim().length > 0 ? { year: Number(year) } : {}),
          ...(color.trim().length > 0 ? { color: color.trim() } : {}),
          ...(odometer.trim().length > 0 ? { odometer: Number(odometer) } : {}),
          ...(vin.trim().length > 0 ? { vin: vin.trim().toUpperCase() } : {}),
          ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
        };

        const response = await fetch("/api/v1/vehicles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          setError(await readApiError(response));
          return;
        }

        if (response.status !== 201 && response.status !== 200) {
          setError({ message: "Respons server tidak dikenali. Coba lagi.", fieldErrors: {} });
          return;
        }

        const parsed = vehicleResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          setError({ message: "Data kendaraan tidak dapat dibaca. Coba lagi.", fieldErrors: {} });
          return;
        }

        if (parsed.data.reused) {
          setReused({
            vehicleId: parsed.data.item.id,
            plate: parsed.data.item.normalizedPlate,
            ownerName: parsed.data.item.customerName,
            ownerId: parsed.data.item.customerId,
          });
          return;
        }

        onSaved({ message: `Kendaraan ${parsed.data.item.normalizedPlate} dibuat.` });
        return;
      }

      const target = vehicle!;
      const input: UpdateVehicleRequest = {};
      if (normalizePlate(plate) !== target.normalizedPlate) input.plate = plate.trim();
      if (brand.trim() !== target.brand) input.brand = brand.trim();
      if (model.trim() !== target.model) input.model = model.trim();

      const nextYear = year.trim().length > 0 ? Number(year) : null;
      if (nextYear !== target.year) input.year = nextYear;
      const nextColor = color.trim().length > 0 ? color.trim() : null;
      if (nextColor !== target.color) input.color = nextColor;
      const nextOdometer = odometer.trim().length > 0 ? Number(odometer) : null;
      if (nextOdometer !== target.odometer) input.odometer = nextOdometer;
      const nextVin = vin.trim().length > 0 ? vin.trim().toUpperCase() : null;
      if (nextVin !== target.vin) input.vin = nextVin;
      const nextNotes = notes.trim().length > 0 ? notes.trim() : null;
      if (nextNotes !== target.notes) input.notes = nextNotes;
      if (customer!.id !== target.customerId) input.customerId = customer!.id;

      if (Object.keys(input).length === 0) {
        onSaved({ message: `Tidak ada perubahan pada ${target.normalizedPlate}.` });
        return;
      }

      const response = await fetch(`/api/v1/vehicles/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      onSaved({ message: `Kendaraan ${normalizePlate(plate)} diperbarui.` });
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  const plateError = fieldError(error, "plate") ?? localErrors.plate;
  const brandError = fieldError(error, "brand") ?? localErrors.brand;
  const modelError = fieldError(error, "model") ?? localErrors.model;
  const yearError = fieldError(error, "year") ?? localErrors.year;
  const odometerError = fieldError(error, "odometer") ?? localErrors.odometer;
  const vinError = fieldError(error, "vin") ?? localErrors.vin;
  const notesError = fieldError(error, "notes") ?? localErrors.notes;
  const customerError = fieldError(error, "customerId") ?? localErrors.customerId;

  return (
    <>
      <form onSubmit={submit} onInput={markDirty} noValidate>
        <div className="bo-dialog__body">
          <ValidationSummary prefix={idPrefix} error={error} />
          {reused ? (
            <VehicleReuseNotice
              vehicleId={reused.vehicleId}
              plate={reused.plate}
              ownerName={reused.ownerName}
              selectedCustomerName={customer?.name ?? "—"}
              differentOwner={customer !== null && customer.id !== reused.ownerId}
              onOpen={guardNavigation}
            />
          ) : null}

        <div className="bo-form-grid">
          <Field
            label="Nomor polisi"
            htmlFor={`${idPrefix}-plate`}
            required
            error={plateError}
            hint={plateHint}
          >
            <Input
              id={`${idPrefix}-plate`}
              className="bo-mono"
              value={plate}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(event) => {
                setPlate(event.currentTarget.value.toUpperCase());
                setReused(null);
                clearLocalError("plate");
              }}
              onBlur={() => {
                const message = plateValidationMessage(plate);
                if (!message) {
                  clearLocalError("plate");
                  return;
                }
                setLocalErrors((current) => ({ ...current, plate: message }));
              }}
              aria-invalid={Boolean(plateError) || undefined}
              aria-describedby={plateError ? `${idPrefix}-plate-error` : `${idPrefix}-plate-hint`}
            />
          </Field>

          <Field label="Merek" htmlFor={`${idPrefix}-brand`} required error={brandError}>
            <Input
              id={`${idPrefix}-brand`}
              value={brand}
              autoComplete="off"
              onChange={(event) => {
                setBrand(event.currentTarget.value);
                clearLocalError("brand");
              }}
              aria-invalid={Boolean(brandError) || undefined}
              aria-describedby={brandError ? `${idPrefix}-brand-error` : undefined}
            />
          </Field>

          <Field label="Model" htmlFor={`${idPrefix}-model`} required error={modelError}>
            <Input
              id={`${idPrefix}-model`}
              value={model}
              autoComplete="off"
              onChange={(event) => {
                setModel(event.currentTarget.value);
                clearLocalError("model");
              }}
              aria-invalid={Boolean(modelError) || undefined}
              aria-describedby={modelError ? `${idPrefix}-model-error` : undefined}
            />
          </Field>

          <Field label="Tahun (opsional)" htmlFor={`${idPrefix}-year`} error={yearError}>
            <Input
              id={`${idPrefix}-year`}
              value={year}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => {
                setYear(event.currentTarget.value);
                clearLocalError("year");
              }}
              aria-invalid={Boolean(yearError) || undefined}
              aria-describedby={yearError ? `${idPrefix}-year-error` : undefined}
            />
          </Field>

          <Field label="Warna (opsional)" htmlFor={`${idPrefix}-color`}>
            <Input
              id={`${idPrefix}-color`}
              value={color}
              autoComplete="off"
              onChange={(event) => {
                setColor(event.currentTarget.value);
              }}
            />
          </Field>

          <Field
            label="Odometer (km, opsional)"
            htmlFor={`${idPrefix}-odometer`}
            error={odometerError}
            hint="Angka saat kendaraan masuk, tanpa titik."
          >
            <Input
              id={`${idPrefix}-odometer`}
              value={odometer}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => {
                setOdometer(event.currentTarget.value);
                clearLocalError("odometer");
              }}
              aria-invalid={Boolean(odometerError) || undefined}
              aria-describedby={
                odometerError ? `${idPrefix}-odometer-error` : `${idPrefix}-odometer-hint`
              }
            />
          </Field>

          <Field label="Nomor rangka (opsional)" htmlFor={`${idPrefix}-vin`} error={vinError}>
            <Input
              id={`${idPrefix}-vin`}
              className="bo-mono"
              value={vin}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setVin(event.currentTarget.value.toUpperCase());
                clearLocalError("vin");
              }}
              aria-invalid={Boolean(vinError) || undefined}
              aria-describedby={vinError ? `${idPrefix}-vin-error` : undefined}
            />
          </Field>
        </div>

        <CustomerPicker
          idPrefix={idPrefix}
          value={customer}
          error={customerError}
          disabled={pending}
          onCreateCustomer={() => {
            guardNavigation("/customers");
          }}
          onChange={(picked) => {
            setCustomer(picked);
            markDirty();
            clearLocalError("customerId");
          }}
        />

        <Field
          label="Catatan (opsional)"
          htmlFor={`${idPrefix}-notes`}
          error={notesError}
          hint={NOTES_HINT}
        >
          <Textarea
            id={`${idPrefix}-notes`}
            value={notes}
            onChange={(event) => {
              setNotes(event.currentTarget.value);
              clearLocalError("notes");
            }}
            aria-invalid={Boolean(notesError) || undefined}
            aria-describedby={notesError ? `${idPrefix}-notes-error` : `${idPrefix}-notes-hint`}
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
          aria-describedby={disabledReason ? `${idPrefix}-requirements` : undefined}
        >
          {pending ? "Menyimpan…" : mode === "create" ? "Simpan kendaraan" : "Simpan perubahan"}
        </Button>
      </DialogFooter>
      {disabledReason ? (
        <p className="bo-field__hint bo-form-hint" id={`${idPrefix}-requirements`}>
          {disabledReason}
        </p>
      ) : null}
      </form>

      <DiscardDialog
        open={pendingHref !== null}
        onKeep={() => {
          setPendingHref(null);
        }}
        onDiscard={() => {
          const href = pendingHref;
          setPendingHref(null);
          setDirty(false);
          if (href) router.push(href);
        }}
      />
    </>
  );
}
