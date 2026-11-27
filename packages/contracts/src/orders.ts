import { z } from "zod";

import { moneyStringSchema } from "./catalog.ts";

/**
 * Order contracts (FR-030–FR-039, FR-044–FR-049, BR-003, BR-007, BR-009).
 *
 * Money crosses the boundary as a canonical integer-rupiah string and is
 * parsed with `parseIdr` on the server; no request can send a float or a
 * client-computed total that the server would persist (the server recomputes
 * every figure from line data).
 *
 * Discounts are one of two shapes per scope: a whole percent (0–100) or a fixed
 * rupiah amount. Sending both is a validation error so the effective discount
 * can never be ambiguous.
 */

import { orderKindSchema, orderStatusSchema } from "./vehicles.ts";

export const ORDER_LINE_TYPES = ["PRODUCT", "SERVICE"] as const;
export const orderLineTypeSchema = z.enum(ORDER_LINE_TYPES);
export type OrderLineType = z.infer<typeof orderLineTypeSchema>;

/** Statuses a manual transition may request; `PAID` and `VOID` have their own flows. */
export const ORDER_TRANSITION_TARGETS = [
  "ESTIMATED",
  "APPROVED",
  "DRAFT",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
export const orderTransitionTargetSchema = z.enum(ORDER_TRANSITION_TARGETS);
export type OrderTransitionTarget = z.infer<typeof orderTransitionTargetSchema>;

export const ORDER_PAGE_SIZES = [25, 50, 100] as const;

export const MAX_ORDER_QUANTITY = 999;
export const MAX_ORDER_LINES = 100;

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "Kunci idempotensi minimal 8 karakter.")
  .max(128, "Kunci idempotensi maksimal 128 karakter.");

const discountPercentSchema = z
  .number()
  .int("Diskon persen harus bilangan bulat.")
  .min(0, "Diskon tidak boleh negatif.")
  .max(100, "Diskon maksimal 100 persen.");

const discountAmountSchema = moneyStringSchema;

const discountReasonSchema = z
  .string()
  .trim()
  .max(200, "Alasan diskon maksimal 200 karakter.");

const notesSchema = z.string().trim().max(500, "Catatan maksimal 500 karakter.");

const odometerSchema = z
  .number()
  .int("Odometer harus bilangan bulat.")
  .min(0, "Odometer tidak boleh negatif.")
  .max(9_999_999, "Odometer terlalu besar.");

function refineSingleDiscount(
  value: { discountPercent?: number; discountAmount?: string },
  context: z.RefinementCtx,
): void {
  if (value.discountPercent !== undefined && value.discountAmount !== undefined) {
    const message = "Isi diskon persen atau nominal, bukan keduanya.";
    context.addIssue({ code: "custom", path: ["discountPercent"], message });
    context.addIssue({ code: "custom", path: ["discountAmount"], message });
  }
}

/** One requested cart line; the server resolves price and description. */
export const orderLineInputSchema = z
  .object({
    lineType: orderLineTypeSchema,
    /** Product id for a PRODUCT line, service id for a SERVICE line. */
    catalogItemId: z.uuid("Item katalog tidak valid."),
    quantity: z
      .number()
      .int("Jumlah harus bilangan bulat.")
      .min(1, "Jumlah minimal 1.")
      .max(MAX_ORDER_QUANTITY, `Jumlah maksimal ${MAX_ORDER_QUANTITY}.`),
    discountPercent: discountPercentSchema.optional(),
    discountAmount: discountAmountSchema.optional(),
    /** Per-line technician override; defaults to the order's technician. */
    technicianId: z.string().trim().min(1).max(64).nullable().optional(),
    /** Required when the line pushes the aggregate discount above the cap. */
    discountReason: discountReasonSchema.optional(),
  })
  .superRefine(refineSingleDiscount);
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;

export const createOrderSchema = z
  .object({
    kind: orderKindSchema,
    /** Defaults to the caller's active outlet; must be inside their scope. */
    outletId: z.uuid("Outlet tidak valid.").optional(),
    customerId: z.uuid("Pelanggan tidak valid.").nullable().optional(),
    vehicleId: z.uuid("Kendaraan tidak valid.").nullable().optional(),
    technicianId: z.string().trim().min(1).max(64).nullable().optional(),
    odometer: odometerSchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
    discountPercent: discountPercentSchema.optional(),
    discountAmount: discountAmountSchema.optional(),
    discountReason: discountReasonSchema.optional(),
    lines: z
      .array(orderLineInputSchema)
      .max(MAX_ORDER_LINES, `Maksimal ${MAX_ORDER_LINES} baris per transaksi.`)
      .min(1, "Tambahkan minimal satu item."),
    idempotencyKey: idempotencyKeySchema,
  })
  .superRefine(refineSingleDiscount);
