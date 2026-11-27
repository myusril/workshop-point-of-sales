import { formatReceiptTimestamp } from "@workshop-pos/core";

/** Shop-facing timestamp in Asia/Jakarta with an explicit WIB suffix. */
export function formatWibTimestamp(value: Date | string): string {
  return `${formatReceiptTimestamp(value)} WIB`;
}
