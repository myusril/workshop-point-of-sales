import { expect, test } from "@playwright/test";

import { readTestPassword, SEED_ACCOUNTS } from "./env";

test("the guarded home redirects to login, then shows the signed-in identity", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.getByRole("heading", { level: 1, name: "Masuk" })).toBeVisible();

  await page.getByLabel("Email, nama pengguna, atau nomor HP").fill(SEED_ACCOUNTS.owner.username);
  await page.getByLabel("Kata sandi").fill(readTestPassword());
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Workshop POS" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");

  await expect(page.getByText(SEED_ACCOUNTS.owner.name).first()).toBeVisible();
  await expect(page.getByText("Pemilik", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Pengguna", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Outlet", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1, name: "Masuk" })).toBeVisible();
});
