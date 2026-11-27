import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  orderResponseSchema,
  receiptResponseSchema,
  recordPaymentResponseSchema,
  type OrderDetail,
} from "@workshop-pos/contracts";
import { Client } from "pg";

import { formatIdr } from "../../lib/format";
import { databaseUrl, readTestPassword } from "./env";
import {
  createStaffViaApi,
  expectNoHorizontalOverflow,
  newStaffInput,
  signInWithApi,
  signInWithPassword,
} from "./helpers";

function statusChip(page: Page, label: string) {
  return page.locator(".bo-chip").filter({ hasText: label });
}

/**
 * WP6 critical sale flows (US-03, US-05–US-09, US-17).
 *
 * Figures are asserted against the database as well as the rendered page, so a
 * pretty screen over a wrong row cannot pass. The global setup recreates the
 * disposable dev database; this file only adds data.
 */

const SEED_PRODUCT_ID = "c0000000-0000-4000-8000-000000000001";
const SEED_SERVICE_ID = "c0000000-0000-4000-8000-000000000002";
const SEED_CUSTOMER_ID = "d0000000-0000-4000-8000-000000000001";
const SEED_VEHICLE_ID = "d0000000-0000-4000-8000-000000000002";

interface OrderRowResult {
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  status: string;
  order_number: string;
}

async function dbQuery<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({
    connectionString: databaseUrl(),
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    await client.end().catch(() => undefined);
  }
}

