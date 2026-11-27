import { isAuthError } from "@workshop-pos/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { z } from "zod";

import { EmptyState, ErrorState } from "@/components/back-office/state-block";
import { getAuthRuntime, requirePageAuthContext } from "@/lib/auth/server";
import { getReceiptDocument } from "@/lib/receipt-service";

import { PrintSheet } from "./print-sheet";
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

/**
 * Browser-print fallback (AC17.2). Rendering is read-only; the print count and
 * audit row are written only when the operator presses "Cetak via browser".
 */
export default async function PrintReceiptPage({ params, searchParams }: PrintPageProps) {
  const { id } = await params;
  const query = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const documentKind = firstValue(query.doc) === "estimate" ? "ESTIMATE" : "RECEIPT";
  const authContext = await requirePageAuthContext();
  const db = getAuthRuntime().db;

  let receipt: Awaited<ReturnType<typeof getReceiptDocument>>;
  try {
    receipt = await getReceiptDocument(db, authContext, id, documentKind);
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
                href={`/print/receipt/${id}${documentKind === "ESTIMATE" ? "?doc=estimate" : ""}`}
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

  const docQuery = documentKind === "ESTIMATE" ? "?doc=estimate" : "";

  return (
    <main className={styles.sheet}>
      <style>{`@page { size: ${receipt.paperWidth}mm auto; margin: 4mm; }`}</style>
      <PrintSheet
        initial={receipt}
        backHref={`/orders/${id}`}
        retryHref={`/print/receipt/${id}${docQuery}`}
        documentKind={documentKind}
      />
    </main>
  );
}