export type CreateOrderRequest = z.infer<typeof createOrderSchema>;

export const updateOrderSchema = z
  .object({
    customerId: z.uuid("Pelanggan tidak valid.").nullable().optional(),
    vehicleId: z.uuid("Kendaraan tidak valid.").nullable().optional(),
    technicianId: z.string().trim().min(1).max(64).nullable().optional(),
    odometer: odometerSchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
    discountPercent: discountPercentSchema.nullable().optional(),
    discountAmount: discountAmountSchema.nullable().optional(),
    discountReason: discountReasonSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.discountPercent !== undefined && value.discountAmount !== undefined) {
      const message = "Isi diskon persen atau nominal, bukan keduanya.";
      context.addIssue({ code: "custom", path: ["discountPercent"], message });
      context.addIssue({ code: "custom", path: ["discountAmount"], message });
    }
    const fields = [
      value.customerId,
      value.vehicleId,
      value.technicianId,
      value.odometer,
      value.notes,
      value.discountPercent,
      value.discountAmount,
    ];
    if (fields.every((field) => field === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["_root"],
        message: "Tidak ada perubahan yang dikirim.",
      });
    }
  });
export type UpdateOrderRequest = z.infer<typeof updateOrderSchema>;

export const updateOrderLineSchema = z
  .object({
    quantity: z
      .number()
      .int("Jumlah harus bilangan bulat.")
      .min(1, "Jumlah minimal 1.")
      .max(MAX_ORDER_QUANTITY, `Jumlah maksimal ${MAX_ORDER_QUANTITY}.`)
      .optional(),
    discountPercent: discountPercentSchema.nullable().optional(),
    discountAmount: discountAmountSchema.nullable().optional(),
    discountReason: discountReasonSchema.optional(),
    technicianId: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.discountPercent != null && value.discountAmount != null) {
      const message = "Isi diskon persen atau nominal, bukan keduanya.";
      context.addIssue({ code: "custom", path: ["discountPercent"], message });
      context.addIssue({ code: "custom", path: ["discountAmount"], message });
    }
    if (
      value.quantity === undefined &&
      value.discountPercent === undefined &&
      value.discountAmount === undefined &&
      value.technicianId === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["_root"],
        message: "Tidak ada perubahan yang dikirim.",
      });
    }
  });
export type UpdateOrderLineRequest = z.infer<typeof updateOrderLineSchema>;

export const transitionOrderSchema = z.object({
  to: orderTransitionTargetSchema,
  reason: z.string().trim().max(300, "Alasan maksimal 300 karakter.").optional(),
});
export type TransitionOrderRequest = z.infer<typeof transitionOrderSchema>;

export const voidOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Alasan pembatalan wajib diisi.")
    .max(500, "Alasan pembatalan maksimal 500 karakter."),
});
export type VoidOrderRequest = z.infer<typeof voidOrderSchema>;

export const orderListQuerySchema = z
  .object({
    /** Order number, plate, or customer name (never a phone in a GET URL). */
    q: z.string().trim().max(80, "Pencarian maksimal 80 karakter.").optional(),
    status: orderStatusSchema.optional(),
    from: z.iso.date("Tanggal awal tidak valid.").optional(),
    to: z.iso.date("Tanggal akhir tidak valid.").optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .refine(
        (value) => (ORDER_PAGE_SIZES as readonly number[]).includes(value),
        "Ukuran halaman tidak didukung.",
      )
      .default(25),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Tanggal awal tidak boleh setelah tanggal akhir.",
    path: ["from"],
  });
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/** Permissions resolved server-side so the UI never guesses role capability. */
export const orderPermissionsSchema = z.object({
  canEditLines: z.boolean(),
  canEditHeader: z.boolean(),
  canIssueEstimate: z.boolean(),
  canApprove: z.boolean(),
  canRevertEstimate: z.boolean(),
  canStartWork: z.boolean(),
  canComplete: z.boolean(),
  canRecordPayment: z.boolean(),
  canCorrectPayment: z.boolean(),
  canVoid: z.boolean(),
  canPrintReceipt: z.boolean(),
  canPrintEstimate: z.boolean(),
});
export type OrderPermissions = z.infer<typeof orderPermissionsSchema>;

export const orderLineSchema = z.object({
  id: z.uuid(),
  lineType: orderLineTypeSchema,
  productId: z.uuid().nullable(),
  serviceId: z.uuid().nullable(),
  description: z.string(),
  quantity: z.number().int(),
  unitPrice: moneyStringSchema,
  discountPercent: z.number().int().nullable(),
  discountAmount: moneyStringSchema,
  taxAmount: moneyStringSchema,
  lineTotal: moneyStringSchema,
  technicianId: z.string().nullable(),
  technicianName: z.string().nullable(),
});
export type OrderLine = z.infer<typeof orderLineSchema>;

