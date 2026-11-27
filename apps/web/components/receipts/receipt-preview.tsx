import styles from "./receipt.module.css";

/** The fields the paper needs; a full receipt document is assignable. */
export interface ReceiptPaper {
  paperWidth: 58 | 80;
  rows: string[];
  title: string;
  orderNumber: string;
}

interface ReceiptPreviewProps {
  document: ReceiptPaper;
  /** Print pages hide the shadow; the paper stays white in dark mode. */
  plain?: boolean;
}

/**
 * Paper-white monospace preview (FR-040, state matrix §2.5). The rows come from
 * the core template already wrapped to the configured width, so the preview,
 * the browser print page, and a reprint show identical content.
 */
export function ReceiptPreview({ document, plain = false }: ReceiptPreviewProps) {
  return (
    <section
      className={styles.frame}
      aria-label={`Pratinjau ${document.title.toLowerCase()}${document.orderNumber ? ` ${document.orderNumber}` : ""}`}
    >
      <pre
        className={[
          styles.paper,
          document.paperWidth === 80 ? styles.paper80 : styles.paper58,
          plain ? styles.plain : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {document.rows.join("\n")}
      </pre>
    </section>
  );
}
