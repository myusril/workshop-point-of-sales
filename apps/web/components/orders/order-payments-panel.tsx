"use client";

import {
  PAYMENT_METHODS,
  type OrderDetail,
  type OrderPayment,
  type PaymentMethod,
  type RecordPaymentResponse,
} from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError } from "@/components/auth/api-error";
import { Field } from "@/components/back-office/field";
import { StatusToast } from "@/components/back-office/status-toast";
import { PaymentForm } from "@/components/payments/payment-form";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatIdr, formatWibDateTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/order-labels";

interface PaymentPanelProps {
  order: OrderDetail;
}

interface CorrectionState {
  payment: OrderPayment;
  mode: "edit" | "delete";
}

/**
 * Payment rows plus the pre-`PAID` correction path (FR-048, D-11). Once the
 * order is paid the buttons disappear; only the whole-order void remains.
 */
export function OrderPaymentsPanel({ order }: PaymentPanelProps) {
  const router = useRouter();
  const [payOpen, setPayOpen] = useState(false);
  const [correction, setCorrection] = useState<CorrectionState | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function openCorrection(payment: OrderPayment, mode: "edit" | "delete") {
    setCorrection({ payment, mode });
    setAmount(payment.amount);
    setMethod(payment.method);
    setReference(payment.referenceNote ?? "");
    setReason("");
    setError(null);
  }

  async function submitCorrection() {
    if (!correction) return;
    if (reason.trim().length < 3) {
      setError("Alasan koreksi minimal 3 karakter.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response =
        correction.mode === "delete"
          ? await fetch(`/api/v1/payments/${correction.payment.id}`, {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ reason: reason.trim() }),
            })
          : await fetch(`/api/v1/payments/${correction.payment.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                amount: amount.replace(/[^\d]/g, ""),
                method,
                referenceNote: reference.trim() ? reference.trim() : null,
                reason: reason.trim(),
              }),
            });

      if (!response.ok) {
        const failure = await readApiError(response);
        setError(failure.message);
        return;
      }

      setCorrection(null);
      setMessage(
        correction.mode === "delete" ? "Pembayaran dihapus." : "Pembayaran dikoreksi.",
      );
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="bo-panel" aria-label="Pembayaran">
      <div className="bo-panel__header">
        <h2 className="bo-panel__title">Pembayaran</h2>
        {order.permissions.canRecordPayment ? (
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setPayOpen(true);
            }}
          >
            Catat pembayaran
          </Button>
        ) : null}
      </div>
      <div className="bo-panel__body bo-panel__body--flush">
        {order.payments.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Belum ada pembayaran.</p>
        ) : (
          <ul className="flex flex-col" aria-label="Pembayaran transaksi">
            {order.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-col gap-2 border-b border-line-subtle p-4 last:border-b-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {PAYMENT_METHOD_LABELS[payment.method]}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatIdr(payment.amount)}
                  </span>
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
                  <span>{payment.referenceNote ?? "Tanpa referensi"}</span>
                  <span>Kembalian {formatIdr(payment.changeAmount)}</span>
                  <span>
                    {payment.createdByName} · {formatWibDateTime(payment.receivedAt)}
                  </span>
                </div>
                {order.permissions.canCorrectPayment ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        openCorrection(payment, "edit");
                      }}
                    >
                      Koreksi
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        openCorrection(payment, "delete");
                      }}
                    >
                      Hapus
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {order.refunds.length > 0 ? (
          <div className="border-t border-line p-4">
            <h3 className="text-sm font-semibold">Pengembalian dana</h3>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {order.refunds.map((refund) => (
                <li key={refund.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {PAYMENT_METHOD_LABELS[refund.method]} · {formatWibDateTime(refund.refundedAt)}
                  </span>
                  <span className="tabular-nums">{formatIdr(refund.amount)}</span>
                  <span className="w-full text-ink-muted">Alasan: {refund.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent aria-describedby="record-payment-description">
          <DialogHeader>
            <DialogTitle>Catat pembayaran</DialogTitle>
            <DialogDescription id="record-payment-description">
              Pembayaran mengurangi sisa tagihan. Tunai di atas sisa dicatat sebagai kembalian.
            </DialogDescription>
          </DialogHeader>
          <PaymentForm
            orderId={order.id}
            total={order.total}
            balanceDue={order.balanceDue}
            disabledReason={
              order.balanceDue === "0" ? "Tidak ada tagihan." : undefined
            }
            onRecorded={(response: RecordPaymentResponse) => {
              setPayOpen(false);
              setMessage(
                BigInt(response.payment.changeAmount) > 0n
                  ? `Pembayaran berhasil. Kembalian ${formatIdr(response.payment.changeAmount)}.`
                  : "Pembayaran berhasil.",
              );
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={correction !== null}
        onOpenChange={(open) => {
          if (!open) setCorrection(null);
        }}
      >
        <DialogContent aria-describedby="payment-correction-description">
          <DialogHeader>
            <DialogTitle>
              {correction
                ? `${correction.mode === "delete" ? "Hapus" : "Koreksi"} pembayaran ${
                    PAYMENT_METHOD_LABELS[correction.payment.method]
                  } ${formatIdr(correction.payment.amount)}?`
                : "Pembayaran"}
            </DialogTitle>
            <DialogDescription id="payment-correction-description">
              {correction?.mode === "delete"
                ? "Baris pembayaran dihapus sebelum transaksi dibayar. Tindakan ini tercatat di audit."
                : "Perubahan nilai, metode, dan referensi tercatat di audit sebelum dan sesudahnya."}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="bo-alert bo-alert--danger" role="alert">
              {error}
            </p>
          ) : null}

          {correction?.mode === "edit" ? (
            <div className="flex flex-col gap-3">
              <Field label="Metode" htmlFor="correction-method" required>
                <select
                  id="correction-method"
                  className="bo-select"
                  value={method}
                  onChange={(event) => {
                    setMethod(event.target.value as PaymentMethod);
                  }}
                >
                  {PAYMENT_METHODS.map((option) => (
                    <option key={option} value={option}>
                      {PAYMENT_METHOD_LABELS[option]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Jumlah" htmlFor="correction-amount" required>
                <Input
                  id="correction-amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value.replace(/[^\d]/g, ""));
                  }}
                />
              </Field>
              <Field label="Referensi" htmlFor="correction-reference">
                <Input
                  id="correction-reference"
                  value={reference}
                  maxLength={64}
                  onChange={(event) => {
                    setReference(event.target.value);
                  }}
                />
              </Field>
            </div>
          ) : null}

          <Field label="Alasan" htmlFor="correction-reason" required hint="Minimal 3 karakter.">
            <Textarea
              id="correction-reason"
              value={reason}
              maxLength={300}
              onChange={(event) => {
                setReason(event.target.value);
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
              variant={correction?.mode === "delete" ? "danger" : "primary"}
              disabled={pending}
              aria-busy={pending}
              onClick={() => {
                void submitCorrection();
              }}
            >
              {pending
                ? "Menyimpan…"
                : correction?.mode === "delete"
                  ? "Hapus pembayaran"
                  : "Simpan koreksi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {message ? <StatusToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </section>
  );
}
