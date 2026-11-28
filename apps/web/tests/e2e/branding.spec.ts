import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { databaseUrl, readTestPassword, uniqueSuffix } from "./env";
import {
  createStaffViaApi,
  deactivateStaffViaApi,
  expectNoHorizontalOverflow,
  newStaffInput,
  signInWithApi,
  signInWithPassword,
} from "./helpers";

/**
 * FR-071 branding wiring: the saved product name and logo must reach the shell,
 * the home page, the browser title, and the signed-out login card, while the
 * settings endpoint stays Owner-only. Branding is installation state, so every
 * test restores the default wordmark afterwards.
 */

const LOGO_PATH = "/branding-e2e-logo.svg";
const LOGO_ROUTE = `**${LOGO_PATH}`;
const SAVED_MESSAGE = "Merek produk disimpan dan dicatat di log audit.";
const LONG_NAME = `Bengkel Maju ${"S".repeat(67)}`;

/** Neutral square served only inside Playwright; no brand asset is shipped. */
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" fill="#2f6f5e"/></svg>';

function uniqueName(): string {
  return `Bengkel Maju ${uniqueSuffix()}`;
}

/** Routes the logo request so the `<img>` loads without shipping an asset. */
async function serveLogo(target: Page): Promise<void> {
  await target.route(LOGO_ROUTE, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: LOGO_SVG }),
  );
}

/**
 * Restores the untouched fallback wordmark. This is test state cleanup, so it
 * writes the disposable database directly instead of spending a login: the
 * account-lockout suite runs before this file and the login endpoint throttles.
 */
