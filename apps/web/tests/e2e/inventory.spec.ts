import { expect, test, type APIRequestContext } from "@playwright/test";
import { productResponseSchema, type ProductItem } from "@workshop-pos/contracts";

import { uniqueSuffix } from "./env";
import { expectNoHorizontalOverflow, signInWithApi } from "./helpers";

async function createProductViaApi(
  request: APIRequestContext,
  overrides: { lowStockThreshold?: number | null; openingStock?: number; name?: string } = {},
): Promise<ProductItem> {
  const suffix = uniqueSuffix().toUpperCase();
  const response = await request.post("/api/v1/catalog/products", {
    data: {
      sku: `INV-${suffix}`.slice(0, 32),
      name: overrides.name ?? `Produk stok E2E ${suffix}`,
      unit: "pcs",
      cost: "10000",
      price: "20000",
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

test.describe("inventory screen", () => {
  test.beforeEach(async ({ context }) => {
    await signInWithApi(context, "owner");
  });

  test("records stock-in, adjustment, low stock, and a negative override", async ({ context, page }) => {
    const product = await createProductViaApi(context.request, { lowStockThreshold: 5 });

    await page.goto("/inventory");
    await expect(page.getByRole("heading", { level: 1, name: "Stok" })).toBeVisible();

    // Stock-in with a live preview and a server-confirmed result.
    const stockIn = page.getByRole("region", { name: "Stok masuk" });
    await stockIn.getByLabel("Produk").selectOption(product.id);
    await stockIn.getByLabel("Jumlah masuk").fill("4");
    await expect(stockIn.getByText(/Stok saat ini 0 → Stok setelah 4/)).toBeVisible();
    await stockIn.getByRole("button", { name: "Simpan stok masuk" }).click();
    await expect(stockIn.getByRole("status")).toContainText("Stok diperbarui: 0 → 4.");

    // Adjustment with a mandatory reason and a signed quantity.
    const adjustment = page.getByRole("region", { name: "Penyesuaian stok" });
    const saveAdjustment = adjustment.getByRole("button", { name: "Simpan penyesuaian" });
    await expect(saveAdjustment).toBeDisabled();
    await adjustment.getByLabel("Produk").selectOption(product.id);
    await adjustment.getByLabel("Jumlah penyesuaian").fill("-2");
    await expect(adjustment.getByLabel("Alasan")).toBeVisible();
    await expect(saveAdjustment).toBeDisabled();
    await adjustment.getByLabel("Alasan").fill("Hitung ulang rak gudang");
    await expect(adjustment.getByText(/Stok saat ini 4 → Stok setelah 2/)).toBeVisible();
    await saveAdjustment.click();
    await expect(adjustment.getByRole("status")).toContainText("Stok diperbarui: 4 → 2.");

    // Low stock shows the shortfall for the threshold.
    const lowStock = page.getByRole("region", { name: "Stok menipis" });
    const lowStockItem = lowStock.getByRole("listitem").filter({ hasText: product.name });
    await expect(lowStockItem).toContainText("Kurangi 3 unit");

    // The ledger is append-only and carries actor, reason, and source.
    const ledger = page.getByRole("region", { name: "Buku besar stok" });
    const ledgerTable = ledger.getByRole("table");
    const productRows = ledgerTable.getByRole("row").filter({ hasText: product.sku });
    await expect(productRows).toHaveCount(2);
    await expect(ledgerTable.getByText("Stok masuk").first()).toBeVisible();
    await expect(ledgerTable.getByText("Penyesuaian").first()).toBeVisible();
    await expect(ledgerTable.getByText("Rina Wijaya").first()).toBeVisible();
    await expect(ledgerTable.getByText("Hitung ulang rak gudang")).toBeVisible();
    await expect(ledger.getByRole("button", { name: /^(Ubah|Hapus) / })).toHaveCount(0);

    // A negative result requires the explicit override confirmation.
    await adjustment.getByLabel("Jumlah penyesuaian").fill("-5");
    await adjustment.getByLabel("Alasan").fill("Barang rusak saat pembongkaran");
    await saveAdjustment.click();

    const overrideDialog = page.getByRole("dialog", { name: "Stok akan menjadi minus. Lanjutkan?" });
    await expect(overrideDialog).toBeVisible();
    await expect(overrideDialog).toContainText("ditandai override");
    await expect(overrideDialog).toContainText(/Stok saat ini 2 → Stok setelah .3/);
    await overrideDialog.getByRole("button", { name: "Simpan penyesuaian" }).click();

    await expect(adjustment.getByRole("status")).toContainText(/Stok diperbarui: 2 → .3\./);
    await expect(adjustment.getByRole("status")).toContainText("Baris buku besar ditandai override.");
    await expect(lowStockItem).toContainText("Kurangi 8 unit");
    await expect(ledgerTable.getByText("Override").first()).toBeVisible();
  });

  test("a filtered ledger with no movement distinguishes no-results from an empty ledger", async ({ context, page }) => {
    const product = await createProductViaApi(context.request);

    await page.goto(`/inventory?productId=${product.id}`);
    await expect(page.getByText("Tidak ada pergerakan yang cocok.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Hapus semua filter" })).toBeVisible();
  });

  test("a failed stock-in reports the error inline and keeps the quantity", async ({ page }) => {
    await page.route("**/api/v1/inventory/stock-in", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL", message: "Terjadi kesalahan pada server." } }),
      }),
    );

    await page.goto("/inventory");
    const stockIn = page.getByRole("region", { name: "Stok masuk" });
    const firstProduct = await stockIn.getByLabel("Produk").locator("option").nth(1).getAttribute("value");
    if (!firstProduct) throw new Error("No product available for the stock-in error test");
    await stockIn.getByLabel("Produk").selectOption(firstProduct);
    await stockIn.getByLabel("Jumlah masuk").fill("7");
    await stockIn.getByRole("button", { name: "Simpan stok masuk" }).click();

    await expect(stockIn.getByRole("alert")).toContainText("Terjadi kesalahan pada server.");
    await expect(stockIn.getByLabel("Jumlah masuk")).toHaveValue("7");
    await page.unroute("**/api/v1/inventory/stock-in");
  });

  test("a concurrent stock change shows the reload copy instead of overwriting", async ({ context, page }) => {
    const product = await createProductViaApi(context.request, { openingStock: 5 });
    await page.route("**/api/v1/inventory/adjustments", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "CONFLICT", message: "Stok berubah sejak halaman dibuka." },
        }),
      }),
    );

    await page.goto("/inventory");
    const adjustment = page.getByRole("region", { name: "Penyesuaian stok" });
    await adjustment.getByLabel("Produk").selectOption(product.id);
    await adjustment.getByLabel("Jumlah penyesuaian").fill("-1");
    await adjustment.getByLabel("Alasan").fill("Uji konflik stok");
    await adjustment.getByRole("button", { name: "Simpan penyesuaian" }).click();

    await expect(adjustment.getByRole("alert")).toContainText("Stok berubah sejak halaman dibuka.");
    await expect(adjustment.getByRole("alert")).toContainText(
      "Periksa angka terbaru sebelum menyimpan.",
    );
    await page.unroute("**/api/v1/inventory/adjustments");
  });

  test("applies one ledger filter without clearing the other controls", async ({ context, page }) => {
    const product = await createProductViaApi(context.request, { openingStock: 3 });
    await page.goto("/inventory");
    const ledger = page.getByRole("region", { name: "Buku besar stok" });
    await ledger.getByLabel("Produk").selectOption(product.id);
    await ledger.getByLabel("Jenis", { exact: true }).selectOption("STOCK_IN");
    await ledger.getByRole("button", { name: "Terapkan filter" }).click();

    await expect(page).toHaveURL(/productId=/);
    await expect(page).toHaveURL(/entryType=STOCK_IN/);
    await expect(page.getByText("Jenis: Stok masuk")).toBeVisible();
    await expect(page.getByText("Produk dipilih")).toBeVisible();
  });

  test("no page overflow at 320, 390, 768, 1024, and 1440", async ({ page }) => {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/inventory");
      await expect(page.getByRole("heading", { level: 1, name: "Stok" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});
