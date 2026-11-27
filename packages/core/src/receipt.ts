/**
 * Receipt and estimate template (FR-037, FR-040, FR-047, BR-008).
 *
 * A pure function of order data: 58 mm paper is 35 monospace columns, 80 mm is
 * 48. The API ships the rendered rows so the browser preview and the print page
 * show byte-identical content; the only variation is the `SALINAN` and
 * `DIBATALKAN` stamps, which change no figure.
 */

import { formatIdr, sumIdr } from "./money.ts";
import type { OrderStatus } from "./lifecycle.ts";

export const RECEIPT_PAPER_WIDTHS = [58, 80] as const;
export type ReceiptPaperWidth = (typeof RECEIPT_PAPER_WIDTHS)[number];

export const RECEIPT_COLUMNS: Record<ReceiptPaperWidth, number> = {
  58: 35,
  80: 48,
};

export const PAYMENT_METHOD_LABELS = {
  CASH: "Tunai",
  TRANSFER: "Transfer",
  QRIS: "QRIS",
} as const;

export type ReceiptPaymentMethod = keyof typeof PAYMENT_METHOD_LABELS;

export interface ReceiptLineSource {
  lineType: "PRODUCT" | "SERVICE";
  description: string;
  quantity: number;
  unitPrice: bigint;
  discountAmount: bigint;
  lineTotal: bigint;
}

export interface ReceiptPaymentSource {
  method: string;
  amount: bigint;
}

export interface ReceiptTemplateInput {
  documentKind: "RECEIPT" | "ESTIMATE";
  paperWidth: ReceiptPaperWidth;
  outletName: string;
  headerText?: string | null;
  footerText?: string | null;
  orderNumber: string;
  /** ISO-8601 or Date; rendered in Asia/Jakarta. */
  orderDate: Date | string;
  cashierName: string;
  customerName?: string | null;
  vehiclePlate?: string | null;
  vehicleLabel?: string | null;
  technicianName?: string | null;
  lines: readonly ReceiptLineSource[];
  subtotal: bigint;
  discountTotal: bigint;
  taxRatePercent: number;
  taxTotal: bigint;
  total: bigint;
  payments: readonly ReceiptPaymentSource[];
  paidTotal: bigint;
  changeTotal: bigint;
  status: OrderStatus;
  isReprint?: boolean;
}

export interface ReceiptTemplate {
  title: string;
  columns: number;
  rows: string[];
}

const WIB_TIME_ZONE = "Asia/Jakarta";

const wibTimestamp = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: WIB_TIME_ZONE,
});

