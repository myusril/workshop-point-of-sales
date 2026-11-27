"use client";

import {
  receiptResponseSchema,
  type ReceiptDocumentKind,
} from "@workshop-pos/contracts";
import { useState } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError } from "@/components/auth/api-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { ReceiptPreview } from "./receipt-preview";

interface ReceiptPreviewDialogProps {
  orderId: string;
  documentKind?: ReceiptDocumentKind;
  label?: string;
  variant?: "primary" | "secondary";
}

/**
 * Read-only preview. Opening it never increments the print count; the print
 * page records the print, so only an actual print attempt becomes a "SALINAN".
 */
export function ReceiptPreviewDialog({
  orderId,
  documentKind = "RECEIPT",
  label = "Pratinjau struk",
  variant = "secondary",
}: ReceiptPreviewDialogProps) {
  const [open, setOpen] = useState(false);
  const [paper, setPaper] = useState<{
    title: string;
    rows: string[];
    paperWidth: 58 | 80;
    orderNumber: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setPaper(null);
    setMessage(null);
    try {
      const query = documentKind === "ESTIMATE" ? "?doc=estimate" : "";
      const response = await fetch(`/api/v1/receipts/${orderId}${query}`, { cache: "no-store" });
      if (!response.ok) {
        const error = await readApiError(response);
        setMessage(error.message);
        return;
      }
      const parsed = receiptResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        setMessage("Struk gagal dibaca. Coba lagi.");
        return;
      }
      setPaper({
        title: parsed.data.item.title,
        rows: parsed.data.item.rows,
        paperWidth: parsed.data.item.paperWidth,
        orderNumber: parsed.data.item.orderNumber,
      });
    } catch {
      setMessage(NETWORK_ERROR_MESSAGE);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={variant}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby="receipt-preview-description">
        <DialogHeader>
          <DialogTitle>Pratinjau {documentKind === "ESTIMATE" ? "estimasi" : "struk"}</DialogTitle>
          <DialogDescription id="receipt-preview-description">
            Isi pratinjau sama dengan hasil cetak pada lebar kertas outlet.
          </DialogDescription>
        </DialogHeader>
        {message ? (
          <div className="flex flex-col gap-2">
            <p className="bo-alert bo-alert--danger" role="alert">
              {message}
            </p>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Coba lagi
            </Button>
          </div>
        ) : null}
        {paper ? (
          <ReceiptPreview document={paper} />
        ) : message ? null : (
          <p role="status" className="text-sm text-ink-muted">
            Memuat pratinjau…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
