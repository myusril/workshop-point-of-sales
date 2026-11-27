import { createHash } from "node:crypto";

import type {
  CreateOrderRequest,
  OrderLineInput,
  RecordPaymentRequest,
} from "@workshop-pos/contracts";

/**
 * Idempotency keys (PRD BR-011, FR-042, AC3.6).
 *
 * A client sends a stable key per transaction attempt. The server stores a
 * SHA-256 of the canonical request next to it, so a replay of the same key
 * returns the original response and a reuse of the key with different content
 * is a conflict instead of a silent second sale.
 */

/** Deterministic JSON: object keys sorted, bigints kept exact as strings. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${parts.join(",")}}`;
}

export function canonicalRequestHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** The hashed input excludes request-transport noise but includes the actor. */
export function orderCreateRequestHash(
  actorId: string,
  input: CreateOrderRequest,
): string {
  return canonicalRequestHash({ operation: "order.create", actorId, input });
}

export function paymentRecordRequestHash(
  actorId: string,
  input: RecordPaymentRequest,
): string {
  return canonicalRequestHash({ operation: "payment.record", actorId, input });
}

/** Normalizes a line payload so an omitted and an explicit `null` hash alike. */
export function normalizeOrderLineInput(line: OrderLineInput) {
  return {
    lineType: line.lineType,
    catalogItemId: line.catalogItemId,
    quantity: line.quantity,
    discountPercent: line.discountPercent ?? null,
    discountAmount: line.discountAmount ?? null,
    technicianId: line.technicianId ?? null,
  };
}
