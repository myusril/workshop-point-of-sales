import { describe, expect, it } from "vitest";

import { isBackOfficeNavItemActive } from "../lib/navigation";
import { backOfficeNavItems } from "../lib/navigation-items";

function labelsFor(role: Parameters<typeof backOfficeNavItems>[0]): string[] {
  return backOfficeNavItems(role).map((item) => item.label);
}

describe("back-office navigation filtering", () => {
  it("shows every destination to the Owner", () => {
    expect(backOfficeNavItems("OWNER")).toEqual([
      { href: "/", label: "Beranda", icon: "home" },
      { href: "/catalog", label: "Produk & Jasa", icon: "catalog" },
      { href: "/inventory", label: "Stok", icon: "inventory" },
      { href: "/users", label: "Pengguna", icon: "users" },
      { href: "/outlets", label: "Outlet", icon: "outlets" },
    ]);
  });

  it("omits destinations a role can never use instead of disabling them", () => {
    expect(labelsFor("ADMIN")).toEqual(["Beranda", "Produk & Jasa", "Stok"]);
    expect(labelsFor("CASHIER")).toEqual(["Beranda", "Produk & Jasa"]);
    expect(labelsFor("MECHANIC")).toEqual(["Beranda", "Produk & Jasa"]);
  });

  it("keeps the catalog readable for roles without manage_catalog", () => {
    for (const role of ["CASHIER", "MECHANIC"] as const) {
      const items = backOfficeNavItems(role);
      expect(items.some((item) => item.href === "/catalog")).toBe(true);
      expect(items.some((item) => item.href === "/inventory")).toBe(false);
    }
  });

  it("marks the exact route and its child routes active, never a prefix lookalike", () => {
    expect(isBackOfficeNavItemActive("/", "/")).toBe(true);
    expect(isBackOfficeNavItemActive("/", "/catalog")).toBe(false);
    expect(isBackOfficeNavItemActive("/catalog", "/catalog")).toBe(true);
    expect(isBackOfficeNavItemActive("/catalog", "/catalog/products")).toBe(true);
    expect(isBackOfficeNavItemActive("/catalog", "/catalogue")).toBe(false);
    expect(isBackOfficeNavItemActive("/inventory", "/inventory/ledger")).toBe(true);
  });
});
