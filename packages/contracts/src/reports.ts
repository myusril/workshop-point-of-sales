import { z } from "zod";

import { paymentMethodSchema } from "./payments.ts";
import { orderStatusSchema } from "./vehicles.ts";

/**
 * Report read-model contracts (PRD FR-060–FR-068).
 *
 * Every monetary figure crosses the API as a canonical integer string, never a
 * JSON number, so a browser can never round it into a float (BR-001). Business
 * dates are `YYYY-MM-DD` Asia/Jakarta calendar days (BR-010).
 */

export const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const probe = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0));
    return (
      probe.getUTCFullYear() === year &&
      probe.getUTCMonth() === (month ?? 1) - 1 &&
      probe.getUTCDate() === day
    );
  }, "Tanggal tidak valid.");

export const reportMoneySchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/, "Nilai uang harus berupa angka rupiah bulat.");
export type ReportMoney = z.infer<typeof reportMoneySchema>;

export const signedReportMoneySchema = z
  .string()
  .regex(/^-?(0|[1-9][0-9]*)$/, "Nilai uang harus berupa angka rupiah bulat.");

/** Maximum span of one report request: 366 inclusive days (a leap year). */
export const REPORT_MAX_RANGE_DAYS = 366;

function dayDistance(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = Date.UTC(fy ?? 0, (fm ?? 1) - 1, fd ?? 0);
  const end = Date.UTC(ty ?? 0, (tm ?? 1) - 1, td ?? 0);
  return Math.round((end - start) / 86_400_000);
}

const rangeShape = {
  from: businessDateSchema,
  to: businessDateSchema,
  outletId: z.uuid("Outlet tidak valid.").optional(),
};

export const reportRangeQuerySchema = z
  .object(rangeShape)
  .refine((value) => dayDistance(value.from, value.to) >= 0, {
    message: "Tanggal akhir tidak boleh mendahului tanggal awal.",
    path: ["to"],
  })
  .refine((value) => dayDistance(value.from, value.to) <= REPORT_MAX_RANGE_DAYS - 1, {
    message: `Rentang laporan maksimal ${REPORT_MAX_RANGE_DAYS} hari.`,
    path: ["to"],
  });
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

export const reportDateQuerySchema = z.object({
  date: businessDateSchema,
  outletId: z.uuid("Outlet tidak valid.").optional(),
});
export type ReportDateQuery = z.infer<typeof reportDateQuerySchema>;

export const stockValuationQuerySchema = z.object({
  asOf: businessDateSchema.optional(),
  outletId: z.uuid("Outlet tidak valid.").optional(),
});
export type StockValuationQuery = z.infer<typeof stockValuationQuerySchema>;

export const reportOutletSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});
export type ReportOutlet = z.infer<typeof reportOutletSchema>;

export const orderStatusCountsSchema = z.object({
  DRAFT: z.number().int().nonnegative(),
  ESTIMATED: z.number().int().nonnegative(),
  APPROVED: z.number().int().nonnegative(),
  IN_PROGRESS: z.number().int().nonnegative(),
  COMPLETED: z.number().int().nonnegative(),
  PAID: z.number().int().nonnegative(),
  VOID: z.number().int().nonnegative(),
});
export type OrderStatusCounts = z.infer<typeof orderStatusCountsSchema>;

export const salesFiguresSchema = z.object({
  orderCount: z.number().int().nonnegative(),
  grossSales: reportMoneySchema,
  discounts: reportMoneySchema,
  tax: reportMoneySchema,
  netSales: reportMoneySchema,
});
export type SalesFigures = z.infer<typeof salesFiguresSchema>;

const dailySalesDaySchema = z.object({
  date: businessDateSchema,
  countsByStatus: orderStatusCountsSchema,
  figures: salesFiguresSchema,
});
export type DailySalesDay = z.infer<typeof dailySalesDaySchema>;

export const dailySalesReportSchema = z.object({
  report: z.literal("daily-sales"),
  outlet: reportOutletSchema,
  from: businessDateSchema,
  to: businessDateSchema,
  generatedAt: z.string(),
  days: z.array(dailySalesDaySchema),
  totals: z.object({
    countsByStatus: orderStatusCountsSchema,
    figures: salesFiguresSchema,
  }),
});
export type DailySalesReport = z.infer<typeof dailySalesReportSchema>;

