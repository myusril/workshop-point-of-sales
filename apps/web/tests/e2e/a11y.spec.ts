import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInWithApi } from "./helpers";

const BACK_OFFICE_ROUTES = [
  "/",
  "/orders",
  "/catalog",
  "/customers",
  "/vehicles",
  "/inventory",
  "/reports",
  "/reports?report=payment-mix",
  "/reports?report=end-of-day",
  "/audit",
  "/settings",
  "/users",
  "/outlets",
] as const;

async function analyzePage(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));
}

test.describe("WCAG 2.2 AA audit", () => {
  test("login screen has no axe violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Masuk" })).toBeVisible();
    expect(await analyzePage(page)).toEqual([]);
  });

  test("every back-office screen has no axe violations", async ({ context, page }) => {
    await signInWithApi(context, "owner");

    for (const route of BACK_OFFICE_ROUTES) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 }), route).toBeVisible();
      expect(await analyzePage(page), route).toEqual([]);
    }
  });
});
