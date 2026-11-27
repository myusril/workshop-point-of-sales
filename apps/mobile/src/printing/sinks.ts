import type { ReceiptTemplate } from "@workshop-pos/core";
import { File } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { encodeEscPos } from "./escpos";
import { receiptToText } from "./receipt";
import { prepareReceiptDirectory } from "./receipt-files";

/**
 * Receipt output channels (FR-040, DESIGN §7.6).
 *
 * Thermal printing sits behind `PrinterTransport` because the native ESC/POS
 * adapter is a REVIEW dependency (Epson SDK terms) until a hardware pilot
 * approves it. The shipped build always has a no-internet fallback: share the
 * monospace document or save it as a PDF. The layout and ESC/POS bytes are the
 * same for a 58 mm and an 80 mm outlet; only the column count changes.
 */

export class PrinterUnavailableError extends Error {
  constructor(message = "Printer tidak terhubung.") {
    super(message);
    this.name = "PrinterUnavailableError";
  }
}

export interface PrinterTransport {
  isAvailable(): Promise<boolean>;
  print(bytes: Uint8Array): Promise<void>;
}

export type ReceiptChannelId = "THERMAL" | "PDF" | "SHARE";

export interface ReceiptChannel {
  id: ReceiptChannelId;
  label: string;
  run(template: ReceiptTemplate, orderRef: string): Promise<void>;
}

function safeFileName(orderRef: string): string {
  const cleaned = orderRef.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "struk";
}

/** Paper-white document with the fixed column grid; identical text to preview. */
export function receiptHtml(template: ReceiptTemplate, paperWidth: 58 | 80): string {
  const rows = template.rows
    .map((row) =>
      row
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/ /g, "&nbsp;"),
    )
    .join("\n");
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${paperWidth}mm auto; margin: 4mm; }
  html, body { margin: 0; padding: 0; background: #ffffff; color: #000000; }
  pre {
    font-family: "Courier New", ui-monospace, monospace;
    font-size: ${paperWidth === 80 ? 11 : 10}pt;
    line-height: 1.25;
    white-space: pre;
    margin: 0;
  }
</style>
</head>
<body><pre>${rows}</pre></body>
</html>`;
}

export function createThermalChannel(transport?: PrinterTransport): ReceiptChannel {
  return {
    id: "THERMAL",
    label: "Cetak struk",
    async run(template) {
      if (!transport || !(await transport.isAvailable())) {
        throw new PrinterUnavailableError();
      }
      await transport.print(encodeEscPos(template));
    },
  };
}

export function createPdfChannel(): ReceiptChannel {
  return {
    id: "PDF",
    label: "Simpan PDF",
    async run(template, orderRef) {
      const result = await Print.printToFileAsync({
        html: receiptHtml(template, template.columns === 48 ? 80 : 58),
      });
      if (await Sharing.isAvailableAsync()) {
        try {
          await Sharing.shareAsync(result.uri, {
            mimeType: "application/pdf",
            dialogTitle: "Simpan atau bagikan struk",
            UTI: "com.adobe.pdf",
          });
        } finally {
          // The share sheet has copied what it needs; do not leave PII in cache.
          try {
            new File(result.uri).delete();
          } catch {
            // Already removed or unavailable; the sign-out sweep also covers it.
          }
        }
      }
    },
  };
}

export function createShareChannel(): ReceiptChannel {
  return {
    id: "SHARE",
    label: "Bagikan struk",
    async run(template, orderRef) {
      const file = new File(
        prepareReceiptDirectory(),
        `struk-${safeFileName(orderRef)}.txt`,
      );
      if (file.exists) file.delete();
      file.create({ overwrite: true });
      try {
        await file.write(receiptToText(template));
        if (!(await Sharing.isAvailableAsync())) {
          throw new PrinterUnavailableError(
            "Berbagi tidak tersedia di perangkat ini. Gunakan Simpan PDF.",
          );
        }
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/plain",
          dialogTitle: "Bagikan struk",
        });
      } finally {
        try {
          if (file.exists) file.delete();
        } catch {
          // Leave the sign-out sweep to remove it.
        }
      }
    },
  };
}

export function createReceiptChannels(transport?: PrinterTransport): ReceiptChannel[] {
  return [createThermalChannel(transport), createPdfChannel(), createShareChannel()];
}
