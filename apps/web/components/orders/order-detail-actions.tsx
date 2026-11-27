"use client";

import type { OrderDetail } from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError } from "@/components/auth/api-error";
import { Field } from "@/components/back-office/field";
import { StatusToast } from "@/components/back-office/status-toast";
import { ReceiptPreviewDialog } from "@/components/receipts/receipt-preview-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { formatIdr } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/order-labels";

interface OrderDetailActionsProps {
  order: OrderDetail;
}

type TransitionTarget = "ESTIMATED" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" | "DRAFT";

/**
 * Lifecycle and document actions. Which button exists comes from the server's
 * `permissions`, and the server enforces the same rules again (BR-007, BR-008).
 */
export function OrderDetailActions({ order }: OrderDetailActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [revertOpen, setRevertOpen] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  async function transition(to: TransitionTarget, reason?: string, key: string = to) {
    setPending(key);
    setError(null);
    try {
      const response = await fetch(`/api/v1/orders/${order.id}/transitions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, ...(reason ? { reason } : {}) }),
      });
      if (!response.ok) {
        const failure = await readApiError(response);
        setError(failure.message);
        return;
      }
      setRevertOpen(false);
      setRevertReason("");
      setMessage("Status transaksi diperbarui.");
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(null);
    }
  }

  async function submitVoid() {
    setPending("void");
    setError(null);
    try {
      const response = await fetch(`/api/v1/orders/${order.id}/void`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: voidReason }),
      });
      if (!response.ok) {
        const failure = await readApiError(response);
        setError(failure.message);
        return;
      }
      setVoidOpen(false);
      setVoidReason("");
      setMessage("Transaksi dibatalkan.");
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(null);
    }
  }

  const hasProductLine = order.lines.some((line) => line.lineType === "PRODUCT");
  const stockWillReverse =
    hasProductLine && (order.status === "COMPLETED" || order.status === "PAID");

  const refundsByMethod = order.payments.reduce<Record<string, bigint>>((totals, payment) => {
    totals[payment.method] = (totals[payment.method] ?? 0n) + BigInt(payment.amount);
    return totals;
  }, {});

  const hasTransition =
    order.permissions.canIssueEstimate ||
    order.permissions.canApprove ||
    order.permissions.canRevertEstimate ||
    order.permissions.canStartWork ||
    order.permissions.canComplete;

  if (!hasTransition && !order.permissions.canVoid && !order.permissions.canPrintReceipt && !order.permissions.canPrintEstimate) {
    return null;
  }

  return (
    <section className="bo-panel" aria-label="Tindakan transaksi">
      <div className="bo-panel__header">
        <h2 className="bo-panel__title">Tindakan</h2>
      </div>
      <div className="bo-panel__body flex flex-col gap-3">
        {error ? (
          <p className="bo-alert bo-alert--danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {order.permissions.canIssueEstimate ? (
            <Button
              type="button"
              variant="primary"
              disabled={pending !== null}
              onClick={() => {
                void transition("ESTIMATED");
              }}
            >
              Terbitkan estimasi
            </Button>
          ) : null}
          {order.permissions.canApprove ? (
            <Button
              type="button"
              variant="primary"
              disabled={pending !== null}
              onClick={() => {
                void transition("APPROVED");
              }}
            >
              Catat persetujuan
            </Button>
          ) : null}
          {order.permissions.canRevertEstimate ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending !== null}
              onClick={() => {
                setRevertOpen(true);
              }}
            >
              Kembalikan ke draf
            </Button>
          ) : null}
          {order.permissions.canStartWork ? (
            <Button
              type="button"
              variant="primary"
              disabled={pending !== null}
              onClick={() => {
                void transition("IN_PROGRESS");
              }}
            >
              Mulai kerja
            </Button>
          ) : null}
          {order.permissions.canComplete ? (
            <Button
              type="button"
              variant="primary"
              disabled={pending !== null}
              onClick={() => {
                void transition("COMPLETED");
              }}
            >
              {pending === "COMPLETED" ? "Menyelesaikan…" : "Selesaikan pekerjaan"}
            </Button>
          ) : null}
          {order.permissions.canPrintEstimate ? (
            <ReceiptPreviewDialog
              orderId={order.id}
              documentKind="ESTIMATE"
              label="Pratinjau estimasi"
            />
          ) : null}
          {order.permissions.canPrintReceipt ? (
            <>
              <ReceiptPreviewDialog orderId={order.id} label="Pratinjau struk" />
              <Button
                asChild
                variant={order.status === "PAID" || order.status === "VOID" ? "primary" : "secondary"}
              >
                <a
                  href={`/print/receipt/${order.id}?print=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Cetak struk
                </a>
              </Button>
            </>
          ) : null}
        </div>

        {order.permissions.canVoid ? (
          <div className="border-t border-line pt-3">
            <Button
              type="button"
              variant="danger"
              disabled={pending !== null}
              onClick={() => {
                setVoidOpen(true);
              }}
            >
              Batalkan transaksi
            </Button>
          </div>
        ) : order.status === "PAID" ? (
          <p className="border-t border-line pt-3 text-sm text-ink-muted">
            Hanya Pemilik yang dapat membatalkan transaksi yang sudah dibayar.
          </p>
        ) : null}
      </div>

      <Dialog open={revertOpen} onOpenChange={setRevertOpen}>
        <DialogContent aria-describedby="revert-estimate-description">
          <DialogHeader>
            <DialogTitle>Kembalikan estimasi ke draf</DialogTitle>
            <DialogDescription id="revert-estimate-description">
              Transaksi kembali ke draf agar baris dan harga dapat diubah. Tindakan ini dicatat di
              audit bersama alasannya.
            </DialogDescription>
          </DialogHeader>
          <Field label="Alasan" htmlFor="revert-reason" required hint="Minimal 3 karakter.">
            <Textarea
              id="revert-reason"
              value={revertReason}
              maxLength={300}
              onChange={(event) => {
                setRevertReason(event.target.value);
              }}
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" autoFocus>
                Batal
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="primary"
              disabled={pending !== null}
              onClick={() => {
                void transition("DRAFT", revertReason.trim(), "revert");
              }}
            >
              {pending === "revert" ? "Menyimpan…" : "Kembalikan ke draf"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent aria-describedby="void-description">
          <DialogHeader>
            <DialogTitle>Batalkan transaksi?</DialogTitle>
            <DialogDescription id="void-description">
              Transaksi tetap tersimpan di riwayat dan tidak dapat dipulihkan.
            </DialogDescription>
          </DialogHeader>

          <div className="bo-alert bo-alert--warning flex flex-col gap-2" role="status">
            <p className="font-semibold">Dampak pembatalan</p>
            {order.payments.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {Object.entries(refundsByMethod).map(([method, amount]) => (
                  <li key={method}>
                    Pengembalian dana {PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method}:{" "}
                    {formatIdr(amount)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Belum ada pembayaran yang perlu dikembalikan.</p>
            )}
            <p>
              {stockWillReverse
                ? "Stok spare part yang sudah dikurangi akan dikembalikan."
                : "Tidak ada stok yang perlu dikembalikan."}
            </p>
          </div>

          <Field
            label="Alasan pembatalan"
            htmlFor="void-reason"
            required
            hint={`Minimal ${order.settings.voidReasonMinLength} karakter.`}
          >
            <Textarea
              id="void-reason"
              value={voidReason}
              maxLength={500}
              onChange={(event) => {
                setVoidReason(event.target.value);
              }}
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" autoFocus>
                Kembali
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              disabled={pending !== null}
              onClick={() => {
                void submitVoid();
              }}
            >
              {pending === "void" ? "Membatalkan…" : "Batalkan transaksi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {message ? <StatusToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </section>
  );
}
