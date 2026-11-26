import { expect, test } from "@playwright/test";

import { readTestPassword, SEED_ACCOUNTS } from "./env";
import {
  ageSessionForUser,
  createStaffViaApi,
  deactivateStaffViaApi,
  expectNoHorizontalOverflow,
  newStaffInput,
  signInWithApi,
} from "./helpers";

const IDENTIFIER_LABEL = "Email, nama pengguna, atau nomor HP";

test("owner signs in from the login screen and lands on staff management", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { level: 1, name: "Masuk" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "id");

  await page.getByLabel(IDENTIFIER_LABEL).fill(SEED_ACCOUNTS.owner.username);
  await page.getByLabel("Kata sandi").fill(readTestPassword());
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pengguna" })).toBeVisible();
});

test("invalid credentials show one generic message without revealing the account", async ({ page }) => {
  const genericMessage = "Email, nama pengguna, atau kata sandi tidak cocok.";

  await page.goto("/login");
  await page.getByLabel(IDENTIFIER_LABEL).fill(SEED_ACCOUNTS.owner.username);
  await page.getByLabel("Kata sandi").fill("salah-total-1");
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page.locator("#login-error-summary")).toContainText(genericMessage);

  await page.getByLabel(IDENTIFIER_LABEL).fill(`tidak-ada-${Date.now()}`);
  await page.getByLabel("Kata sandi").fill("salah-total-2");
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page.locator("#login-error-summary")).toContainText(genericMessage);
});

test("five failed attempts lock the account and show a countdown", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(IDENTIFIER_LABEL).fill(SEED_ACCOUNTS.mechanic.username);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await page.getByLabel("Kata sandi").fill(`salah-${attempt}A1`);
    await page.getByRole("button", { name: "Masuk" }).click();

    if (attempt < 5) {
      await expect(page.locator("#login-error-summary")).toContainText("tidak cocok");
      await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled();
    }
  }

  await expect(page.locator("#login-lockout")).toContainText(/Coba lagi dalam \d+ menit \d{2} detik/);
  await expect(page.getByRole("button", { name: "Masuk" })).toBeDisabled();
  await expect(page.getByLabel(IDENTIFIER_LABEL)).toHaveValue(SEED_ACCOUNTS.mechanic.username);
});

test("a deactivated account is denied with a terminal explanation", async ({ page, context }) => {
  await signInWithApi(context, "owner");

  const staff = newStaffInput("MECHANIC");
  const created = await createStaffViaApi(context, staff);
  await deactivateStaffViaApi(context, created.id);

  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel(IDENTIFIER_LABEL).fill(staff.username);
  await page.getByLabel("Kata sandi").fill(staff.password);
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page.locator("#login-error-summary")).toContainText("Akun dinonaktifkan. Hubungi Pemilik.");
});

test("an unauthenticated visit to a protected page keeps a safe next path", async ({ page }) => {
  await page.goto("/users");

  await expect(page).toHaveURL(/\/login\?next=%2Fusers$/);

  await page.getByLabel(IDENTIFIER_LABEL).fill(SEED_ACCOUNTS.cashier.username);
  await page.getByLabel("Kata sandi").fill(readTestPassword());
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByText("Hanya Pemilik yang dapat mengelola pengguna.")).toBeVisible();
});

test("an expired session redirects to login with the idle-timeout reason", async ({ page, context }) => {
  await signInWithApi(context, "owner");
  await ageSessionForUser(SEED_ACCOUNTS.owner.username);

  await page.goto("/users");

  await expect(page).toHaveURL(/\/login\?next=%2Fusers&reason=expired$/);
  await expect(page.getByRole("heading", { level: 1, name: "Masuk" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Sesi berakhir karena tidak ada aktivitas. Masuk kembali untuk melanjutkan.",
  );
});

test("login form is reachable by keyboard with a visible focus ring", async ({ page }) => {
  await page.goto("/login");

  await page.keyboard.press("Tab");
  const identifier = page.getByLabel(IDENTIFIER_LABEL);
  await expect(identifier).toBeFocused();
  await expect(identifier).toHaveCSS("outline-style", "solid");
});

test.describe("320px viewport", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test("login screen has no horizontal overflow", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Masuk" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("staff screen has no page-level horizontal overflow", async ({ page, context }) => {
    await signInWithApi(context, "owner");
    await page.goto("/users");
    await expect(page.getByRole("heading", { level: 1, name: "Pengguna" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
