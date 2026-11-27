"use client";

import type { OrderDetail, OrderTechnician } from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError } from "@/components/auth/api-error";
import { Field } from "@/components/back-office/field";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface OrderHeaderEditProps {
  order: OrderDetail;
  technicians: OrderTechnician[];
}

/**
 * Header editing for an editable order (FR-044, FR-045): technician, odometer,
 * notes, and an optional replacement of the order-level discount. Figures are
 * recomputed by the server; this dialog only sends intent.
 */
export function OrderHeaderEdit({ order, technicians }: OrderHeaderEditProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [technicianId, setTechnicianId] = useState(order.technician?.id ?? "");
  const [odometer, setOdometer] = useState(order.odometer === null ? "" : String(order.odometer));
  const [notes, setNotes] = useState(order.notes ?? "");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/orders/${order.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          technicianId: technicianId || null,
          odometer: odometer.trim() ? Number(odometer) : null,
          notes: notes.trim() ? notes.trim() : null,
          ...(discountPercent.trim()
            ? { discountPercent: Number(discountPercent) }
            : {}),
          ...(discountReason.trim() ? { discountReason: discountReason.trim() } : {}),
        }),
      });
      if (!response.ok) {
        const failure = await readApiError(response);
        setError(failure.message);
        return;
      }
      setOpen(false);
      setMessage("Informasi transaksi diperbarui.");
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="secondary">
            Ubah info transaksi
          </Button>
        </DialogTrigger>
        <DialogContent aria-describedby="order-edit-description">
          <DialogHeader>
            <DialogTitle>Ubah info transaksi</DialogTitle>
            <DialogDescription id="order-edit-description">
              Teknisi, odometer, catatan, dan diskon transaksi. Total dihitung ulang oleh server.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="bo-alert bo-alert--danger" role="alert">
              {error}
            </p>
          ) : null}

          <Field label="Teknisi" htmlFor="edit-technician">
            <select
              id="edit-technician"
              className="bo-select"
              value={technicianId}
              onChange={(event) => {
                setTechnicianId(event.target.value);
              }}
            >
              <option value="">Belum ditentukan</option>
              {technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Odometer" htmlFor="edit-odometer">
            <Input
              id="edit-odometer"
              type="number"
              min={0}
              step={1}
              value={odometer}
              onChange={(event) => {
                setOdometer(event.target.value);
              }}
            />
          </Field>

          <Field
            label="Diskon transaksi (%)"
            htmlFor="edit-discount"
            hint="Kosongkan untuk mempertahankan diskon saat ini."
          >
            <Input
              id="edit-discount"
              type="number"
              min={0}
              max={100}
              step={1}
              value={discountPercent}
              onChange={(event) => {
                setDiscountPercent(event.target.value);
              }}
            />
          </Field>

          <Field
            label="Alasan diskon"
            htmlFor="edit-discount-reason"
            hint="Wajib bila diskon melebihi batas kasir."
          >
            <Input
              id="edit-discount-reason"
              value={discountReason}
              maxLength={200}
              onChange={(event) => {
                setDiscountReason(event.target.value);
              }}
            />
          </Field>

          <Field label="Catatan" htmlFor="edit-notes">
            <Textarea
              id="edit-notes"
              value={notes}
              maxLength={500}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Batal
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              aria-busy={pending}
              onClick={() => {
                void submit();
              }}
            >
              {pending ? "Menyimpan…" : "Simpan perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {message ? <StatusToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </>
  );
}
