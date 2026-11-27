import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { signInWithApi } from "./helpers";

test.describe("reports, export, audit, and settings", () => {
  test.beforeEach(async ({ context }) => {
    await signInWithApi(context, "owner");
  });

  test("shows every report tab and downloads a CSV that matches the screen", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { level: 1, name: "Laporan" })).toBeVisible();

    for (const label of [
      "Penjualan harian",
      "Komposisi pembayaran",
      "Jasa vs produk",
      "Produktivitas teknisi",
      "Valuasi stok",
      "Akhir hari",
    ]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }

    await page.getByRole("link", { name: "Komposisi pembayaran", exact: true }).click();
    await expect(page.getByRole("table", { name: /Pembayaran diterima/ })).toBeVisible();
    await expect(page.getByText("Kas diharapkan").first()).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Unduh CSV" }).click(),
    ]);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const content = await readFile(filePath!, "utf8");
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain(
      "Outlet,Dari,Sampai,Metode,Pembayaran,Pengembalian,Neto,Kembalian",
    );
    expect(content).toContain("Kas diharapkan");
  });

  test("renders an explicit empty end-of-day state without invented rows", async ({ page }) => {
    await page.goto("/reports?report=end-of-day");
    await expect(page.getByRole("heading", { level: 1, name: "Laporan" })).toBeVisible();
    await expect(page.getByText(/Akhir hari \d{2} \w+ \d{4}/)).toBeVisible();
    await expect(page.getByRole("table", { name: "Jumlah transaksi menurut status" })).toBeVisible();
    await expect(page.getByText(/Tidak ada transaksi pada|Transaksi batal akan muncul/).first()).toBeVisible();
  });

  test("saves settings and surfaces the change in the audit log", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Pengaturan" })).toBeVisible();

    const tax = page.getByLabel("Tarif pajak (%)");
    await tax.fill("");
    await page.getByRole("button", { name: "Simpan pengaturan" }).click();
    await expect(page.getByText("Periksa isian angka.")).toBeVisible();
    await expect(
      page.getByText("Tarif pajak harus bilangan bulat 0 sampai 100.").first(),
    ).toBeVisible();

    await tax.fill("12");
    await page.getByRole("button", { name: "Simpan pengaturan" }).click();
    await expect(
      page.getByText("Pengaturan disimpan dan dicatat di log audit."),
    ).toBeVisible();

    await page.goto("/audit");
    await expect(page.getByRole("heading", { level: 1, name: "Log audit" })).toBeVisible();
    await page.getByLabel("Jenis aksi").selectOption("settings.updated");
    await page.getByRole("button", { name: "Terapkan filter" }).click();
    await expect(page.getByRole("table", { name: "Log audit" })).toBeVisible();
    const auditTable = page.getByRole("table", { name: "Log audit" });
    await expect(auditTable.getByText("Pengaturan outlet diubah").first()).toBeVisible();
    await expect(auditTable.getByText("Rina Wijaya").first()).toBeVisible();
    await auditTable.getByText("Lihat perubahan").first().click();
    await expect(auditTable.getByText("taxRate").first()).toBeVisible();
  });

  test("denies the Cashier audit, settings, and CSV export", async ({ context, page }) => {
    await context.clearCookies();
    await signInWithApi(context, "cashier");

    await page.goto("/reports");
    await expect(page.getByRole("heading", { level: 1, name: "Laporan" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Unduh CSV" })).toHaveCount(0);

    const exportResponse = await page.request.get(
      "/api/v1/export/reports/daily-sales?from=2026-11-27&to=2026-11-27",
    );
    expect(exportResponse.status()).toBe(403);

    const auditResponse = await page.request.get("/api/v1/audit");
    expect(auditResponse.status()).toBe(403);

    const settingsResponse = await page.request.get(
      "/api/v1/settings?outletId=b0000000-0000-4000-8000-000000000002",
    );
    expect(settingsResponse.status()).toBe(403);

    const auditPage = await page.goto("/audit");
    expect(auditPage?.status()).toBe(403);
    const settingsPage = await page.goto("/settings");
    expect(settingsPage?.status()).toBe(403);
  });

  test("denies the Admin audit and settings but allows export", async ({ context, page }) => {
    await context.clearCookies();
    await signInWithApi(context, "admin");

    const auditResponse = await page.request.get("/api/v1/audit");
    expect(auditResponse.status()).toBe(403);
    const settingsResponse = await page.request.get(
      "/api/v1/settings?outletId=b0000000-0000-4000-8000-000000000002",
    );
    expect(settingsResponse.status()).toBe(403);

    await page.goto("/reports");
    await expect(page.getByRole("link", { name: "Unduh CSV" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Log audit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Pengaturan", exact: true })).toHaveCount(0);
  });
});
