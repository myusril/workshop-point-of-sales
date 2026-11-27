import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";

import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  ANONYMIZED_CUSTOMER_NAME,
  customerResponseSchema,
  maskPhone,
  vehicleListResponseSchema,
  vehicleResponseSchema,
  vehicleSchema,
  type Customer,
  type Vehicle,
} from "@workshop-pos/contracts";
import {
  SEED_BUSINESS_ID,
  SEED_OUTLET_ID,
  SEED_PRODUCT_ID,
  SEED_SERVICE_ID,
} from "@workshop-pos/db";
import { Client } from "pg";

import { databaseUrl, uniquePhone, uniqueSuffix } from "./env";
import { expectNoHorizontalOverflow, signInWithApi } from "./helpers";

const SEED_OWNER_USER_ID = "seed_owner_rina";

interface CustomerInput {
  name?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

async function createCustomerViaApi(
  request: APIRequestContext,
  overrides: CustomerInput = {},
): Promise<Customer> {
  const suffix = uniqueSuffix();
  const response = await request.post("/api/v1/customers", {
    data: {
      name: `Pelanggan API ${suffix}`,
      phone: uniquePhone(),
      ...overrides,
    },
  });

  expect(response.status(), await response.text()).toBe(201);
  const parsed = customerResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`Unexpected customer payload: ${parsed.error.message}`);
  }
  return parsed.data.item;
}

interface VehicleInput {
  plate: string;
  brand?: string;
  model?: string;
  vin?: string;
  notes?: string;
  customerId: string;
}

async function createVehicleViaApi(
  request: APIRequestContext,
  input: VehicleInput,
): Promise<Vehicle> {
  const response = await request.post("/api/v1/vehicles", {
    data: {
      brand: "Honda",
      model: "Beat",
      ...input,
    },
  });

  expect(response.status(), await response.text()).toBe(201);
  const parsed = vehicleResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`Unexpected vehicle payload: ${parsed.error.message}`);
  }
  return parsed.data.item;
}

async function findVehicleIdViaApi(request: APIRequestContext, plate: string): Promise<string> {
  const response = await request.get(`/api/v1/vehicles?q=${encodeURIComponent(plate)}`);
  expect(response.status(), await response.text()).toBe(200);
  const parsed = vehicleListResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`Unexpected vehicle list payload: ${parsed.error.message}`);
  }
  const match = parsed.data.items.find((item) => item.normalizedPlate === plate);
  if (!match) throw new Error(`Vehicle ${plate} is not in the list`);
  return match.id;
}

/** Unique typed plate with a raw spelling that normalizes to the same value. */
function uniquePlate(): { canonical: string; typed: string; typedAgain: string } {
  const suffix = uniqueSuffix().toUpperCase();
  const letters = suffix.replace(/[^A-Z]/g, "").padEnd(3, "Z").slice(0, 3);
  const digits = suffix.replace(/[^0-9]/g, "").padEnd(4, "7").slice(0, 4);
  const canonical = `B${digits}${letters}`;
  return { canonical, typed: `b ${digits} ${letters}`, typedAgain: `B ${digits} ${letters}` };
}

interface SeededHistory {
  paidOrderId: string;
  unpaidOrderId: string;
  voidOrderId: string;
}

/**
 * WP6 owns order creation, so this spec writes the minimum rows the history
 * screen needs directly through pg: three orders (paid, completed-unpaid,
 * void), their lines, and the one payment. Product/service ids come from the
 * packages/db fixtures so the line constraints hold.
 */