const paymentMixRowSchema = z.object({
  method: paymentMethodSchema,
  payments: reportMoneySchema,
  refunds: reportMoneySchema,
  net: signedReportMoneySchema,
  /** Cash tendered above the balance that was returned on this day. */
  change: reportMoneySchema,
});
export type PaymentMixRow = z.infer<typeof paymentMixRowSchema>;

export const paymentMixReportSchema = z.object({
  report: z.literal("payment-mix"),
  outlet: reportOutletSchema,
  from: businessDateSchema,
  to: businessDateSchema,
  generatedAt: z.string(),
  methods: z.array(paymentMixRowSchema),
  expectedCash: signedReportMoneySchema,
  totalNet: signedReportMoneySchema,
  changeTotal: reportMoneySchema,
});
export type PaymentMixReport = z.infer<typeof paymentMixReportSchema>;

const revenueBucketSchema = z.object({
  lineCount: z.number().int().nonnegative(),
  quantity: z.number().int().nonnegative(),
  revenue: reportMoneySchema,
});

export const serviceProductReportSchema = z.object({
  report: z.literal("service-product"),
  outlet: reportOutletSchema,
  from: businessDateSchema,
  to: businessDateSchema,
  generatedAt: z.string(),
  product: revenueBucketSchema,
  service: revenueBucketSchema,
  discountTotal: reportMoneySchema,
  taxTotal: reportMoneySchema,
  totalRevenue: reportMoneySchema,
});
export type ServiceProductReport = z.infer<typeof serviceProductReportSchema>;

const technicianProductivityRowSchema = z.object({
  technicianId: z.string(),
  technicianName: z.string(),
  completedOrders: z.number().int().nonnegative(),
  completedLines: z.number().int().nonnegative(),
  laborValue: reportMoneySchema,
});
export type TechnicianProductivityRow = z.infer<
  typeof technicianProductivityRowSchema
>;

export const technicianProductivityReportSchema = z.object({
  report: z.literal("technician-productivity"),
  outlet: reportOutletSchema,
  from: businessDateSchema,
  to: businessDateSchema,
  generatedAt: z.string(),
  technicians: z.array(technicianProductivityRowSchema),
});
export type TechnicianProductivityReport = z.infer<
  typeof technicianProductivityReportSchema
>;

const stockValuationItemSchema = z.object({
  productId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  onHand: z.number().int(),
  unitCost: reportMoneySchema,
  value: signedReportMoneySchema,
});
export type StockValuationItem = z.infer<typeof stockValuationItemSchema>;

export const stockValuationReportSchema = z.object({
  report: z.literal("stock-valuation"),
  outlet: reportOutletSchema,
  asOf: businessDateSchema,
  generatedAt: z.string(),
  items: z.array(stockValuationItemSchema),
  totalValue: signedReportMoneySchema,
});
export type StockValuationReport = z.infer<typeof stockValuationReportSchema>;

const endOfDayVoidSchema = z.object({
  orderId: z.uuid(),
  orderNumber: z.string().nullable(),
  voidedAt: z.string().nullable(),
  total: reportMoneySchema,
  reason: z.string().nullable(),
});
export type EndOfDayVoid = z.infer<typeof endOfDayVoidSchema>;

export const endOfDayReportSchema = z.object({
  report: z.literal("end-of-day"),
  outlet: reportOutletSchema,
  date: businessDateSchema,
  generatedAt: z.string(),
  countsByStatus: orderStatusCountsSchema,
  figures: salesFiguresSchema,
  paymentMix: z.object({
    methods: z.array(paymentMixRowSchema),
    expectedCash: signedReportMoneySchema,
    totalNet: signedReportMoneySchema,
    changeTotal: reportMoneySchema,
  }),
  voids: z.array(endOfDayVoidSchema),
});
export type EndOfDayReport = z.infer<typeof endOfDayReportSchema>;

export const REPORT_KINDS = [
  "daily-sales",
  "payment-mix",
  "service-product",
  "technician-productivity",
  "stock-valuation",
  "end-of-day",
] as const;
export const reportKindSchema = z.enum(REPORT_KINDS);
export type ReportKind = z.infer<typeof reportKindSchema>;

export const reportResponseSchema = z.discriminatedUnion("report", [
  dailySalesReportSchema,
  paymentMixReportSchema,
  serviceProductReportSchema,
  technicianProductivityReportSchema,
  stockValuationReportSchema,
  endOfDayReportSchema,
]);
export type ReportResponse = z.infer<typeof reportResponseSchema>;

export const reportPaymentMethodOrder = paymentMethodSchema.options;
export const reportOrderStatuses = orderStatusSchema.options;
