import { expect, test } from "@playwright/test";

import { SEED_ACCOUNTS } from "./env";
import {
  createStaffViaApi,
  deactivateStaffViaApi,
  errorCodeOf,
  expectNoHorizontalOverflow,
  newStaffInput,
  signInWithApi,
} from "./helpers";

test.describe("owner manages staff", () => {
  test.beforeEach(async ({ context }) => {
    await signInWithApi(context, "owner");
  });

  test("creates, edits, and deactivates a staff account", async ({ page }) => {
    const staff = newStaffInput("CASHIER");

    await page.goto("/users");
    await expect(page.getByRole("heading", { level: 1, name: "Pengguna" })).toBeVisible();

    const createPanel = page.locator("#tambah-pengguna");
    await createPanel.getByLabel("Nama", { exact: true }).fill(staff.name);
    await createPanel.getByLabel("Email", { exact: true }).fill(staff.email);
    await createPanel.getByLabel("Nama pengguna (opsional)").fill(staff.username);
    await createPanel.getByLabel("Nomor HP").fill(staff.phone);
    await createPanel.getByLabel("Kata sandi sementara").fill(staff.password);
    await createPanel.getByLabel("Peran").selectOption("CASHIER");
    await createPanel.getByRole("checkbox", { name: "Outlet Pusat" }).check();
    await createPanel.getByRole("button", { name: "Simpan pengguna" }).click();

    await expect(createPanel.getByRole("status")).toContainText("Pengguna dibuat.");

    await page.getByLabel("Cari").fill(staff.name);
    await page.getByRole("button", { name: "Terapkan filter" }).click();
    await expect(page).toHaveURL(/search=/);

    const row = page.getByRole("row", { name: new RegExp(staff.name) });
    await expect(row).toBeVisible();
    await expect(row.locator(".wp3-role")).toHaveText("Kasir");
    await expect(row.locator(".wp3-status")).toHaveText("Aktif");

    await row.getByRole("button", { name: `Ubah ${staff.name}` }).click();
    const editDialog = page.getByRole("dialog", { name: `Ubah ${staff.name}` });
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel("Peran").selectOption("ADMIN");
    await editDialog.getByRole("button", { name: "Simpan perubahan" }).click();

    await expect(
      page.getByRole("status").filter({ hasText: "Pengguna diperbarui." }),
    ).toBeVisible();
    await expect(row.locator(".wp3-role")).toHaveText("Admin");

    await row.getByRole("button", { name: `Nonaktifkan ${staff.name}` }).click();
    const deactivateDialog = page.getByRole("dialog", { name: `Nonaktifkan ${staff.name}?` });
    await expect(deactivateDialog).toBeVisible();
    await expect(deactivateDialog).toContainText("Sesi aktif akan diakhiri");

    const confirmButton = deactivateDialog.getByRole("button", { name: "Nonaktifkan pengguna" });
    await expect(confirmButton).toBeDisabled();
    await deactivateDialog
      .getByLabel("Alasan penonaktifan")
      .fill("E2E menguji pencabutan akses staf");
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(
      page.getByRole("status").filter({ hasText: "Akses dicabut. Sesi aktif telah diakhiri." }),
    ).toBeVisible();
    await expect(row.locator(".wp3-status")).toHaveText("Nonaktif");
    await expect(row.getByRole("button", { name: `Nonaktifkan ${staff.name}` })).toHaveCount(0);
  });

  test("deactivation ends the staff member's active session", async ({ context, browser }) => {
    const staff = newStaffInput("CASHIER");
    const created = await createStaffViaApi(context, staff);

    const baseURL = test.info().project.use.baseURL;
    if (!baseURL) throw new Error("Playwright baseURL is not configured");

    const staffContext = await browser.newContext({ baseURL });
    const staffPage = await staffContext.newPage();

    try {
      await staffPage.goto("/login");
      await staffPage.getByLabel("Email, nama pengguna, atau nomor HP").fill(staff.username);
      await staffPage.getByLabel("Kata sandi").fill(staff.password);
      await staffPage.getByRole("button", { name: "Masuk" }).click();
      await expect(staffPage.getByRole("heading", { level: 1, name: "Workshop POS" })).toBeVisible();

      const before = await staffContext.request.get("/api/v1/auth/session");
      expect(before.status()).toBe(200);

      await deactivateStaffViaApi(context, created.id);

      const after = await staffContext.request.get("/api/v1/auth/session");
      expect(after.status()).toBe(401);
    } finally {
      await staffContext.close();
    }
  });

  test("empty search result offers a way back", async ({ page }) => {
    await page.goto("/users");
    await page.getByLabel("Cari").fill(`tidak-ada-${Date.now()}`);
    await page.getByRole("button", { name: "Terapkan filter" }).click();

    await expect(page.getByTestId("users-empty")).toBeVisible();
    await expect(page.getByText(/Tidak ada hasil untuk filter yang dipilih/)).toBeVisible();
    await page.getByRole("link", { name: "Hapus filter" }).first().click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("owner unlocks a staff account after five failed sign-ins", async ({ page, context, request }) => {
    const staff = newStaffInput("CASHIER");
    await createStaffViaApi(context, staff);

    // Alias lockout: the failures use the email, the successful sign-in below
    // uses the username. Both resolve to the same account and both keys must be
    // cleared by the Owner's unlock.
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request.post("/api/v1/auth/login", {
        data: { identifier: staff.email, password: `salah-${attempt}A1`, surface: "web" },
      });

      if (attempt < 5) {
        expect(response.status()).toBe(401);
      } else {
        expect(response.status()).toBe(429);
        expect(errorCodeOf(await response.json())).toBe("ACCOUNT_LOCKED");
      }
    }

    await page.goto("/users");
    await expect(page.getByRole("row", { name: new RegExp(SEED_ACCOUNTS.owner.name) })).not.toContainText(
      "Buka kunci",
    );

    await page.getByLabel("Cari").fill(staff.name);
    await page.getByRole("button", { name: "Terapkan filter" }).click();
    const row = page.getByRole("row", { name: new RegExp(staff.name) });
    await expect(row).toBeVisible();

    const unlockButton = row.getByRole("button", { name: `Buka kunci ${staff.name}` });
    await expect(unlockButton).toBeEnabled();

    // Error state: a failed unlock reports honestly and leaves the action enabled.
    await page.route("**/api/v1/users/*/unlock", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "INTERNAL", message: "Terjadi kesalahan pada server." },
        }),
      }),
    );
    await unlockButton.click();
    await expect(row.getByRole("alert")).toContainText("Terjadi kesalahan pada server.");
    await expect(unlockButton).toBeEnabled();
    await page.unroute("**/api/v1/users/*/unlock");

    // Loading/disabled state: hold the request open, then let it complete.
    const unlockGate = Promise.withResolvers<void>();
    await page.route("**/api/v1/users/*/unlock", async (route) => {
      await unlockGate.promise;
      await route.continue();
    });

    await unlockButton.click();
    await expect(unlockButton).toBeDisabled();
    await expect(row.getByText("Membuka kunci akun…")).toBeVisible();
    unlockGate.resolve();

    await expect(
      page.getByRole("status").filter({ hasText: "Akun berhasil dibuka." }),
    ).toBeVisible();
    await page.unroute("**/api/v1/users/*/unlock");

    const loginResponse = await request.post("/api/v1/auth/login", {
      data: { identifier: staff.username, password: staff.password, surface: "web" },
    });
    expect(loginResponse.status()).toBe(200);
  });

  test("staff screen has no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/users");
    await expect(page.getByRole("heading", { level: 1, name: "Pengguna" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("cashier restriction", () => {
  test.beforeEach(async ({ context }) => {
    await signInWithApi(context, "cashier");
  });

  test("cashier direct URL to users returns HTTP 403 with the Pemilik-only copy", async ({ page }) => {
    const response = await page.goto("/users");

    expect(response?.status()).toBe(403);
    await expect(page.getByText("Hanya Pemilik yang dapat mengelola pengguna.")).toBeVisible();
    await expect(page.getByTestId("permission-denied")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("cashier gets 403 from the users API", async ({ context }) => {
    const staff = newStaffInput("CASHIER");
    const response = await context.request.post("/api/v1/users", { data: staff });

    expect(response.status()).toBe(403);
    expect(errorCodeOf(await response.json())).toBe("FORBIDDEN");
  });

  test("cashier direct URL to outlets returns HTTP 403 with the Pemilik-only copy", async ({ page }) => {
    const response = await page.goto("/outlets");

    expect(response?.status()).toBe(403);
    await expect(page.getByText("Hanya Pemilik yang dapat mengelola outlet.")).toBeVisible();
    await expect(page.getByTestId("permission-denied")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
});
