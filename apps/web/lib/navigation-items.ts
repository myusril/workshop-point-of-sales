import { can } from "@workshop-pos/auth";
import type { StaffRole } from "@workshop-pos/contracts";

import type { BackOfficeNavItem } from "./navigation";

/**
 * Navigation omits every destination the signed-in role can never use (§6.3).
 * It never renders a disabled placeholder, so the rule is filtering, not
 * disabling. This module is server-only because `can` lives in the auth
 * package that also opens the database; the resolved items are passed to the
 * client shell as serializable props.
 */
export function backOfficeNavItems(role: StaffRole): BackOfficeNavItem[] {
  const items: BackOfficeNavItem[] = [
    { href: "/", label: "Beranda", icon: "home" },
    { href: "/catalog", label: "Produk & Jasa", icon: "catalog" },
    // Reads are open to every authenticated role (writes stay behind
    // `manage_customers`); Mechanic keeps history access through
    // `view_vehicle_history`, so neither destination is role-filtered.
    { href: "/customers", label: "Pelanggan", icon: "users" },
    { href: "/vehicles", label: "Kendaraan", icon: "catalog" },
  ];

  if (can(role, "manage_stock")) {
    items.push({ href: "/inventory", label: "Stok", icon: "inventory" });
  }
  if (can(role, "manage_users")) {
    items.push({ href: "/users", label: "Pengguna", icon: "users" });
  }
  if (can(role, "manage_outlets")) {
    items.push({ href: "/outlets", label: "Outlet", icon: "outlets" });
  }

  return items;
}
