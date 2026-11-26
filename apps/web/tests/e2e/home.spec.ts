import { expect, test } from "@playwright/test";

test("walking-skeleton page renders the heading and health link", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { level: 1, name: "Workshop POS" }),
  ).toBeVisible();

  const healthLink = page.getByRole("link", { name: "Periksa status sistem" });

  await expect(healthLink).toBeVisible();
  await expect(healthLink).toHaveAttribute("href", "/api/v1/health");

  await page.keyboard.press("Tab");
  await expect(healthLink).toBeFocused();
  await expect(healthLink).toHaveCSS("outline-style", "solid");

  const fitsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fitsViewport).toBe(true);
});