async function resetBranding(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl(), connectionTimeoutMillis: 3_000 });
  try {
    await client.connect();
    await client.query(
      'update "businesses" set "product_display_name" = null, "logo_path" = null',
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function saveBrandingViaUi(
  page: Page,
  productName: string,
  logoPath: string | null,
): Promise<void> {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Pengaturan" })).toBeVisible();
  await page.getByLabel("Nama produk").fill(productName);
  await page.getByLabel("Path atau URL logo").fill(logoPath ?? "");
  await page.getByRole("button", { name: "Simpan merek" }).click();
  await expect(page.getByText(SAVED_MESSAGE)).toBeVisible();
}

async function expectWordmarkLogo(page: Page): Promise<void> {
  const logo = page.locator(".bo-sidebar .bo-wordmark img");
  await expect(logo).toBeVisible();
  const loaded = await logo.evaluate(
    (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
  );
  expect(loaded, "the saved logo must load in the sidebar wordmark").toBe(true);
}

test.describe("FR-071 buyer branding", () => {
  test.beforeEach(async () => {
    await resetBranding();
  });

  test.afterEach(async () => {
    await resetBranding();
  });

  test("Owner saves name and logo; shell, home, title, and login show them", async ({
    browser,
    context,
    page,
  }) => {
    const name = uniqueName();
    await signInWithApi(context, "owner");
    await serveLogo(page);

    await saveBrandingViaUi(page, name, LOGO_PATH);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page).toHaveTitle(`Beranda — ${name}`);
    const homeLink = page.getByRole("link", { name: `${name} — Beranda` });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("title", name);
    await expectWordmarkLogo(page);
    await expect(page.locator(".bo-sidebar .product-brand__name")).toHaveText(name);

    // Collapsed rail keeps a compact mark whose accessible name is unchanged.
    await page.getByRole("button", { name: "Ciutkan menu samping" }).click();
    await expect(page.locator(".bo-sidebar .product-brand__logo--compact")).toBeVisible();
    await expect(page.locator(".bo-sidebar .product-brand__name")).toHaveCount(0);
    await expect(page.getByRole("link", { name: `${name} — Beranda` })).toBeVisible();

    // Signed-out visitors see the installation branding on the login card.
    const anonymous = await browser.newContext();
    try {
      const loginPage = await anonymous.newPage();
      await serveLogo(loginPage);
      await loginPage.goto("/login");
      await expect(loginPage.getByRole("heading", { level: 1, name: "Masuk" })).toBeVisible();
      await expect(loginPage).toHaveTitle(`Masuk — ${name}`);
      await expect(loginPage.locator(".wp3-brand .product-brand__name")).toHaveText(name);
      const loginLogo = loginPage.locator(".wp3-brand img");
      await expect(loginLogo).toBeVisible();
      const loaded = await loginLogo.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      );
      expect(loaded, "the saved logo must load on the login card").toBe(true);
    } finally {
      await anonymous.close();
    }
  });

  test("Cashier and Mechanic see branding but cannot read or write settings", async ({
    context,
    page,
  }) => {
    const name = uniqueName();
    await signInWithApi(context, "owner");

    // The seed Mechanic is locked for 15 minutes by the auth lockout suite, so
    // this test provisions its own staff account and deactivates it afterwards.
    const mechanicInput = newStaffInput("MECHANIC");
    const mechanic = await createStaffViaApi(context, mechanicInput);

    try {
      await saveBrandingViaUi(page, name, null);

      await context.clearCookies();
      await signInWithApi(context, "cashier");
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await expect(page.getByRole("link", { name: `${name} — Beranda` })).toBeVisible();
      await expect(page.locator(".bo-sidebar .product-brand__name")).toHaveText(name);

      const settingsPage = await page.goto("/settings");
      expect(settingsPage?.status()).toBe(403);

      const settingsRead = await page.request.get(
        "/api/v1/settings?outletId=b0000000-0000-4000-8000-000000000002",
      );
      expect(settingsRead.status()).toBe(403);

      const brandingRead = await page.request.get("/api/v1/settings/branding");
      expect(brandingRead.status()).toBe(403);

      const brandingWrite = await page.request.patch("/api/v1/settings/branding", {
        data: { productName: "Bengkel Lain", logoPath: null },
      });
      expect(brandingWrite.status()).toBe(403);

      await context.clearCookies();
      await signInWithPassword(context, mechanicInput.username, readTestPassword());
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      const mechanicPage = await page.goto("/settings");
      expect(mechanicPage?.status()).toBe(403);
    } finally {
      await context.clearCookies();
      await signInWithApi(context, "owner");
      await deactivateStaffViaApi(context, mechanic.id);
    }
  });

  test("rejects an invalid logo path without changing the saved branding", async ({
    context,
    page,
  }) => {
    const name = uniqueName();
    await signInWithApi(context, "owner");
    await page.goto("/settings");
    await page.getByLabel("Nama produk").fill(name);
    await page.getByLabel("Path atau URL logo").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Simpan merek" }).click();

    await expect(page.getByText("Merek belum tersimpan.")).toBeVisible();
    await expect(
      page.getByText("Logo harus berupa path lokal (/) atau URL https.").first(),
    ).toBeVisible();

    const apiResponse = await page.request.patch("/api/v1/settings/branding", {
      data: { productName: name, logoPath: "ftp://example.com/logo.svg" },
    });
    expect(apiResponse.status()).toBe(400);
    expect(await apiResponse.text()).toContain("Logo harus berupa path lokal (/) atau URL https.");

    const read = await page.request.get("/api/v1/settings/branding");
    expect(read.status()).toBe(200);
    expect(await read.json()).toEqual({ productName: "Workshop POS", logoPath: null });
  });

  test("an 80-character name truncates without overflow at 1440/1024/768/390/320", async ({
    context,
    page,
  }) => {
    await signInWithApi(context, "owner");
    await saveBrandingViaUi(page, LONG_NAME, null);

    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: LONG_NAME })).toBeVisible();

      const brandLink = page.getByRole("link", { name: `${LONG_NAME} — Beranda` });
      await expect(brandLink).toBeVisible();
      await expectNoHorizontalOverflow(page);

      // Narrow screens have no room for 80 characters: the name must ellipsize.
      if (width <= 390) {
        const truncated = await page
          .locator(".product-brand__name:visible")
          .first()
          .evaluate((element) => element.scrollWidth > element.clientWidth);
        expect(truncated, `name must ellipsize at ${width}px`).toBe(true);
      }
    }

    // The 72 px collapsed rail keeps the initials inside its own width.
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Ciutkan menu samping" }).click();
    const rail = page.locator(".bo-sidebar");
    const railWidth = await rail.evaluate((element) => element.getBoundingClientRect().width);
    expect(Math.round(railWidth)).toBe(72);
    const brandFits = await page
      .locator(".bo-sidebar__brand")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
    expect(brandFits, "the compact mark must fit the collapsed rail").toBe(true);
    await expect(page.locator(".bo-sidebar .product-brand__initials")).toHaveText("BM");
    await expectNoHorizontalOverflow(page);
  });

  test("no logo falls back to the text wordmark without layout shift", async ({
    browser,
    context,
    page,
  }) => {
    const name = uniqueName();
    await signInWithApi(context, "owner");
    await saveBrandingViaUi(page, name, null);

    await page.goto("/");
    await expect(page.locator(".bo-sidebar .bo-wordmark img")).toHaveCount(0);
    await expect(page.locator(".bo-sidebar .product-brand__name")).toHaveText(name);
    await expect(page).toHaveTitle(`Beranda — ${name}`);
    await expectNoHorizontalOverflow(page);

    const anonymous = await browser.newContext();
    try {
      const loginPage = await anonymous.newPage();
      await loginPage.goto("/login");
      await expect(loginPage.locator(".wp3-brand .product-brand__name")).toHaveText(name);
      await expect(loginPage.locator(".wp3-brand img")).toHaveCount(0);
    } finally {
      await anonymous.close();
    }
  });
});
