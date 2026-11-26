import { expect, test } from "@playwright/test";
import { sessionPayloadSchema } from "@workshop-pos/contracts";

import { SEED_OUTLET_ID, uniquePhone, uniqueSuffix } from "./env";
import {
  createOutletViaApi,
  createStaffViaApi,
  expectNoHorizontalOverflow,
  newStaffInput,
  signInWithApi,
  signInWithPassword,
} from "./helpers";

test.describe("owner manages outlets", () => {
  test.beforeEach(async ({ context }) => {
    await signInWithApi(context, "owner");
  });

  test("creates and edits an outlet, then switches the active outlet", async ({ page, context }) => {
    const suffix = uniqueSuffix();
    const outletName = `Outlet E2E ${suffix}`;
    const editedName = `${outletName} Ubah`;

    await page.goto("/outlets");
    await expect(page.getByRole("heading", { level: 1, name: "Outlet" })).toBeVisible();

    const createPanel = page.locator("#tambah-outlet");
    await createPanel.getByLabel("Nama outlet").fill(outletName);
    await createPanel.getByLabel("Alamat (opsional)").fill("Jl. Uji E2E 1, Jakarta");
    await createPanel.getByLabel("Nomor HP (opsional)").fill(uniquePhone());
    await createPanel.getByRole("button", { name: "Simpan outlet" }).click();

    await expect(createPanel.getByRole("status")).toContainText("Outlet dibuat.");

    const row = page.getByRole("row", { name: new RegExp(outletName) });
    await expect(row).toBeVisible();
    await expect(row.locator(".wp3-status")).toHaveText("Aktif");

    await row.getByRole("button", { name: `Ubah ${outletName}` }).click();
    const editDialog = page.getByRole("dialog", { name: `Ubah ${outletName}` });
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel("Nama outlet").fill(editedName);
    await editDialog.getByRole("button", { name: "Simpan perubahan" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Outlet diperbarui." })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(editedName) })).toBeVisible();

    await page.reload();
    // The shell sidebar owns the visible switcher; the WP3 session bar is
    // hidden inside the shell and is not an interactive surface there.
    const outletSelect = page
      .getByRole("complementary", { name: "Bilah samping" })
      .getByLabel("Outlet aktif");
    await expect(outletSelect).toBeVisible();

    const editedOption = outletSelect.locator("option", { hasText: editedName });
    const editedOutletId = await editedOption.getAttribute("value");
    expect(editedOutletId).not.toBeNull();

    await outletSelect.selectOption(editedOutletId ?? "");
    await expect(
      page.getByRole("status").filter({ hasText: `Outlet aktif diganti ke ${editedName}.` }),
    ).toBeVisible();
    await expect(outletSelect).toHaveValue(editedOutletId ?? "");

    const sessionResponse = await context.request.get("/api/v1/auth/session");
    expect(sessionResponse.status()).toBe(200);
    const sessionPayload = sessionPayloadSchema.safeParse(await sessionResponse.json());
    expect(sessionPayload.success).toBe(true);
    if (sessionPayload.success) {
      expect(sessionPayload.data.session.activeOutletId).toBe(editedOutletId);
    }

    await outletSelect.selectOption(SEED_OUTLET_ID);
    await expect(page.getByRole("status").filter({ hasText: /Outlet aktif diganti/ })).toBeVisible();
  });

  test("outlet screen has no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/outlets");
    await expect(page.getByRole("heading", { level: 1, name: "Outlet" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("cashier assigned to two outlets can switch the active outlet", async ({ context, browser }) => {
    const baseURL = test.info().project.use.baseURL;
    if (!baseURL) throw new Error("Playwright baseURL is not configured");

    const secondOutlet = await createOutletViaApi(context, {
      name: `Outlet Cabang ${uniqueSuffix()}`,
      address: "Jl. Uji E2E 2, Jakarta",
    });
    const staff = newStaffInput("CASHIER");
    await createStaffViaApi(context, { ...staff, outletIds: [SEED_OUTLET_ID, secondOutlet.id] });

    const cashierContext = await browser.newContext({ baseURL });
    const cashierPage = await cashierContext.newPage();

    try {
      await signInWithPassword(cashierContext, staff.username, staff.password);
      await cashierPage.goto("/");
      await expect(cashierPage.getByRole("heading", { level: 1, name: "Workshop POS" })).toBeVisible();

      const switcher = cashierPage.getByLabel("Outlet aktif");
      await expect(switcher).toBeVisible();
      await expect(switcher.locator("option")).toHaveCount(2);

      const sessionBefore = sessionPayloadSchema.safeParse(
        await (await cashierContext.request.get("/api/v1/auth/session")).json(),
      );
      expect(sessionBefore.success).toBe(true);
      if (!sessionBefore.success) return;

      const targetId =
        sessionBefore.data.session.activeOutletId === secondOutlet.id ? SEED_OUTLET_ID : secondOutlet.id;
      const targetName =
        (await switcher.locator(`option[value="${targetId}"]`).textContent())?.trim() ?? "";

      await switcher.selectOption(targetId);
      await expect(
        cashierPage.getByRole("status").filter({ hasText: `Outlet aktif diganti ke ${targetName}.` }),
      ).toBeVisible();
      await expect(switcher).toHaveValue(targetId);

      const sessionAfter = sessionPayloadSchema.safeParse(
        await (await cashierContext.request.get("/api/v1/auth/session")).json(),
      );
      expect(sessionAfter.success).toBe(true);
      if (sessionAfter.success) {
        expect(sessionAfter.data.session.activeOutletId).toBe(targetId);
      }
    } finally {
      await cashierContext.close();
    }
  });

  test("single-outlet cashier sees no outlet switcher", async ({ browser }) => {
    const baseURL = test.info().project.use.baseURL;
    if (!baseURL) throw new Error("Playwright baseURL is not configured");

    const cashierContext = await browser.newContext({ baseURL });
    const cashierPage = await cashierContext.newPage();

    try {
      await signInWithApi(cashierContext, "cashier");
      await cashierPage.goto("/");
      await expect(cashierPage.getByRole("heading", { level: 1, name: "Workshop POS" })).toBeVisible();
      await expect(cashierPage.getByLabel("Outlet aktif")).toHaveCount(0);
    } finally {
      await cashierContext.close();
    }
  });
});
