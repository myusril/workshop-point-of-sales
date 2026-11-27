"use client";

import {
  PAYMENT_METHODS,
  type PaymentMethod,
  type RecordPaymentResponse,
} from "@workshop-pos/contracts";
import { useRef, useState, type SubmitEvent } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError } from "@/components/auth/api-error";
import { Field } from "@/components/back-office/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIdr } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/order-labels";

interface PaymentFormProps {
  orderId: string;
  balanceDue: string;
  total: string;
  onRecorded: (response: RecordPaymentResponse) => void;
  disabledReason?: string;
}

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/**
 * One tender at a time (state matrix §2.4). The client never decides the
 * balance or change: the server recomputes both, and this form shows what it
 * stored. A disabled reason is visible text, not a tooltip.
 */
export function PaymentForm({
  orderId,
  balanceDue,
  total,
  onRecorded,
  disabledReason,
}: PaymentFormProps) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amount, setAmount] = useState(balanceDue);
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const disabled = pending || Boolean(disabledReason);

  const balance = BigInt(balanceDue);
  const tendered = BigInt(digitsOnly(amount) || "0");
  const applied = method === "CASH" && tendered > balance ? balance : tendered;
  const change = tendered - applied;
  const overNonCash = method !== "CASH" && tendered > balance;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = digitsOnly(amount);
    if (value.length === 0) {
      setFieldErrors({ amount: ["Jumlah pembayaran wajib diisi."] });
      setMessage(null);
      return;
    }

    setPending(true);
    setMessage(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/v1/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId,
          method,
          amount: value,
          referenceNote: reference.trim() ? reference.trim() : undefined,
          idempotencyKey: idempotencyKey.current,
        }),
      });

      if (!response.ok) {
        const error = await readApiError(response);
        setMessage(error.message);
        setFieldErrors(error.fieldErrors);
        return;
      }

      const parsed = (await response.json()) as RecordPaymentResponse;
      idempotencyKey.current = crypto.randomUUID();
      setAmount(digitsOnly(parsed.item.balanceDue));
      setReference("");
      onRecorded(parsed);
    } catch {
      setMessage(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-secondary">Total</dt>
          <dd>{formatIdr(total)}</dd>
        </div>
        <div className="flex justify-between gap-4 font-semibold">
          <dt>Sisa tagihan</dt>
          <dd className="tabular-nums">{formatIdr(balanceDue)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-secondary">Diterima</dt>
          <dd className="tabular-nums">{formatIdr(tendered)}</dd>
        </div>
        {applied !== tendered ? (
          <div className="flex justify-between gap-4">
            <dt className="text-ink-secondary">Diterapkan ke tagihan</dt>
            <dd className="tabular-nums">{formatIdr(applied)}</dd>
          </div>
        ) : null}
        {method === "CASH" && change > 0n ? (
          <div className="flex justify-between gap-4 font-semibold">
            <dt>Kembalian</dt>
            <dd className="tabular-nums">{formatIdr(change)}</dd>
          </div>
        ) : null}
      </dl>

      {overNonCash ? (
        <p className="bo-alert bo-alert--danger" role="alert">
          {method === "TRANSFER" ? "Transfer" : "QRIS"} tidak boleh melebihi sisa tagihan{" "}
          {formatIdr(balanceDue)}.
        </p>
      ) : null}

      {disabledReason ? (
        <p className="bo-alert bo-alert--warning" role="status">
          {disabledReason}
        </p>
      ) : null}

      {message ? (
        <p className="bo-alert bo-alert--danger" role="alert">
          {message}
        </p>
      ) : null}

      <Field label="Metode pembayaran" htmlFor="payment-method" required>
        <select
          id="payment-method"
          className="bo-select"
          value={method}
          disabled={disabled}
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

      <Field
        label="Jumlah diterima"
        htmlFor="payment-amount"
        required
        hint={
          method === "CASH"
            ? "Tunai di atas sisa tagihan dicatat sebagai kembalian."
            : "Tidak boleh melebihi sisa tagihan."
        }
        error={fieldErrors.amount?.[0]}
      >
        <Input
          id="payment-amount"
          inputMode="numeric"
          autoComplete="off"
          value={amount}
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors.amount)}
          aria-describedby={fieldErrors.amount ? "payment-amount-error" : "payment-amount-hint"}
          onChange={(event) => {
            setAmount(digitsOnly(event.target.value));
          }}
        />
      </Field>

      {method !== "CASH" ? (
        <Field
          label="Referensi"
          htmlFor="payment-reference"
          required
          hint="Nomor referensi transfer atau QRIS yang tercatat di rekening."
          error={fieldErrors.referenceNote?.[0]}
        >
          <Input
            id="payment-reference"
            value={reference}
            maxLength={64}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.referenceNote)}
            onChange={(event) => {
              setReference(event.target.value);
            }}
          />
        </Field>
      ) : null}

      <Button type="submit" variant="primary" disabled={disabled} aria-busy={pending}>
        {pending ? "Menyimpan pembayaran…" : `Bayar ${formatIdr(applied)}`}
      </Button>
    </form>
  );
}