export const orderPaymentSchema = z.object({
  id: z.uuid(),
  method: z.enum(["CASH", "TRANSFER", "QRIS"]),
  amount: moneyStringSchema,
  changeAmount: moneyStringSchema,
  referenceNote: z.string().nullable(),
  receivedAt: z.string(),
  createdByName: z.string(),
});
export type OrderPayment = z.infer<typeof orderPaymentSchema>;

export const orderRefundSchema = z.object({
  id: z.uuid(),
  method: z.enum(["CASH", "TRANSFER", "QRIS"]),
  amount: moneyStringSchema,
  reason: z.string(),
  refundedAt: z.string(),
});
export type OrderRefund = z.infer<typeof orderRefundSchema>;

export const orderTimelineEventSchema = z.object({
  id: z.uuid(),
  fromStatus: orderStatusSchema.nullable(),
  toStatus: orderStatusSchema,
  actorName: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type OrderTimelineEvent = z.infer<typeof orderTimelineEventSchema>;

export const orderCustomerSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
});
export type OrderCustomerSummary = z.infer<typeof orderCustomerSummarySchema>;

export const orderVehicleSummarySchema = z.object({
  id: z.uuid(),
  plate: z.string(),
  brand: z.string(),
  model: z.string(),
});
export type OrderVehicleSummary = z.infer<typeof orderVehicleSummarySchema>;

export const orderTechnicianSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type OrderTechnicianSummary = z.infer<typeof orderTechnicianSummarySchema>;

export const orderSettingsSummarySchema = z.object({
  paperWidth: z.union([z.literal(58), z.literal(80)]),
  taxRate: z.number().int(),
  cashierDiscountCapPercent: z.number().int(),
  voidReasonMinLength: z.number().int(),
});
export type OrderSettingsSummary = z.infer<typeof orderSettingsSummarySchema>;

export const orderDetailSchema = z.object({
  id: z.uuid(),
  orderNumber: z.string().nullable(),
  kind: orderKindSchema,
  status: orderStatusSchema,
  outletId: z.uuid(),
  outletName: z.string(),
  createdByName: z.string(),
  customer: orderCustomerSummarySchema.nullable(),
  vehicle: orderVehicleSummarySchema.nullable(),
  technician: orderTechnicianSummarySchema.nullable(),
  odometer: z.number().int().nullable(),
  notes: z.string().nullable(),
  taxRate: z.number().int(),
  subtotal: moneyStringSchema,
  discountTotal: moneyStringSchema,
  discountPercent: z.number().int().nullable(),
  discountAmount: moneyStringSchema.nullable(),
  taxTotal: moneyStringSchema,
  total: moneyStringSchema,
  paidTotal: moneyStringSchema,
  balanceDue: moneyStringSchema,
  changeTotal: moneyStringSchema,
  voidReason: z.string().nullable(),
  voidedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lines: z.array(orderLineSchema),
  payments: z.array(orderPaymentSchema),
  refunds: z.array(orderRefundSchema),
  timeline: z.array(orderTimelineEventSchema),
  permissions: orderPermissionsSchema,
  settings: orderSettingsSummarySchema,
  receiptAvailable: z.boolean(),
  printCount: z.number().int().nonnegative(),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

export const orderResponseSchema = z.object({ item: orderDetailSchema });
export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const orderListItemSchema = z.object({
  id: z.uuid(),
  orderNumber: z.string().nullable(),
  kind: orderKindSchema,
  status: orderStatusSchema,
  outletId: z.uuid(),
  outletName: z.string(),
  customerName: z.string().nullable(),
  vehiclePlate: z.string().nullable(),
  technicianName: z.string().nullable(),
  lineCount: z.number().int().nonnegative(),
  total: moneyStringSchema,
  paidTotal: moneyStringSchema,
  balanceDue: moneyStringSchema,
  createdAt: z.string(),
});
export type OrderListItem = z.infer<typeof orderListItemSchema>;

export const orderTechnicianSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type OrderTechnician = z.infer<typeof orderTechnicianSchema>;

export const technicianListQuerySchema = z.object({
  q: z.string().trim().max(80, "Pencarian maksimal 80 karakter.").optional(),
});
export type TechnicianListQuery = z.infer<typeof technicianListQuerySchema>;

export const orderTechnicianListResponseSchema = z.object({
  items: z.array(orderTechnicianSchema),
});
export type OrderTechnicianListResponse = z.infer<
  typeof orderTechnicianListResponseSchema
>;

export const orderListResponseSchema = z.object({
  items: z.array(orderListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;