function mixedSale(overrides: Record<string, unknown> = {}) {
  return {
    kind: "SALE",
    customerId: SEED_CUSTOMER_ID,
    vehicleId: SEED_VEHICLE_ID,
    lines: [
      { lineType: "PRODUCT", catalogItemId: SEED_PRODUCT_ID, quantity: 1 },
      { lineType: "SERVICE", catalogItemId: SEED_SERVICE_ID, quantity: 1 },
    ],
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

async function createOrderViaApi(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<OrderDetail> {
  const response = await request.post("/api/v1/orders", {
    data: mixedSale(overrides),
  });
  expect(response.status(), await response.text()).toBe(201);
  const parsed = orderResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`Unexpected order payload: ${parsed.error.message}`);
  return parsed.data.item;
}

async function createServiceOrderViaApi(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<OrderDetail> {
  return createOrderViaApi(request, {
    kind: "SERVICE",
    customerId: SEED_CUSTOMER_ID,
    vehicleId: SEED_VEHICLE_ID,
    lines: [{ lineType: "SERVICE", catalogItemId: SEED_SERVICE_ID, quantity: 1 }],
    ...overrides,
  });
}

async function payViaApi(
  request: APIRequestContext,
  orderId: string,
  method: "CASH" | "TRANSFER" | "QRIS",
  amount: string,
  referenceNote?: string,
) {
  const response = await request.post("/api/v1/payments", {
    data: {
      orderId,
      method,
      amount,
      referenceNote,
      idempotencyKey: randomUUID(),
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const parsed = recordPaymentResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`Unexpected payment payload: ${parsed.error.message}`);
  return parsed.data;
}

async function signInAs(
  page: Page,
  context: BrowserContext,
  account: "owner" | "admin" | "cashier" | "mechanic",
): Promise<void> {
  await signInWithApi(context, account);
  await page.goto("/");
}

test("Admin rings up the AC3.1 mixed sale and gets the exact receipt", async ({ page, context }) => {
  await signInAs(page, context, "admin");
  await page.goto("/orders/new");

  await page.getByRole("button", { name: "Tambah Kampas rem depan" }).click();
  await page.getByRole("button", { name: "Tambah Ganti oli mesin" }).click();

  await page.getByLabel("Cari kendaraan").fill("B1234XYZ");
  await page
    .getByRole("region", { name: "Kendaraan dan teknisi" })
    .getByRole("button", { name: "Cari", exact: true })
    .click();
  await page.getByRole("button", { name: "Pilih kendaraan B1234XYZ" }).click();

  await page.getByLabel("Diskon transaksi (%)").fill("10");
  await page.getByLabel("Alasan diskon").fill("Promo pelanggan tetap");

  // Client totals mirror the server's pure pricing module before saving.
  await expect(page.getByText(formatIdr("299700"))).toBeVisible();
  await page.getByRole("button", { name: "Simpan transaksi" }).click();

  await expect(page.getByRole("heading", { name: /^Pembayaran INV\// })).toBeVisible();
  await page.getByLabel("Jumlah diterima").fill("300000");
  await page.getByRole("button", { name: /^Bayar Rp/ }).click();

  await expect(page.getByText(/Kembalian Rp/)).toBeVisible();
  await expect(page.getByText(/Pembayaran berhasil/)).toBeVisible();

  const printHref = await page.getByRole("link", { name: "Cetak struk" }).getAttribute("href");
  const orderId = /\/print\/receipt\/([0-9a-f-]{36})/.exec(printHref ?? "")?.[1];
  expect(orderId).toBeTruthy();

  const [row] = await dbQuery<OrderRowResult>(
    `select subtotal::text, discount_total::text, tax_total::text, total::text,
            status::text, order_number
       from orders where id = $1`,
    [orderId],
  );
  expect(row).toMatchObject({
    subtotal: "300000",
    discount_total: "30000",
    tax_total: "29700",
    total: "299700",
    status: "PAID",
  });
  expect(row?.order_number).toMatch(/^INV\/\d{4}\/\d{6}$/);

  const payments = await dbQuery<{ method: string; amount: string; change_amount: string }>(
    `select method::text, amount::text, change_amount::text
       from payments where order_id = $1`,
    [orderId],
  );
  expect(payments).toEqual([{ method: "CASH", amount: "299700", change_amount: "300" }]);

  const ledger = await dbQuery<{
    entry_type: string;
    quantity_before: number;
    quantity_after: number;
  }>(
    `select entry_type::text, quantity_before, quantity_after
       from stock_ledger where source_id = $1`,
    [orderId],
  );
  expect(ledger).toEqual([
    { entry_type: "SALE_DECREMENT", quantity_before: 20, quantity_after: 19 },
  ]);

  // The receipt page is the browser fallback; first print has no SALINAN stamp.
  await page.goto(`/print/receipt/${orderId}`);
  const paper = page.locator("pre");
  await expect(paper).toContainText("Kampas rem depan");
  await expect(paper).toContainText("Ganti oli mesin");
  await expect(paper).toContainText(formatIdr("299700"));
  await expect(paper).toContainText("Tunai");
  await expect(paper).toContainText("Kembali");
  await expect(paper).not.toContainText("SALINAN");
  await page.getByRole("button", { name: "Cetak via browser" }).click();
  await expect(page.getByText(/Simpan sebagai PDF/)).toBeVisible();

  await page.goto("/orders");
  await expect(
    page.locator("a:visible", { hasText: row?.order_number ?? "" }).first(),
  ).toBeVisible();
});

test("Cashier discount above the cap is refused and audited", async ({ page, context }) => {
  await signInAs(page, context, "cashier");
  await page.goto("/orders/new");

  await page.getByRole("button", { name: "Tambah Kampas rem depan" }).click();
  await page.getByLabel("Diskon transaksi (%)").fill("10");
  await page.getByRole("button", { name: "Simpan transaksi" }).click();

  await expect(page.getByText(/Minta persetujuan Admin atau Pemilik/)).toBeVisible();

  const audit = await dbQuery<{ actor_id: string }>(
    `select actor_id from audit_log
      where action = 'order.discount_denied' and actor_id = $1
      order by created_at desc limit 1`,
    ["seed_cashier_dewi"],
  );
  expect(audit).toHaveLength(1);
});

test("Split payment reaches PAID through the payment sheet", async ({ page, context }) => {
  await signInAs(page, context, "admin");
  const order = await createOrderViaApi(context.request, {
    discountPercent: undefined,
    discountReason: undefined,
  });
  expect(order.total).toBe("333000");

  await page.goto(`/orders/${order.id}`);
  await expect(page.getByRole("heading", { name: /^Nota INV\// })).toBeVisible();

  await page.getByRole("button", { name: "Catat pembayaran" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Jumlah diterima").fill("100000");
  await dialog.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(page.getByText(formatIdr("233000"))).toBeVisible();

  await page.getByRole("button", { name: "Catat pembayaran" }).click();
  const second = page.getByRole("dialog");
  await second.getByLabel("Metode pembayaran").selectOption("TRANSFER");
  await second.getByLabel("Jumlah diterima").fill("233000");
  await second.getByLabel("Referensi").fill("TRF-E2E-1");
  await second.getByRole("button", { name: /^Bayar Rp/ }).click();

  await expect(statusChip(page, "Dibayar")).toBeVisible();
  const payments = await dbQuery<{ method: string }>(
    `select method::text from payments where order_id = $1 order by received_at`,
    [order.id],
  );
  expect(payments.map((payment) => payment.method)).toEqual(["CASH", "TRANSFER"]);
});

test("A partial counter tender stays on the payment step", async ({ page, context }) => {
  await signInAs(page, context, "admin");
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Tambah Kampas rem depan" }).click();
  await page.getByRole("button", { name: "Simpan transaksi" }).click();

  await page.getByLabel("Jumlah diterima").fill("100000");
  await page.getByRole("button", { name: /^Bayar Rp/ }).click();

  await expect(page.getByText(/Pembayaran sebagian tercatat/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Pembayaran INV/ })).toBeVisible();

  // The sheet keeps the caller here and pre-fills the new balance.
  await page.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(page.getByText(/Pembayaran berhasil/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Cetak struk" })).toBeVisible();
});

test("Estimate, approval, work, completion, and payment flow in order", async ({ page, context }) => {
  await signInAs(page, context, "admin");
  const order = await createServiceOrderViaApi(context.request);

  await page.goto(`/orders/${order.id}`);
  await page.getByRole("button", { name: "Terbitkan estimasi" }).click();
  await expect(statusChip(page, "Estimasi")).toBeVisible();

  // Payment is blocked before approval (AC5.4), both in the UI and the API.
  await expect(page.getByRole("button", { name: "Catat pembayaran" })).toHaveCount(0);
  const blocked = await context.request.post("/api/v1/payments", {
    data: {
      orderId: order.id,
      method: "CASH",
      amount: "10000",
      idempotencyKey: randomUUID(),
    },
  });
  expect(blocked.status()).toBe(409);

  await page.getByRole("button", { name: "Catat persetujuan" }).click();
  await expect(statusChip(page, "Disetujui")).toBeVisible();

  await page.getByRole("button", { name: "Mulai kerja" }).click();
  await expect(statusChip(page, "Dikerjakan")).toBeVisible();

  await page.getByRole("button", { name: "Selesaikan pekerjaan" }).click();
  await expect(statusChip(page, "Selesai")).toBeVisible();

  await page.getByRole("button", { name: "Catat pembayaran" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(statusChip(page, "Dibayar")).toBeVisible();

  await page.goto(`/print/receipt/${order.id}`);
  await expect(page.locator("pre")).toContainText("Ganti oli mesin");
  await expect(page.locator("pre")).toContainText("Tunai");
});

test("Admin cannot void a paid order", async ({ page, context }) => {
  await signInAs(page, context, "admin");
  const order = await createOrderViaApi(context.request);
  await payViaApi(context.request, order.id, "CASH", order.total);

  await page.goto(`/orders/${order.id}`);
  await expect(statusChip(page, "Dibayar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Batalkan transaksi" })).toHaveCount(0);

  const denied = await context.request.post(`/api/v1/orders/${order.id}/void`, {
    data: { reason: "Salah input pelanggan" },
  });
  expect(denied.status()).toBe(403);
});

test("Owner voids a paid order with full refunds and a DIBATALKAN reprint", async ({
  page,
  context,
}) => {
  await signInAs(page, context, "owner");
  const order = await createOrderViaApi(context.request);
  await payViaApi(context.request, order.id, "CASH", order.total);

  await page.goto(`/orders/${order.id}`);
  await page.getByRole("button", { name: "Batalkan transaksi" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Pengembalian dana Tunai/)).toBeVisible();
  await dialog.getByLabel("Kata sandi Pemilik").fill(readTestPassword());
  await dialog.getByLabel("Alasan pembatalan").fill("Pelanggan membatalkan pekerjaan");
  await dialog.getByRole("button", { name: "Batalkan transaksi" }).click();

  await expect(
    page.getByRole("region", { name: "Transaksi dibatalkan" }),
  ).toBeVisible();
  await expect(statusChip(page, "Dibatalkan")).toBeVisible();

  const refunds = await dbQuery<{ amount: string }>(
    `select amount::text from refunds where order_id = $1`,
    [order.id],
  );
  expect(refunds).toHaveLength(1);
  expect(refunds[0]?.amount).toBe(order.total);

  const reversals = await dbQuery<{ entry_type: string }>(
    `select entry_type::text from stock_ledger
      where source_id = $1 and entry_type = 'SALE_REVERSAL'`,
    [order.id],
  );
  expect(reversals).toHaveLength(1);

  await page.goto(`/print/receipt/${order.id}`);
  await expect(page.locator("pre")).toContainText("DIBATALKAN");
});

test("Reprint is stamped SALINAN and counted in the audit log", async ({ page, context }) => {
  await signInAs(page, context, "admin");
  const order = await createOrderViaApi(context.request);
  await payViaApi(context.request, order.id, "CASH", order.total);

  const first = await context.request.post(`/api/v1/receipts/${order.id}/print`, {
    data: {},
  });
  expect(first.status()).toBe(200);
  const firstParsed = receiptResponseSchema.parse(await first.json());
  expect(firstParsed.item.isReprint).toBe(false);

  const second = await context.request.post(`/api/v1/receipts/${order.id}/print`, {
    data: {},
  });
  expect(second.status()).toBe(200);
  const secondParsed = receiptResponseSchema.parse(await second.json());
  expect(secondParsed.item.isReprint).toBe(true);
  expect(secondParsed.item.rows.join("\n")).toContain("SALINAN");
  expect(secondParsed.item.total).toBe(firstParsed.item.total);

  await page.goto(`/print/receipt/${order.id}`);
  await expect(page.locator("pre")).toContainText("SALINAN");
  await expect(page.locator("pre")).toContainText(formatIdr(order.total));

  const prints = await dbQuery<{ count: string }>(
    `select count(*)::text from audit_log
      where action = 'receipt.printed' and entity_type = 'order' and entity_id = $1`,
    [order.id],
  );
  expect(prints[0]?.count).toBe("2");
});

test("A double submit with one client key creates exactly one order", async ({ context }) => {
  await signInWithApi(context, "admin");
  const payload = mixedSale();

  const [first, second] = await Promise.all([
    context.request.post("/api/v1/orders", { data: payload }),
    context.request.post("/api/v1/orders", { data: payload }),
  ]);
  expect(first.status()).toBe(201);
  expect(second.status()).toBe(201);

  const firstItem = orderResponseSchema.parse(await first.json()).item;
  const secondItem = orderResponseSchema.parse(await second.json()).item;
  expect(secondItem.id).toBe(firstItem.id);

  const rows = await dbQuery<{ count: string }>(
    `select count(*)::text from orders where id = $1`,
    [firstItem.id],
  );
  expect(rows[0]?.count).toBe("1");
});

test("Mechanic sees assigned work only and cannot sell directly", async ({ page, context }) => {
  // The WP3 auth spec intentionally locks the seed Mechanic account; this flow
  // provisions its own Mechanic so it never depends on that side effect.
  await signInWithApi(context, "owner");
  const staff = newStaffInput("MECHANIC");
  const mechanicUser = await createStaffViaApi(context, staff);
  const assigned = await createOrderViaApi(context.request, {
    technicianId: mechanicUser.id,
    discountPercent: undefined,
    discountReason: undefined,
  });
  const unassigned = await createOrderViaApi(context.request, {
    discountPercent: undefined,
    discountReason: undefined,
  });

  await context.clearCookies();
  await signInWithPassword(context, staff.username, staff.password);
  await page.goto("/");
  await page.goto("/orders");
  await expect(
    page.locator("a:visible", { hasText: assigned.orderNumber ?? "" }).first(),
  ).toBeVisible();
  await expect(page.getByText(unassigned.orderNumber ?? "")).toHaveCount(0);

  await page.goto("/orders/new");
  await expect(page.getByRole("radio", { name: "Servis (nota servis)" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Penjualan langsung" })).toHaveCount(0);

  const denied = await page.goto(`/orders/${unassigned.id}`);
  expect(denied?.status()).toBe(403);
});

test("Order screens fit 320, 390, 768, 1024, and 1440 px", async ({ page, context }) => {
  await signInAs(page, context, "admin");
  const order = await createOrderViaApi(context.request);
  await payViaApi(context.request, order.id, "CASH", order.total);

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/orders");
    await expectNoHorizontalOverflow(page);

    await page.goto("/orders/new");
    await expectNoHorizontalOverflow(page);

    await page.goto(`/orders/${order.id}`);
    await expectNoHorizontalOverflow(page);

    await page.goto(`/print/receipt/${order.id}`);
    await expectNoHorizontalOverflow(page);
  }
});
