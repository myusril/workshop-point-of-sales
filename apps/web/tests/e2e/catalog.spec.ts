import { expect, test, type APIRequestContext } from "@playwright/test";
import { productResponseSchema, type ProductItem } from "@workshop-pos/contracts";
import { Client } from "pg";

import { databaseUrl, uniqueSuffix } from "./env";
import { expectNoHorizontalOverflow, signInWithApi } from "./helpers";

interface ProductInput {
  sku?: string;
  name?: string;
  unit?: string;
  cost?: string;
  price?: string;
  lowStockThreshold?: number | null;
  openingStock?: number;
}

async function createProductViaApi(request: APIRequestContext, overrides: ProductInput = {}): Promise<ProductItem> {
  const suffix = uniqueSuffix().toUpperCase();
  const response = await request.post("/api/v1/catalog/products", {
    data: {
      sku: `E2E-${suffix}`.slice(0, 32),
      name: `Produk E2E ${suffix}`,
      unit: "pcs",
      cost: "50000",
      price: "75000",
      lowStockThreshold: 5,
      openingStock: 0,
      ...overrides,
    },
  });

  expect(response.status(), await response.text()).toBe(201);
  const parsed = productResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`Unexpected product payload: ${parsed.error.message}`);
  }
  return parsed.data.item;
}

