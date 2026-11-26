import type { StaffRole } from "@workshop-pos/contracts";

/**
 * Bahasa Indonesia labels for the staff roles. Kept in one place so the login
 * form, session bar, and user screens never invent a different wording.
 */
export const ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: "Pemilik",
  ADMIN: "Admin",
  CASHIER: "Kasir",
  MECHANIC: "Mekanik",
};

export const ASSIGNABLE_ROLES = ["ADMIN", "CASHIER", "MECHANIC"] as const;

/** Roles that are scoped to their assigned outlets instead of the whole business. */
export const OUTLET_SCOPED_ROLES: Record<StaffRole, boolean> = {
  OWNER: false,
  ADMIN: false,
  CASHIER: true,
  MECHANIC: true,
};

export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
