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
      { href: "/orders", label: "Transaksi", icon: "catalog" },
      { href: "/catalog", label: "Produk & Jasa", icon: "catalog" },
      { href: "/customers", label: "Pelanggan", icon: "users" },
      { href: "/vehicles", label: "Kendaraan", icon: "catalog" },
      { href: "/inventory", label: "Stok", icon: "inventory" },
      { href: "/reports", label: "Laporan", icon: "reports" },
      { href: "/audit", label: "Log audit", icon: "audit" },
      { href: "/users", label: "Pengguna", icon: "users" },
      { href: "/outlets", label: "Outlet", icon: "outlets" },
      { href: "/settings", label: "Pengaturan", icon: "settings" },
    ]);
  });

  it("omits destinations a role can never use instead of disabling them", () => {
    expect(labelsFor("ADMIN")).toEqual([
      "Beranda",
      "Transaksi",
      "Produk & Jasa",
      "Pelanggan",
      "Kendaraan",
      "Stok",
      "Laporan",
    ]);
    expect(labelsFor("CASHIER")).toEqual([
      "Beranda",
      "Transaksi",
      "Produk & Jasa",
      "Pelanggan",
      "Kendaraan",
      "Laporan",
    ]);
    // Mechanic cannot write customers but may read them and view history.
    expect(labelsFor("MECHANIC")).toEqual([
      "Beranda",
      "Transaksi",
      "Produk & Jasa",
      "Pelanggan",
      "Kendaraan",
    ]);
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
    expect(isBackOfficeNavItemActive("/vehicles", "/vehicles/abc")).toBe(true);
    expect(isBackOfficeNavItemActive("/customers", "/customers")).toBe(true);
  });
});