async function seedPopulatedHistory(
  customer: Customer,
  vehicle: Vehicle,
): Promise<SeededHistory> {
  const client = new Client({ connectionString: databaseUrl(), connectionTimeoutMillis: 5_000 });
  const suffix = uniqueSuffix();

  async function insertOrder(input: {
    orderNumber: string;
    total: number;
    odometer: number;
    createdAt: string;
    completedAt: string;
  }): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into "orders" (
         id, business_id, outlet_id, kind, status, customer_id, vehicle_id,
         order_number, tax_rate, subtotal, discount_total, tax_total, total,
         odometer, completed_at, created_by, created_at, updated_at
       ) values (
         $1, $2, $3, 'SERVICE', 'COMPLETED', $4, $5,
         $6, 0, $7, 0, 0, $7,
         $8, $9, $10, $11, $11
       )`,
      [
        id,
        SEED_BUSINESS_ID,
        SEED_OUTLET_ID,
        customer.id,
        vehicle.id,
        input.orderNumber,
        input.total,
        input.odometer,
        input.completedAt,
        SEED_OWNER_USER_ID,
        input.createdAt,
      ],
    );
    return id;
  }

  // A PAID/VOID order and its lines are immutable, so lines and payments are
  // written while the order is still COMPLETED and the terminal state is
  // applied last — the same order of operations the API uses.
  async function finalizePaid(orderId: string, paidAt: string): Promise<void> {
    await client.query(`update "orders" set status = 'PAID', paid_at = $2 where id = $1`, [
      orderId,
      paidAt,
    ]);
  }

  async function finalizeVoid(orderId: string, voidedAt: string, voidReason: string): Promise<void> {
    await client.query(
      `update "orders" set status = 'VOID', voided_at = $2, void_reason = $3 where id = $1`,
      [orderId, voidedAt, voidReason],
    );
  }

  async function insertLine(
    orderId: string,
    input: {
      lineType: "PRODUCT" | "SERVICE";
      description: string;
      quantity: number;
      unitPrice: number;
      sortOrder: number;
    },
  ): Promise<void> {
    await client.query(
      `insert into "order_lines" (
         id, order_id, line_type, product_id, service_id, description,
         quantity, unit_price, discount_amount, tax_amount, line_total,
         sort_order, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, $9, $10, now(), now())`,
      [
        randomUUID(),
        orderId,
        input.lineType,
        input.lineType === "PRODUCT" ? SEED_PRODUCT_ID : null,
        input.lineType === "SERVICE" ? SEED_SERVICE_ID : null,
        input.description,
        input.quantity,
        input.unitPrice,
        input.quantity * input.unitPrice,
        input.sortOrder,
      ],
    );
  }

  async function insertPayment(orderId: string, amount: number, receivedAt: string): Promise<void> {
    await client.query(
      `insert into "payments" (
         id, order_id, method, amount, change_amount, received_at,
         created_by, created_at, updated_at
       ) values ($1, $2, 'CASH', $3, 0, $4, $5, $4, $4)`,
      [randomUUID(), orderId, amount, receivedAt, SEED_OWNER_USER_ID],
    );
  }

  try {
    await client.connect();

    const paidOrderId = await insertOrder({
      orderNumber: `E2E-${suffix}-1`,
      total: 300_000,
      odometer: 12_000,
      createdAt: "2026-11-20T03:00:00.000Z",
      completedAt: "2026-11-20T05:00:00.000Z",
    });
    await insertLine(paidOrderId, {
      lineType: "SERVICE",
      description: "Ganti oli mesin",
      quantity: 1,
      unitPrice: 50_000,
      sortOrder: 0,
    });
    await insertLine(paidOrderId, {
      lineType: "PRODUCT",
      description: "Kampas rem depan",
      quantity: 1,
      unitPrice: 250_000,
      sortOrder: 1,
    });
    // Three more lines exercise the collapsed "+N item lainnya" disclosure.
    for (let index = 0; index < 3; index += 1) {
      await insertLine(paidOrderId, {
        lineType: "SERVICE",
        description: `Pemeriksaan tambahan ${index + 1}`,
        quantity: 1,
        unitPrice: 0,
        sortOrder: 2 + index,
      });
    }
    await insertPayment(paidOrderId, 300_000, "2026-11-20T05:10:00.000Z");
    await finalizePaid(paidOrderId, "2026-11-20T05:10:00.000Z");

    const unpaidOrderId = await insertOrder({
      orderNumber: `E2E-${suffix}-2`,
      total: 150_000,
      odometer: 12_300,
      createdAt: "2026-11-21T03:00:00.000Z",
      completedAt: "2026-11-21T05:00:00.000Z",
    });
    await insertLine(unpaidOrderId, {
      lineType: "SERVICE",
      description: "Servis besar",
      quantity: 1,
      unitPrice: 150_000,
      sortOrder: 0,
    });

    const voidOrderId = await insertOrder({
      orderNumber: `E2E-${suffix}-3`,
      total: 90_000,
      odometer: 12_300,
      createdAt: "2026-11-22T03:00:00.000Z",
      completedAt: "2026-11-22T03:30:00.000Z",
    });
    await insertLine(voidOrderId, {
      lineType: "SERVICE",
      description: "Servis dibatalkan",
      quantity: 1,
      unitPrice: 90_000,
      sortOrder: 0,
    });
    await finalizeVoid(
      voidOrderId,
      "2026-11-22T04:00:00.000Z",
      "Pelanggan membatalkan servis",
    );

    return { paidOrderId, unpaidOrderId, voidOrderId };
  } finally {
    await client.end().catch(() => undefined);
  }
}

test.describe("customer and vehicle screens", () => {
  test("owner creates a customer and a vehicle, reuses a duplicate plate, then exports and anonymizes", async ({
    page,
    context,
  }) => {
    await signInWithApi(context, "owner");
    const suffix = uniqueSuffix();
    const customerName = `Pelanggan E2E ${suffix}`;
    const phone = uniquePhone();
    const plate = uniquePlate();
    const vin = "MH1JF5130MK000001";
    const vehicleNotes = "Servis rutin pemilik.";

    // --- Customer -----------------------------------------------------------
    await page.goto("/customers");
    await expect(page.getByRole("heading", { level: 1, name: "Pelanggan" })).toBeVisible();
    await expect(page.locator("table caption")).toContainText("Daftar pelanggan");

    await page.getByRole("button", { name: "Tambah pelanggan" }).click();
    const customerDialog = page.getByRole("dialog", { name: "Pelanggan baru" });
    await expect(customerDialog).toBeVisible();
    await expect(customerDialog.getByText("Jangan masukkan data pribadi yang tidak diperlukan.")).toBeVisible();

    const saveCustomer = customerDialog.getByRole("button", { name: "Simpan pelanggan" });
    await expect(saveCustomer).toBeDisabled();
    await expect(
      customerDialog.getByText("Lengkapi nama dan nomor HP untuk menyimpan."),
    ).toBeVisible();

    await customerDialog.getByLabel("Nama pelanggan").fill(customerName);
    await customerDialog.getByLabel("Nomor HP").fill(phone);
    await saveCustomer.click();

    await expect(page.getByRole("status").filter({ hasText: `Pelanggan ${customerName} dibuat.` })).toBeVisible();

    await page.goto(`/customers?q=${encodeURIComponent(customerName)}`);
    const customerRow = page.getByRole("row", { name: new RegExp(customerName) });
    await expect(customerRow).toBeVisible();
    await expect(customerRow).toContainText(maskPhone(phone));
    expect(await page.content()).not.toContain(phone);

    // Phone search finds the record while the result stays masked.
    await page.goto(`/customers?q=${encodeURIComponent(phone)}`);
    await expect(page.getByRole("row", { name: new RegExp(customerName) })).toBeVisible();

    // The full phone appears only inside the edit dialog, not in the list.
    await page.goto(`/customers?q=${encodeURIComponent(customerName)}`);
    const editCustomerTrigger = page.getByRole("button", { name: `Ubah ${customerName}` });
    await editCustomerTrigger.click();
    const editCustomerDialog = page.getByRole("dialog", { name: `Ubah ${customerName}` });
    await expect(editCustomerDialog).toBeVisible();
    await expect(editCustomerDialog.getByLabel("Nomor HP")).toHaveValue(phone);
    await expect(editCustomerDialog.getByText("Nomor HP wajib diisi.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editCustomerDialog).toHaveCount(0);
    await expect(editCustomerTrigger).toBeFocused();

    // --- Vehicle ------------------------------------------------------------
    await page.goto("/vehicles");
    await expect(page.getByRole("heading", { level: 1, name: "Kendaraan" })).toBeVisible();
    await page.getByRole("button", { name: "Tambah kendaraan" }).click();
    const vehicleDialog = page.getByRole("dialog", { name: "Kendaraan baru" });
    await expect(vehicleDialog).toBeVisible();

    const saveVehicle = vehicleDialog.getByRole("button", { name: "Simpan kendaraan" });
    await expect(saveVehicle).toBeDisabled();
    await expect(
      vehicleDialog.getByText("Lengkapi nomor polisi, merek, model, dan pelanggan untuk menyimpan."),
    ).toBeVisible();

    await vehicleDialog.getByLabel("Nomor polisi").fill(plate.typed);
    await expect(vehicleDialog.getByText(`Bentuk tersimpan: ${plate.canonical}`)).toBeVisible();
    await vehicleDialog.getByLabel("Merek").fill("Honda");
    await vehicleDialog.getByLabel("Model").fill("Beat");
    await vehicleDialog.getByLabel("Odometer (km, opsional)").fill("12000");
    await vehicleDialog.getByLabel("Nomor rangka (opsional)").fill(vin);
    await vehicleDialog.getByLabel("Catatan (opsional)").fill(vehicleNotes);

    // A dirty draft is never discarded by the picker's "Tambah pelanggan"
    // shortcut; the guard asks first and "Tetap di sini" keeps the draft.
    await vehicleDialog.getByRole("button", { name: "Tambah pelanggan" }).click();
    const pickerDiscard = page.getByRole("dialog", { name: "Buang perubahan?" });
    await expect(pickerDiscard).toBeVisible();
    await pickerDiscard.getByRole("button", { name: "Tetap di sini" }).click();
    await expect(pickerDiscard).toHaveCount(0);
    await expect(vehicleDialog).toBeVisible();
    await expect(vehicleDialog.getByLabel("Nomor polisi")).toHaveValue(plate.typed.toUpperCase());

    await vehicleDialog.getByLabel("Cari pelanggan").fill(customerName);
    await vehicleDialog.getByRole("button", { name: "Cari", exact: true }).click();
    await expect(vehicleDialog.getByText("Menampilkan 1 dari 1 pelanggan.")).toBeVisible();
    await vehicleDialog.getByRole("radio", { name: new RegExp(customerName) }).check();

    await saveVehicle.click();
    await expect(
      page.getByRole("status").filter({ hasText: `Kendaraan ${plate.canonical} dibuat.` }),
    ).toBeVisible();

    await page.goto(`/vehicles?q=${encodeURIComponent(plate.canonical)}`);
    const vehicleRow = page.getByRole("row", { name: new RegExp(plate.canonical) });
    await expect(vehicleRow).toBeVisible();
    await expect(vehicleRow).toContainText("Honda Beat");
    await expect(vehicleRow).toContainText(customerName);
    await expect(page.getByRole("columnheader", { name: "Plat" })).toBeVisible();

    // --- Duplicate plate is reused, never duplicated ------------------------
    await page.getByRole("button", { name: "Tambah kendaraan" }).click();
    const duplicateDialog = page.getByRole("dialog", { name: "Kendaraan baru" });
    await duplicateDialog.getByLabel("Nomor polisi").fill(plate.typedAgain);
    await duplicateDialog.getByLabel("Merek").fill("Honda");
    await duplicateDialog.getByLabel("Model").fill("Beat");
    await duplicateDialog.getByLabel("Cari pelanggan").fill(customerName);
    await duplicateDialog.getByRole("button", { name: "Cari", exact: true }).click();
    await duplicateDialog.getByRole("radio", { name: new RegExp(customerName) }).check();
    await duplicateDialog.getByRole("button", { name: "Simpan kendaraan" }).click();

    await expect(
      duplicateDialog.getByText("Kendaraan dengan plat ini sudah ada dan digunakan kembali."),
    ).toBeVisible();
    await expect(
      duplicateDialog.getByText(`Kendaraan ini terdaftar atas nama ${customerName}.`),
    ).toBeVisible();
    await expect(duplicateDialog.getByText("Pelanggan berbeda.")).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: `Kendaraan ${plate.canonical} dibuat.` }),
    ).toHaveCount(0);

    // The reuse notice's navigation is guarded too: it must not throw away the
    // draft it was rendered next to.
    await duplicateDialog.getByRole("button", { name: `Buka kendaraan ${plate.canonical}` }).click();
    const reuseDiscard = page.getByRole("dialog", { name: "Buang perubahan?" });
    await expect(reuseDiscard).toBeVisible();
    await reuseDiscard.getByRole("button", { name: "Tetap di sini" }).click();
    await expect(reuseDiscard).toHaveCount(0);
    await expect(duplicateDialog).toBeVisible();

    await duplicateDialog.getByRole("button", { name: "Tutup dialog" }).click();
    const discard = page.getByRole("dialog", { name: "Buang perubahan?" });
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "Buang perubahan" }).click();
    await expect(duplicateDialog).toHaveCount(0);
    await expect(page.getByRole("row", { name: new RegExp(plate.canonical) })).toHaveCount(1);

    // Editing the vehicle reads the full record first, so saving the odometer
    // never wipes the VIN and notes the list row no longer carries.
    await page.getByRole("button", { name: `Ubah ${plate.canonical}` }).click();
    const editVehicleDialog = page.getByRole("dialog", { name: `Ubah ${plate.canonical}` });
    await expect(editVehicleDialog).toBeVisible();
    await expect(editVehicleDialog.getByLabel("Nomor rangka (opsional)")).toHaveValue(vin);
    await expect(editVehicleDialog.getByLabel("Catatan (opsional)")).toHaveValue(vehicleNotes);
    await editVehicleDialog.getByLabel("Odometer (km, opsional)").fill("13000");
    await editVehicleDialog.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: `Kendaraan ${plate.canonical} diperbarui.` }),
    ).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(plate.canonical) })).toContainText("13.000 km");

    const vehicleId = await findVehicleIdViaApi(context.request, plate.canonical);
    const detailResponse = await context.request.get(`/api/v1/vehicles/${vehicleId}`);
    expect(detailResponse.status(), await detailResponse.text()).toBe(200);
    const detailBody = (await detailResponse.json()) as { item?: unknown };
    const detail = vehicleSchema.safeParse(detailBody.item);
    if (!detail.success) throw new Error(`Unexpected vehicle detail payload: ${detail.error.message}`);
    expect(detail.data.vin).toBe(vin);
    expect(detail.data.notes).toBe(vehicleNotes);
    expect(detail.data.odometer).toBe(13_000);

    // --- Read-only history with honest totals -------------------------------
    await page.getByRole("link", { name: `Buka riwayat ${plate.canonical}` }).click();
    await expect(page.getByRole("heading", { level: 1, name: plate.canonical })).toBeVisible();
    await expect(
      page.getByText("Riwayat hanya-baca sampai modul transaksi tersedia.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Menampilkan riwayat semua outlet.")).toBeVisible();
    await expect(page.getByText("Belum ada riwayat untuk plat ini.")).toBeVisible();
    await expect(page.getByText("Total belanja")).toBeVisible();
    await expect(page.getByText(/Rp\s0/).first()).toBeVisible();
    await page.getByRole("link", { name: "Kembali ke daftar" }).click();
    await expect(page).toHaveURL(/\/vehicles$/);

    // --- Personal data: export then anonymize, both behind one row action ---
    await page.goto(`/customers?q=${encodeURIComponent(customerName)}`);
    const editRow = page.getByRole("row", { name: new RegExp(customerName) });
    await expect(editRow.locator(".bo-icon-button")).toHaveCount(2);

    await editRow.getByRole("button", { name: `Data pribadi ${customerName}` }).click();
    const personalDialog = page.getByRole("dialog", { name: `Data pribadi ${customerName}` });
    await expect(personalDialog).toBeVisible();
    await expect(personalDialog.getByRole("button", { name: "Anonimkan data" })).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      personalDialog.getByRole("button", { name: "Ekspor data" }).click(),
    ]);
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^pelanggan-[0-9a-f-]{36}\.json$/);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const exported = JSON.parse(readFileSync(downloadPath!, "utf8")) as {
      formatVersion: number;
      customer: { name: string; phone: string };
    };
    expect(exported.formatVersion).toBe(1);
    expect(exported.customer.name).toBe(customerName);
    expect(exported.customer.phone).toBe(phone);
    // A successful export closes the modal so the confirmation toast, which
    // lives outside it, is actually announced.
    await expect(personalDialog).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: `Data pribadi pelanggan diekspor ke ${filename}.` }),
    ).toBeVisible();

    await editRow.getByRole("button", { name: `Data pribadi ${customerName}` }).click();
    await expect(personalDialog).toBeVisible();
    await personalDialog.getByRole("button", { name: "Anonimkan data" }).click();
    const anonymizeDialog = page.getByRole("dialog", { name: `Anonimkan ${customerName}?` });
    await expect(anonymizeDialog).toBeVisible();
    await expect(anonymizeDialog.getByRole("button", { name: "Batal" })).toBeFocused();
    await expect(
      anonymizeDialog.getByText("Nama, nomor HP, alamat, dan catatan pelanggan dihapus permanen."),
    ).toBeVisible();
    await expect(
      anonymizeDialog.getByText("Riwayat keuangan dan jejak audit tetap tersimpan."),
    ).toBeVisible();

    const confirmAnonymize = anonymizeDialog.getByRole("button", { name: "Anonimkan pelanggan" });
    await expect(confirmAnonymize).toBeDisabled();
    await expect(
      anonymizeDialog.getByText("Isi alasan minimal 10 karakter untuk menganonimkan pelanggan."),
    ).toBeVisible();
    const reason = "Permintaan pelanggan melalui telepon.";
    await anonymizeDialog.getByLabel("Alasan anonimisasi").fill(reason);

    // Escape on a filled destructive form asks before discarding the reason.
    await page.keyboard.press("Escape");
    const anonymizeDiscard = page.getByRole("dialog", { name: "Buang perubahan?" });
    await expect(anonymizeDiscard).toBeVisible();
    await anonymizeDiscard.getByRole("button", { name: "Tetap di sini" }).click();
    await expect(anonymizeDialog).toBeVisible();
    await expect(anonymizeDialog.getByLabel("Alasan anonimisasi")).toHaveValue(reason);

    await confirmAnonymize.click();

    // The confirmation never repeats the erased name.
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Data pribadi pelanggan dianonimkan. Nama, nomor HP, alamat, dan catatan dihapus.",
      }),
    ).toBeVisible();

    await page.goto("/customers?q=Pelanggan%20dianonimkan");
    const anonymizedRow = page.getByRole("row", { name: /Pelanggan dianonimkan/ }).first();
    await expect(anonymizedRow).toBeVisible();
    await expect(anonymizedRow).toContainText("Dianonimkan");
    await expect(anonymizedRow).toContainText("—");
    await expect(
      page.getByRole("button", { name: `Ubah ${ANONYMIZED_CUSTOMER_NAME}` }),
    ).toHaveCount(0);
    const anonymizedHtml = await page.content();
    expect(anonymizedHtml).not.toContain(customerName);
    expect(anonymizedHtml).not.toContain(phone);
    expect(anonymizedHtml).not.toContain(maskPhone(phone));

    // Export stays available after anonymization; anonymization does not.
    await page
      .getByRole("button", { name: `Data pribadi ${ANONYMIZED_CUSTOMER_NAME}` })
      .first()
      .click();
    const anonymizedPersonalDialog = page.getByRole("dialog", {
      name: `Data pribadi ${ANONYMIZED_CUSTOMER_NAME}`,
    });
    await expect(anonymizedPersonalDialog).toBeVisible();
    await expect(anonymizedPersonalDialog.getByRole("button", { name: "Ekspor data" })).toBeEnabled();
    const disabledAnonymize = anonymizedPersonalDialog.getByRole("button", { name: "Anonimkan data" });
    await expect(disabledAnonymize).toBeDisabled();
    await expect(
      anonymizedPersonalDialog.getByText(
        "Pelanggan ini sudah dianonimkan. Nama, nomor HP, alamat, dan catatan sudah dihapus; ekspor tetap tersedia.",
      ),
    ).toBeVisible();
    await expect(disabledAnonymize).toHaveAttribute(
      "aria-describedby",
      "customer-personal-data-anonymized",
    );
    await anonymizedPersonalDialog.getByRole("button", { name: "Tutup dialog" }).click();
    await expect(anonymizedPersonalDialog).toHaveCount(0);
  });

  test("customer drill-down filters vehicles and out-of-range pages stay honest", async ({
    page,
    context,
  }) => {
    await signInWithApi(context, "owner");
    const customer = await createCustomerViaApi(context.request, {
      name: `Pelanggan drilldown E2E ${uniqueSuffix()}`,
    });
    const plate = uniquePlate().canonical;
    await createVehicleViaApi(context.request, { plate, customerId: customer.id });

    // A duplicate plate selected under another customer says so explicitly:
    // the reused record belongs to someone else, not to the picker choice.
    const otherCustomer = await createCustomerViaApi(context.request, {
      name: `Pelanggan lain E2E ${uniqueSuffix()}`,
    });
    await page.goto("/vehicles");
    await page.getByRole("button", { name: "Tambah kendaraan" }).click();
    const conflictDialog = page.getByRole("dialog", { name: "Kendaraan baru" });
    await conflictDialog.getByLabel("Nomor polisi").fill(plate);
    await conflictDialog.getByLabel("Merek").fill("Honda");
    await conflictDialog.getByLabel("Model").fill("Beat");
    await conflictDialog.getByLabel("Cari pelanggan").fill(otherCustomer.name);
    await conflictDialog.getByRole("button", { name: "Cari", exact: true }).click();
    await conflictDialog.getByRole("radio", { name: new RegExp(otherCustomer.name) }).check();
    await conflictDialog.getByRole("button", { name: "Simpan kendaraan" }).click();

    await expect(conflictDialog.getByText("Pelanggan berbeda.")).toBeVisible();
    await expect(
      conflictDialog.getByText(`Anda memilih ${otherCustomer.name}, bukan ${customer.name}.`),
    ).toBeVisible();
    await expect(
      conflictDialog.getByText(`Kendaraan ini terdaftar atas nama ${customer.name}.`),
    ).toBeVisible();

    await conflictDialog.getByRole("button", { name: "Tutup dialog" }).click();
    await page
      .getByRole("dialog", { name: "Buang perubahan?" })
      .getByRole("button", { name: "Buang perubahan" })
      .click();
    await expect(conflictDialog).toHaveCount(0);

    await page.goto(`/customers?q=${encodeURIComponent(customer.name)}`);
    const customerRow = page.getByRole("row", { name: new RegExp(customer.name) });
    await expect(customerRow).toBeVisible();
    await customerRow.getByRole("link", { name: `Lihat kendaraan ${customer.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`/vehicles\\?customerId=${customer.id}`));
    await expect(page.getByText("Hanya kendaraan milik satu pelanggan")).toBeVisible();
    await expect(page.getByRole("link", { name: "Hapus filter pelanggan" })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(plate) })).toBeVisible();

    await page.getByRole("link", { name: "Hapus filter pelanggan" }).click();
    await expect(page.getByText("Hanya kendaraan milik satu pelanggan")).toHaveCount(0);
    await expect(page).toHaveURL(/\/vehicles$/);

    // A page past the end says the rows are elsewhere, not that the list is empty.
    await page.goto(`/customers?q=${encodeURIComponent(customer.name)}&page=9`);
    await expect(page.getByText("Halaman ini tidak berisi pelanggan.")).toBeVisible();
    await expect(page.getByText("Menampilkan 1–1 dari 1 pelanggan")).toBeVisible();
    await expect(page.getByText("Belum ada pelanggan.")).toHaveCount(0);
    await page.getByRole("link", { name: "Ke halaman pertama" }).click();
    await expect(page.getByRole("row", { name: new RegExp(customer.name) })).toBeVisible();

    await page.goto(`/vehicles?q=${encodeURIComponent(plate)}&page=4`);
    await expect(page.getByText("Halaman ini tidak berisi kendaraan.")).toBeVisible();
    await expect(page.getByText("Menampilkan 1–1 dari 1 kendaraan")).toBeVisible();
    await expect(page.getByText("Belum ada kendaraan.")).toHaveCount(0);
  });

  test("cashier cannot export or anonymize personal data", async ({ page, context, browser }) => {
    const ownerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    await signInWithApi(ownerContext, "owner");
    const customer = await createCustomerViaApi(ownerContext.request, {
      name: `Pelanggan kasir E2E ${uniqueSuffix()}`,
    });
    await ownerContext.close();

    await signInWithApi(context, "cashier");
    await page.goto(`/customers?q=${encodeURIComponent(customer.name)}`);

    const row = page.getByRole("row", { name: new RegExp(customer.name) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: `Ubah ${customer.name}` })).toBeVisible();
    await expect(page.getByRole("button", { name: `Data pribadi ${customer.name}` })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Ekspor data/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Anonimkan/ })).toHaveCount(0);
    await expect(
      page.getByText("Ekspor dan anonimisasi data pribadi hanya dapat dilakukan oleh Pemilik."),
    ).toBeVisible();

    const denied = await context.request.post(`/api/v1/customers/${customer.id}/anonymize`, {
      data: { reason: "Kasir tidak berwenang menganonimkan pelanggan." },
    });
    expect(denied.status()).toBe(403);
  });

  test("unknown or malformed vehicle ids show an honest not-found state", async ({ page, context }) => {
    await signInWithApi(context, "owner");

    for (const path of [
      "/vehicles/00000000-0000-4000-8000-000000000000",
      "/vehicles/bukan-uuid",
    ]) {
      await page.goto(path);
      await expect(page.getByText("Kendaraan tidak ditemukan.")).toBeVisible();
      await expect(page.getByText("Riwayat gagal dimuat.")).toHaveCount(0);
      await expect(page.getByText("Sisa tagihan")).toHaveCount(0);
    }
  });

  test("populated history renders at every width and stays honest past the last page", async ({
    page,
    context,
  }) => {
    await signInWithApi(context, "owner");
    const suffix = uniqueSuffix();
    const customer = await createCustomerViaApi(context.request, {
      name: `Pelanggan viewport E2E ${suffix}`,
    });
    const plate = uniquePlate().canonical;
    const vehicle = await createVehicleViaApi(context.request, {
      plate,
      customerId: customer.id,
    });
    await seedPopulatedHistory(customer, vehicle);

    const outOfRangePath = `/vehicles/${vehicle.id}?page=9`;
    await page.goto(outOfRangePath);
    await expect(page.getByText("Halaman ini tidak berisi transaksi.")).toBeVisible();
    await expect(page.getByText("Riwayat berisi 3 transaksi.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigasi halaman" })).toBeVisible();
    await expect(page.getByText("Belum ada riwayat untuk plat ini.")).toHaveCount(0);

    mkdirSync("test-results/design-qa", { recursive: true });

    const pages = [
      { name: "customers", path: "/customers", heading: "Pelanggan", loaded: "caption" },
      { name: "vehicles", path: "/vehicles", heading: "Kendaraan", loaded: "caption" },
      { name: "vehicle-history", path: `/vehicles/${vehicle.id}`, heading: plate, loaded: "history" },
    ] as const;

    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const target of pages) {
        await page.goto(target.path);
        await expect(page.getByRole("heading", { level: 1, name: target.heading })).toBeVisible();
        if (target.loaded === "caption") {
          await expect(page.locator("table caption")).toBeVisible();
        } else {
          await expect(page.getByRole("heading", { name: "Ringkasan kunjungan" })).toBeVisible();
        }
        await expectNoHorizontalOverflow(page);

        if (width === 320 && target.name === "vehicle-history") {
          await expect(page.getByText("Lunas", { exact: true })).toBeVisible();
          await expect(page.getByText("Belum lunas", { exact: true })).toBeVisible();
          await expect(page.getByText("Dibatalkan", { exact: true })).toBeVisible();
          await expect(page.getByText("+2 item lainnya")).toBeVisible();
        }

        await page.screenshot({
          path: `test-results/design-qa/${width}-${target.name}.png`,
          fullPage: true,
        });
      }
    }
  });
});