test.describe("catalog screen", () => {
  test.beforeEach(async ({ context }) => {
    await signInWithApi(context, "owner");
  });

  test("owner creates a product and a service, then edits price and cost", async ({ page }) => {
    const suffix = uniqueSuffix().toUpperCase();
    const sku = `E2E-${suffix}`.slice(0, 32);
    const productName = `Kampas rem E2E ${suffix}`;
    const serviceCode = `JSA-${suffix}`.slice(0, 32);
    const serviceName = `Servis berkala E2E ${suffix}`;

    await page.goto("/catalog");
    await expect(page.getByRole("heading", { level: 1, name: "Produk & Jasa" })).toBeVisible();
    await expect(page.locator("table caption")).toContainText("Daftar produk dan jasa");

    // Create product. The submit button starts disabled with a visible reason.
    await page.getByRole("button", { name: "Produk baru" }).click();
    const productDialog = page.getByRole("dialog", { name: "Produk baru" });
    await expect(productDialog).toBeVisible();

    const saveProduct = productDialog.getByRole("button", { name: "Simpan produk" });
    await expect(saveProduct).toBeDisabled();
    await expect(productDialog.getByText("Lengkapi SKU, nama, biaya, dan harga untuk menyimpan.")).toBeVisible();

    await productDialog.getByLabel("SKU").fill(sku);
    await productDialog.getByLabel("Nama produk").fill(productName);
    await productDialog.getByLabel("Satuan").fill("pcs");
    await productDialog.getByLabel("Biaya modal").fill("50000");
    await productDialog.getByLabel("Harga jual").fill("75000");
    await productDialog.getByLabel("Batas stok menipis").fill("2");
    await productDialog.getByLabel("Stok awal", { exact: true }).fill("5");
    await saveProduct.click();

    await expect(page.getByRole("status").filter({ hasText: `Produk ${productName} dibuat.` })).toBeVisible();
    const productRow = page.getByRole("row", { name: new RegExp(productName) });
    await expect(productRow).toBeVisible();
    await expect(productRow).toContainText("75.000");
    await expect(productRow).toContainText("50.000");
    await expect(productRow).toContainText("5");

    // Escape closes the next dialog and focus returns to its trigger.
    const editTrigger = productRow.getByRole("button", { name: `Ubah ${productName}` });
    await editTrigger.click();
    const editDialog = page.getByRole("dialog", { name: `Ubah ${productName}` });
    await expect(editDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editDialog).toHaveCount(0);
    await expect(editTrigger).toBeFocused();

    await editTrigger.click();
    await editDialog.getByLabel("Harga jual").fill("210000");
    await editDialog.getByLabel("Biaya modal").fill("130000");
    await editDialog.getByRole("button", { name: "Simpan perubahan" }).click();

    await expect(page.getByRole("status").filter({ hasText: `Produk ${productName} diperbarui.` })).toBeVisible();
    await expect(productRow).toContainText("210.000");
    await expect(productRow).toContainText("130.000");

    // Create service.
    await page.getByRole("button", { name: "Jasa baru" }).click();
    const serviceDialog = page.getByRole("dialog", { name: "Jasa baru" });
    await expect(serviceDialog).toBeVisible();
    await serviceDialog.getByLabel("Kode jasa").fill(serviceCode);
    await serviceDialog.getByLabel("Nama jasa").fill(serviceName);
    await serviceDialog.getByLabel("Harga jasa").fill("150000");
    await serviceDialog.getByLabel("Durasi (menit)").fill("60");
    await serviceDialog.getByRole("button", { name: "Simpan jasa" }).click();

    await expect(page.getByRole("status").filter({ hasText: `Jasa ${serviceName} dibuat.` })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(serviceName) })).toContainText("150.000");

    // Sorting is URL-backed and exposes aria-sort on the header cell.
    await page.goto(`/catalog?q=${encodeURIComponent(productName)}`);
    const nameHeader = page.getByRole("columnheader", { name: /Nama/ });
    await expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    await page.getByRole("link", { name: /^Nama / }).click();
    await expect(page).toHaveURL(/sort=name/);
    await expect(page).toHaveURL(/dir=desc/);
    await expect(page.getByRole("columnheader", { name: /Nama/ })).toHaveAttribute("aria-sort", "descending");
  });

  test("keyboard: filters, money fields, and unsaved changes stay operable", async ({ page }) => {
    await page.goto("/catalog");
    await page.getByRole("button", { name: "Produk baru" }).click();
    const createDialog = page.getByRole("dialog", { name: "Produk baru" });
    await createDialog.getByLabel("Nama produk").fill("Draf E2E belum disimpan");

    await page.keyboard.press("Escape");
    const discard = page.getByRole("dialog", { name: "Buang perubahan?" });
    await expect(discard).toBeVisible();
    await expect(discard.getByRole("button", { name: "Tetap di sini" })).toBeFocused();
    await discard.getByRole("button", { name: "Tetap di sini" }).click();
    await expect(createDialog).toBeVisible();
    await expect(createDialog.getByLabel("Nama produk")).toHaveValue("Draf E2E belum disimpan");

    await createDialog.getByRole("button", { name: "Batal" }).click();
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "Buang perubahan" }).click();
    await expect(createDialog).toHaveCount(0);

    // A filled money field must not bounce Tab to the dialog container.
    const suffix = uniqueSuffix().toUpperCase();
    const product = await createProductViaApi(page.request, {
      sku: `TAB-${suffix}`.slice(0, 32),
      name: `Produk tab E2E ${suffix}`,
      openingStock: 0,
    });
    await page.goto("/catalog");
    const row = page.getByRole("row", { name: new RegExp(product.name) });
    await row.getByRole("button", { name: `Ubah ${product.name}` }).click();
    const editDialog = page.getByRole("dialog", { name: `Ubah ${product.name}` });
    await editDialog.getByLabel("Harga jual").fill("99000");
    await page.keyboard.press("Tab");
    await expect(editDialog.getByLabel("Batas stok menipis")).toBeFocused();
  });

  test("filtered empty state echoes the query and offers a reset", async ({ page }) => {
    const query = `tidak-ada-${uniqueSuffix()}`;
    await page.goto(`/catalog?q=${encodeURIComponent(query)}`);

    const empty = page.getByText(`Tidak ada hasil untuk "${query}".`);
    await expect(empty).toBeVisible();
    await expect(page.getByText(/Hapus filter atau coba kata kunci lain/)).toBeVisible();
    await page.getByRole("link", { name: "Hapus semua filter" }).click();
    await expect(page).toHaveURL(/\/catalog$/);
  });

  test("a failed create reports the error inside the dialog and keeps the input", async ({ page }) => {
    const suffix = uniqueSuffix().toUpperCase();
    await page.route("**/api/v1/catalog/services", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL", message: "Terjadi kesalahan pada server." } }),
      }),
    );

    await page.goto("/catalog");
    await page.getByRole("button", { name: "Jasa baru" }).click();
    const dialog = page.getByRole("dialog", { name: "Jasa baru" });
    await dialog.getByLabel("Kode jasa").fill(`ERR-${suffix}`.slice(0, 32));
    await dialog.getByLabel("Nama jasa").fill(`Jasa gagal E2E ${suffix}`);
    await dialog.getByLabel("Harga jasa").fill("10000");
    await dialog.getByLabel("Durasi (menit)").fill("30");
    await dialog.getByRole("button", { name: "Simpan jasa" }).click();

    await expect(dialog.getByRole("alert")).toContainText("Terjadi kesalahan pada server.");
    await expect(dialog.getByLabel("Nama jasa")).toHaveValue(`Jasa gagal E2E ${suffix}`);
    await page.unroute("**/api/v1/catalog/services");
  });

  test("keyboard: skip link is first and points at the content target", async ({ page }) => {
    await page.goto("/catalog");
    await page.keyboard.press("Tab");

    const skipLink = page.getByRole("link", { name: "Lewati ke konten utama" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveAttribute("href", "#konten-utama");
    await skipLink.press("Enter");
    await expect(page).toHaveURL(/#konten-utama$/);
  });

  test("no page overflow at 320, 390, 768, 1024, and 1440", async ({ page }) => {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/catalog");
      await expect(page.getByRole("heading", { level: 1, name: "Produk & Jasa" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});

test.describe("catalog permissions", () => {
  test("cashier has no cost data, no cost column, and no mutation controls", async ({ browser, context, page }) => {
    const ownerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    await signInWithApi(ownerContext, "owner");
    const suffix = uniqueSuffix().toUpperCase();
    const secretCost = "654321";
    const name = `Rahasia biaya E2E ${suffix}`;
    await createProductViaApi(ownerContext.request, {
      name,
      sku: `CSH-${suffix}`.slice(0, 32),
      cost: secretCost,
      price: "900000",
    });
    await ownerContext.close();

    await signInWithApi(context, "cashier");
    await page.goto(`/catalog?q=${encodeURIComponent(name)}`);
    await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Biaya", exact: true })).toHaveCount(0);
    expect(await page.content()).not.toContain("654.321");
    await expect(page.getByRole("button", { name: "Produk baru" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Ubah / })).toHaveCount(0);
    await expect(page.getByText(/Hanya Admin atau Pemilik yang dapat membuat atau mengubah/)).toBeVisible();

    const denied = await context.request.post("/api/v1/catalog/products", {
      data: {
        sku: `DENY-${suffix}`.slice(0, 32),
        name: `Tidak boleh ${suffix}`,
        unit: "pcs",
        cost: "1000",
        price: "2000",
      },
    });
    expect(denied.status()).toBe(403);

    const deniedStock = await context.request.post("/api/v1/inventory/stock-in", {
      data: {
        productId: "00000000-0000-4000-8000-000000000000",
        quantity: 1,
      },
    });
    expect(deniedStock.status()).toBe(403);

    const client = new Client({ connectionString: databaseUrl() });
    await client.connect();
    try {
      const audit = await client.query(
        `select distinct entity_id from audit_log
          where action = 'rbac.denied'
            and entity_id in ('/api/v1/catalog/products', '/api/v1/inventory/stock-in')`,
      );
      expect(audit.rows.map((row) => row.entity_id).sort()).toEqual([
        "/api/v1/catalog/products",
        "/api/v1/inventory/stock-in",
      ]);
    } finally {
      await client.end();
    }
  });

  test("cashier cannot open the inventory screen", async ({ context, page }) => {
    await signInWithApi(context, "cashier");
    const response = await page.goto("/inventory");

    expect(response?.status()).toBe(403);
    await expect(page.getByText("Hanya Admin atau Pemilik yang dapat menyesuaikan stok.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("cashier catalog has no overflow at 320 and 390", async ({ context, page }) => {
    await signInWithApi(context, "cashier");
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/catalog");
      await expect(page.getByRole("heading", { level: 1, name: "Produk & Jasa" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});
