"use client";

import { receiptResponseSchema, type ReceiptDocument } from "@workshop-pos/contracts";
import Link from "next/link";
import { useState } from "react";

import {
  NETWORK_ERROR_MESSAGE,
  readApiError,
} from "@/components/auth/api-error";
import { ReceiptPreview } from "@/components/receipts/receipt-preview";
import { Button } from "@/components/ui/button";

import styles from "./print.module.css";

interface PrintSheetProps {
  initial: ReceiptDocument;
  backHref: string;
  retryHref: string;
  documentKind: "RECEIPT" | "ESTIMATE";
}

/**
 * Side-effect-free preview until the operator asks to print. The print action
 * records the attempt on the server, swaps in the returned document (so the
 * first print has no `SALINAN` and a repeat does), then opens the browser
 * dialog. Refreshing this page never increments the count.
 */
export function PrintSheet({
  initial,
  backHref,
  retryHref,
  documentKind,
}: PrintSheetProps) {
  const [document, setDocument] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  async function print() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/receipts/${initial.orderId}/print`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          doc: documentKind === "ESTIMATE" ? "estimate" : "receipt",
        }),
      });

      if (!response.ok) {
        const failure = await readApiError(response);
        setMessage(failure.message);
        return;
      }

      const parsed = receiptResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        setMessage("Struk gagal dibaca. Coba lagi.");
        return;
      }

      setDocument(parsed.data.item);
      setAttempted(true);
      window.print();
    } catch {
      setMessage(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className={styles.toolbar}>
        <Link className={styles.back} href={backHref}>
          Kembali ke transaksi
        </Link>
        <div className={styles.actions}>
          <Button
            type="button"
            variant="primary"
            disabled={pending}
            aria-busy={pending}
            onClick={() => {
              void print();
            }}
          >
            {pending ? "Menyiapkan…" : "Cetak via browser"}
          </Button>
          <Link className={styles.back} href={retryHref}>
            Muat ulang pratinjau
          </Link>
        </div>
      </div>

      {message ? (
        <p className={styles.hint} role="alert">
          {message} Jika masalah berlanjut, ulangi atau pilih &ldquo;Simpan sebagai PDF&rdquo; di
          dialog cetak.
        </p>
      ) : null}

      <h1 className={styles.title}>
        {document.title} {document.orderNumber}
      </h1>
      <p className={styles.hint}>
        {document.outletName} · template {document.paperWidth} mm ({document.columns} kolom).
        {document.isVoided ? " Dokumen ini sudah dibatalkan dan diberi cap DIBATALKAN." : ""}
        {document.isReprint ? " Salinan dari struk yang sudah pernah dicetak." : ""}
      </p>

      {attempted ? (
        <p className={styles.hint} role="status">
          Perintah cetak dikirim ke browser. Jika tidak ada halaman tercetak, ulangi atau pilih
          &ldquo;Simpan sebagai PDF&rdquo; di dialog cetak.
        </p>
      ) : null}

      <ReceiptPreview document={document} />
    </>
  );
}