/** `27 Nov 2026 14.05` in Asia/Jakarta, independent of the host time zone. */
export function formatReceiptTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = wibTimestamp.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${lookup("day")} ${lookup("month")} ${lookup("year")} ${lookup("hour")}.${lookup("minute")}`;
}

/**
 * Wraps text to `columns`, breaking an over-long token (a pasted SKU, a long
 * vehicle note) instead of letting it overflow the paper.
 */
export function wrapReceiptText(text: string, columns: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return [""];
  const width = Math.max(1, columns);
  const rows: string[] = [];
  let current = "";

  for (const word of normalized.split(" ")) {
    if (current.length === 0) {
      if (word.length <= width) {
        current = word;
        continue;
      }
      let rest = word;
      while (rest.length > width) {
        rows.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      current = rest;
      continue;
    }

    if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
      continue;
    }

    rows.push(current);
    if (word.length <= width) {
      current = word;
      continue;
    }

    let rest = word;
    while (rest.length > width) {
      rows.push(rest.slice(0, width));
      rest = rest.slice(width);
    }
    current = rest;
  }

  if (current.length > 0) rows.push(current);
  return rows.length > 0 ? rows : [""];
}

function centerRow(text: string, columns: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lines = wrapReceiptText(normalized, columns);
  return lines
    .map((line) => {
      if (line.length >= columns) return line.slice(0, columns);
      const left = Math.floor((columns - line.length) / 2);
      return `${" ".repeat(left)}${line}`;
    })
    .join("\n");
}

/** Left label, right value; a too-wide pair wraps the value onto its own row. */
function leftRightRow(left: string, right: string, columns: number): string {
  const label = left.replace(/\s+/g, " ").trim();
  // Money strings carry a no-break space after "Rp"; trim only, never collapse.
  const value = right.trim();
  if (label.length + 1 + value.length <= columns) {
    return `${label}${" ".repeat(columns - label.length - value.length)}${value}`;
  }
  if (label.length >= columns) {
    return [
      ...wrapReceiptText(label, columns),
      value.length >= columns ? value.slice(0, columns) : value.padStart(columns),
    ].join("\n");
  }
  return `${label}\n${value.length >= columns ? value.slice(0, columns) : value.padStart(columns)}`;
}

/** `Label: value` with wrapped continuation lines aligned under the value. */
function labeledRow(label: string, value: string, columns: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const prefix = `${label}: `;
  if (prefix.length + normalized.length <= columns) {
    return `${prefix}${normalized}`;
  }
  const indent = " ".repeat(Math.min(prefix.length, Math.max(0, columns - 1)));
  const lines = wrapReceiptText(normalized, columns - indent.length);
  return [`${prefix.trimEnd()}`, ...lines.map((line) => `${indent}${line}`)].join("\n");
}

/**
 * Builds the monospace document. Every returned row is at most `columns`
 * characters wide, so neither paper width can clip an amount.
 */
export function buildReceiptTemplate(input: ReceiptTemplateInput): ReceiptTemplate {
  const columns = RECEIPT_COLUMNS[input.paperWidth] ?? RECEIPT_COLUMNS[58];
  const isEstimate = input.documentKind === "ESTIMATE";
  const title = isEstimate ? "ESTIMASI" : "STRUK";
  const rows: string[] = [];

  rows.push(centerRow(input.outletName.toUpperCase(), columns));
  if (input.headerText) {
    for (const line of wrapReceiptText(input.headerText, columns)) {
      rows.push(centerRow(line, columns));
    }
  }
  rows.push("-".repeat(columns));
  rows.push(centerRow(title, columns));
  if (input.status === "VOID") rows.push(centerRow("*** DIBATALKAN ***", columns));
  if (input.isReprint) rows.push(centerRow("SALINAN", columns));
  rows.push("-".repeat(columns));

  rows.push(
    ...[
      labeledRow("No", input.orderNumber, columns),
      labeledRow("Tgl", formatReceiptTimestamp(input.orderDate), columns),
      labeledRow("Kasir", input.cashierName, columns),
    ],
  );
  if (input.customerName) {
    rows.push(labeledRow("Pelanggan", input.customerName, columns));
  }
  if (input.vehiclePlate) {
    const vehicle = input.vehicleLabel
      ? `${input.vehiclePlate} ${input.vehicleLabel}`
      : input.vehiclePlate;
    rows.push(labeledRow("Kendaraan", vehicle, columns));
  }
  if (input.technicianName) {
    rows.push(labeledRow("Mekanik", input.technicianName, columns));
  }
  rows.push("-".repeat(columns));

  for (const line of input.lines) {
    for (const descriptionRow of wrapReceiptText(line.description, columns)) {
      rows.push(descriptionRow);
    }
    rows.push(
      leftRightRow(
        `  ${line.quantity} x ${formatIdr(line.unitPrice)}`,
        formatIdr(line.lineTotal),
        columns,
      ),
    );
    if (line.discountAmount > 0n) {
      rows.push(
        leftRightRow(`  Diskon`, `\u2212${formatIdr(line.discountAmount)}`, columns),
      );
    }
  }
  rows.push("-".repeat(columns));

  const lineDiscountTotal = sumIdr(input.lines.map((line) => line.discountAmount));
  const orderDiscount = input.discountTotal - lineDiscountTotal;

  rows.push(leftRightRow("Subtotal", formatIdr(input.subtotal), columns));
  if (orderDiscount > 0n) {
    // Per-line discounts are printed under their own item; this row is the
    // order-level discount only, so no figure appears twice.
    rows.push(leftRightRow("Diskon", `\u2212${formatIdr(orderDiscount)}`, columns));
  }
  if (input.taxRatePercent > 0 || input.taxTotal > 0n) {
    rows.push(leftRightRow(`PPN ${input.taxRatePercent}%`, formatIdr(input.taxTotal), columns));
  }
  rows.push(leftRightRow("TOTAL", formatIdr(input.total), columns));

  if (!isEstimate) {
    rows.push("-".repeat(columns));
    for (const payment of input.payments) {
      const label =
        PAYMENT_METHOD_LABELS[payment.method as ReceiptPaymentMethod] ?? payment.method;
      rows.push(leftRightRow(label, formatIdr(payment.amount), columns));
    }
    if (input.changeTotal > 0n) {
      rows.push(leftRightRow("Kembali", formatIdr(input.changeTotal), columns));
    }
  }

  rows.push("-".repeat(columns));
  if (isEstimate) {
    rows.push(centerRow("Bukan bukti pembayaran.", columns));
  }
  if (input.footerText) {
    for (const line of wrapReceiptText(input.footerText, columns)) {
      rows.push(centerRow(line, columns));
    }
  } else if (!isEstimate) {
    rows.push(centerRow("Terima kasih atas kepercayaan Anda.", columns));
  }

  // Rows are the wire/print unit: a block that needed a second line is split so
  // every row is a single line no wider than the paper.
  return { title, columns, rows: rows.flatMap((row) => row.split("\n")) };
}
