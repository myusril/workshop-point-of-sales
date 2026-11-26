import type { StaffRole } from "@workshop-pos/contracts";

/**
 * Cell semantics from PRD Appendix A:
 * - `Y` allowed (the role's whole org scope)
 * - `N` denied
 * - `O` own outlet only
 * - `A` all outlets of the business
 * - `N_VIEW_O` denied for the action, but the role may view own-outlet records
 */
export type RbacCell = "Y" | "N" | "O" | "A" | "N_VIEW_O";

export type PermissionScope = "ALL" | "ASSIGNED" | "NONE";

export interface RbacActionDefinition {
  readonly key: string;
  /** Bahasa Indonesia, used verbatim in denial messages. */
  readonly label: string;
  readonly cells: Record<StaffRole, RbacCell>;
}

/**
 * PRD Appendix A, row for row, in its published order. `manage_outlets` is
 * appended per FR-009 (Owner creates and edits outlets).
 *
 * The RBAC unit test enumerates the PRD table literally; never edit a cell to
 * make a test pass without changing the PRD first.
 *
 * Convention (F5): an `N_VIEW_O` cell means "cannot perform this action, but
 * may read records for the caller's own outlets". It is not a read grant by
 * itself: every `N_VIEW_O` row must be paired with an explicit view action
 * before WP5 uses the matrix to gate reads. Do not treat `N_VIEW_O` as
 * `O` when deriving `scopeFor`.
 */
export const RBAC_ACTIONS = [
  {
    key: "manage_users",
    label: "mengelola pengguna, peran, dan penonaktifan",
    cells: { OWNER: "Y", ADMIN: "N", CASHIER: "N", MECHANIC: "N" },
  },
  {
    key: "manage_settings",
    label: "mengubah pengaturan outlet (pajak, batas diskon, struk, merek)",
    cells: { OWNER: "Y", ADMIN: "N", CASHIER: "N", MECHANIC: "N" },
  },
  {
    key: "view_audit_log",
    label: "melihat log audit",
    cells: { OWNER: "Y", ADMIN: "N", CASHIER: "N", MECHANIC: "N" },
  },
  {
    key: "manage_catalog",
    label: "membuat dan mengubah produk/layanan (harga, biaya)",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "N", MECHANIC: "N" },
  },
  {
    key: "manage_customers",
    label: "membuat dan mengubah pelanggan/kendaraan",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "O", MECHANIC: "N_VIEW_O" },
  },
  {
    key: "service_intake",
    label: "melakukan intake servis",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "O", MECHANIC: "O" },
  },
  {
    key: "manage_estimates",
    label: "menerbitkan estimasi atau mencatat persetujuan",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "O", MECHANIC: "N" },
  },
  {
    key: "manage_work",
    label: "menugaskan teknisi atau menyelesaikan pekerjaan",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "O", MECHANIC: "O" },
  },
  {
    key: "create_sale",
    label: "membuat penjualan langsung",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "O", MECHANIC: "N" },
  },
  {
    key: "record_payment",
    label: "mencatat pembayaran",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "O", MECHANIC: "N" },
  },
  {
    key: "override_discount",
    label: "memberi diskon di atas batas",
    cells: { OWNER: "Y", ADMIN: "Y", CASHIER: "N", MECHANIC: "N" },
  },
  {
    key: "void_unpaid",
    label: "membatalkan order yang belum dibayar",
    cells: { OWNER: "Y", ADMIN: "Y", CASHIER: "N", MECHANIC: "N" },
  },
  {
    key: "void_paid",
    label: "membatalkan order yang sudah dibayar",
    cells: { OWNER: "Y", ADMIN: "N", CASHIER: "N", MECHANIC: "N" },
  },
  {
    key: "manage_stock",
    label: "mencatat stok masuk atau penyesuaian",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "N", MECHANIC: "N" },
  },
  {
    key: "override_stock",
    label: "melakukan override stok negatif",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "N", MECHANIC: "N" },
  },
  {
    key: "view_reports",
    label: "melihat laporan",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "O", MECHANIC: "N" },
  },
  {
    key: "export_csv",
    label: "mengekspor CSV",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "N", MECHANIC: "N" },
  },
  {
    key: "view_vehicle_history",
    label: "melihat riwayat kendaraan",
    cells: { OWNER: "A", ADMIN: "A", CASHIER: "O", MECHANIC: "O" },
  },
  {
    key: "manage_personal_data",
    label: "mengekspor atau menganonimkan data pribadi",
    cells: { OWNER: "Y", ADMIN: "N", CASHIER: "N", MECHANIC: "N" },
  },
  {
    key: "manage_outlets",
    label: "mengelola outlet",
    cells: { OWNER: "Y", ADMIN: "N", CASHIER: "N", MECHANIC: "N" },
  },
] as const satisfies readonly RbacActionDefinition[];

export type RbacAction = (typeof RBAC_ACTIONS)[number]["key"];

const ACTIONS_BY_KEY = new Map<string, RbacActionDefinition>(
  RBAC_ACTIONS.map((action) => [action.key, action]),
);

export function findRbacAction(action: string): RbacActionDefinition | undefined {
  return ACTIONS_BY_KEY.get(action);
}

export function rbacActionDefinition(action: RbacAction): RbacActionDefinition {
  const definition = ACTIONS_BY_KEY.get(action);
  if (!definition) {
    throw new Error(`Unknown RBAC action: ${action}`);
  }
  return definition;
}

export function scopeFor(role: StaffRole, action: RbacAction): PermissionScope {
  switch (rbacActionDefinition(action).cells[role]) {
    case "Y":
    case "A":
      return "ALL";
    case "O":
      return "ASSIGNED";
    case "N":
    case "N_VIEW_O":
      return "NONE";
  }
}

export function can(role: StaffRole, action: RbacAction): boolean {
  return scopeFor(role, action) !== "NONE";
}

export function allowedActions(role: StaffRole): RbacAction[] {
  return RBAC_ACTIONS.filter((action) => can(role, action.key)).map(
    (action) => action.key,
  );
}

export function denialMessage(action: RbacAction): string {
  return `Anda tidak memiliki izin untuk ${rbacActionDefinition(action).label}.`;
}

export const CROSS_OUTLET_MESSAGE =
  "Anda tidak memiliki akses ke outlet tersebut.";

export const POLICY = {
  maxFailures: 5,
  lockoutMinutes: 15,
  attemptWindowMinutes: 15,
  defaultIdleTimeoutMinutes: 30,
  deviceTokenTtlDays: 30,
  /** Better Auth `session.expiresIn`; hard cap even for active sessions. */
  absoluteSessionHours: 12,
  /** Minimum interval between session `updatedAt` touches. */
  sessionTouchIntervalMs: 30_000,
} as const;
