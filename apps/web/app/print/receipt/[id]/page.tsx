import { isAuthError } from "@workshop-pos/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { z } from "zod";

import { EmptyState, ErrorState } from "@/components/back-office/state-block";
import { ReceiptPreview } from "@/components/receipts/receipt-preview";
import { getAuthRuntime, requirePageAuthContext } from "@/lib/auth/server";
import { getReceiptDocument, printReceiptDocument } from "@/lib/receipt-service";

import { PrintButton } from "./print-button";
import styles from "./print.module.css";

export const metadata: Metadata = {
  title: "Cetak struk — Workshop POS",
};

export const dynamic = "force-dynamic";

interface PrintPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function PrintReceiptPage({ params, searchParams }: PrintPageProps) {
  const { id } = await params;
  const query = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const documentKind = firstValue(query.doc) === "estimate" ? "ESTIMATE" : "RECEIPT";
  const shouldPrint = firstValue(query.print) === "1";
  const authContext = await requirePageAuthContext();
  const db = getAuthRuntime().db;

  let receipt: Awaited<ReturnType<typeof getReceiptDocument>>;
  try {
    receipt = shouldPrint
      ? await printReceiptDocument(db, authContext, id, documentKind)
      : await getReceiptDocument(db, authContext, id, documentKind);
  } catch (error) {
    if (isAuthError(error)) {
      if (error.status === 403) forbidden();
      if (error.status === 404) notFound();
      if (error.code === "CONFLICT") {
        return (
          <main className={styles.sheet}>
            <div className={styles.toolbar}>
              <Link className={styles.back} href={`/orders/${id}`}>
                Kembali ke transaksi
              </Link>
            </div>
            <EmptyState title={error.message}>
              <p>Struk tersedia setelah transaksi lunas. Estimasi dapat dicetak sebelum pembayaran.</p>
            </EmptyState>
          </main>
        );
      }
      return (
        <main className={styles.sheet}>
          <div className={styles.toolbar}>
            <Link className={styles.back} href={`/orders/${id}`}>
              Kembali ke transaksi
            </Link>
          </div>
          <ErrorState
            title="Dokumen tidak dapat dicetak."
            actions={
              <Link
                className={styles.back}
                href={`/print/receipt/${id}${firstValue(query.doc) === "estimate" ? "?doc=estimate" : ""}`}
              >
                Coba lagi
              </Link>
            }
          >
            <p>{error.message}</p>
          </ErrorState>
        </main>
      );
    }
    throw error;
  }

  const title = receipt.documentKind === "ESTIMATE" ? "Estimasi" : "Struk";
  const docQuery = receipt.documentKind === "ESTIMATE" ? "?doc=estimate" : "";
  const retryHref = `/print/receipt/${id}${docQuery}${shouldPrint ? (docQuery ? "&print=1" : "?print=1") : ""}`;

  return (
    <main className={styles.sheet}>
      {/* The browser fallback can ask for the outlet's paper width instead of A4. */}
      <style>{`@page { size: ${receipt.paperWidth}mm auto; margin: 4mm; }`}</style>

      <div className={styles.toolbar}>
        <Link className={styles.back} href={`/orders/${id}`}>
          Kembali ke transaksi
        </Link>
        <div className={styles.actions}>
          <PrintButton auto={shouldPrint} />
          <Link className={styles.back} href={retryHref}>
            Muat ulang pratinjau
          </Link>
        </div>
      </div>

      <h1 className={styles.title}>
        {title} {receipt.orderNumber}
      </h1>
      <p className={styles.hint}>
        {receipt.outletName} · template {receipt.paperWidth} mm ({receipt.columns} kolom).
        {receipt.isVoided ? " Dokumen ini sudah dibatalkan dan diberi cap DIBATALKAN." : ""}
        {receipt.isReprint ? " Salinan dari struk yang sudah pernah dicetak." : ""}
      </p>

      <ReceiptPreview document={receipt} />
    </main>
  );
}
