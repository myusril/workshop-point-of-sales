import { describe, expect, it } from "vitest";

import type { StaffRole } from "@workshop-pos/contracts";

import {
  POLICY,
  RBAC_ACTIONS,
  allowedActions,
  can,
  denialMessage,
  findRbacAction,
  rbacActionDefinition,
  scopeFor,
  type RbacAction,
  type RbacCell,
} from "../src/rbac.ts";

type PrdRow = readonly [string, RbacCell, RbacCell, RbacCell, RbacCell];

/**
 * PRD Appendix A, transcribed literally from docs/product/PRD.md. Columns are
 * Owner, Admin, Cashier, Mechanic. If this table and `RBAC_ACTIONS` disagree,
 * the test fails: the PRD is normative (FR-003).
 *
 *   | Manage users/roles/deactivation | Y | N | N | N |
 */
const PRD_APPENDIX_A: readonly PrdRow[] = [
  ["manage_users", "Y", "N", "N", "N"],
  ["manage_settings", "Y", "N", "N", "N"],
  ["view_audit_log", "Y", "N", "N", "N"],
  ["manage_catalog", "A", "A", "N", "N"],
  ["manage_customers", "A", "A", "O", "N_VIEW_O"],
  ["service_intake", "A", "A", "O", "O"],
  ["manage_estimates", "A", "A", "O", "N"],
  ["manage_work", "A", "A", "O", "O"],
  ["create_sale", "A", "A", "O", "N"],
  ["record_payment", "A", "A", "O", "N"],
  ["override_discount", "Y", "Y", "N", "N"],
  ["void_unpaid", "Y", "Y", "N", "N"],
  ["void_paid", "Y", "N", "N", "N"],
  ["manage_stock", "A", "A", "N", "N"],
  ["override_stock", "A", "A", "N", "N"],
  ["view_reports", "A", "A", "O", "N"],
  ["export_csv", "A", "A", "N", "N"],
  ["view_vehicle_history", "A", "A", "O", "O"],
  ["manage_personal_data", "Y", "N", "N", "N"],
  // FR-009: "Owner creates and edits the business's outlets".
  ["manage_outlets", "Y", "N", "N", "N"],
];

const ROLES: readonly StaffRole[] = ["OWNER", "ADMIN", "CASHIER", "MECHANIC"];

function cellFor(row: PrdRow, role: StaffRole): RbacCell {
  switch (role) {
    case "OWNER":
      return row[1];
    case "ADMIN":
      return row[2];
    case "CASHIER":
      return row[3];
    case "MECHANIC":
      return row[4];
  }
}

describe("RBAC matrix matches PRD Appendix A literally", () => {
  it("declares every Appendix A row plus manage_outlets", () => {
    expect(RBAC_ACTIONS.map((action) => action.key)).toEqual(
      PRD_APPENDIX_A.map((row) => row[0]),
    );
  });

  it("has a unique key for every action", () => {
    const keys = RBAC_ACTIONS.map((action) => action.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(
    PRD_APPENDIX_A.flatMap((row) =>
      ROLES.map((role) => [row[0], role, cellFor(row, role)] as const),
    ),
  )("%s allows %s as %s", (key, role, expectedCell) => {
    const definition = rbacActionDefinition(key as RbacAction);
    expect(definition.cells[role]).toBe(expectedCell);
  });

  it("labels every action in Bahasa Indonesia", () => {
    for (const action of RBAC_ACTIONS) {
      expect(action.label.length).toBeGreaterThan(3);
      // Denial text is product copy, never an English enum name.
      expect(action.label).not.toBe(action.key);
    }
  });
});

describe("can() and scopeFor() derive from the matrix", () => {
  it.each(
    PRD_APPENDIX_A.flatMap((row) =>
      ROLES.map((role) => [row[0], role, cellFor(row, role)] as const),
    ),
  )("%s for %s with cell %s maps to the right permission", (key, role, cell) => {
    const action = key as RbacAction;
    const expectedScope =
      cell === "Y" || cell === "A"
        ? "ALL"
        : cell === "O"
          ? "ASSIGNED"
          : "NONE";

    expect(scopeFor(role, action)).toBe(expectedScope);
    expect(can(role, action)).toBe(expectedScope !== "NONE");
  });

  it("matches Appendix A's per-role totals", () => {
    // Owner: every row. Admin: 14 (catalog, customers, intake, estimates,
    // work, sale, payment, discounts, unpaid void, stock, stock override,
    // reports, CSV, vehicle history). Cashier: 8. Mechanic: 3.
    expect(allowedActions("OWNER")).toHaveLength(20);
    expect(allowedActions("ADMIN")).toHaveLength(14);
    expect(allowedActions("CASHIER")).toHaveLength(8);
    expect(allowedActions("MECHANIC")).toHaveLength(3);
  });

  it("denies mechanic customer edits while keeping vehicle history readable", () => {
    expect(can("MECHANIC", "manage_customers")).toBe(false);
    expect(can("MECHANIC", "view_vehicle_history")).toBe(true);
    expect(scopeFor("MECHANIC", "view_vehicle_history")).toBe("ASSIGNED");
  });

  it("keeps outlet management and paid-order voiding Owner-only", () => {
    for (const role of ROLES) {
      expect(can(role, "manage_outlets")).toBe(role === "OWNER");
      expect(can(role, "void_paid")).toBe(role === "OWNER");
    }
  });

  it("never lets cashier or mechanic manage users, outlets, or settings", () => {
    for (const role of ["CASHIER", "MECHANIC"] as const) {
      for (const action of ["manage_users", "manage_outlets", "manage_settings"] as const) {
        expect(can(role, action)).toBe(false);
      }
    }
  });
});

describe("denial messages and lookup", () => {
  it("formats a Bahasa Indonesia denial using the action label", () => {
    expect(denialMessage("manage_users")).toBe(
      "Anda tidak memiliki izin untuk mengelola pengguna, peran, dan penonaktifan.",
    );
    expect(denialMessage("create_sale")).toContain("membuat penjualan langsung");
  });

  it("returns undefined for an unknown action instead of throwing", () => {
    expect(findRbacAction("does_not_exist")).toBeUndefined();
  });
});

describe("policy constants", () => {
  it("encodes the founder decisions", () => {
    expect(POLICY).toMatchObject({
      maxFailures: 5,
      lockoutMinutes: 15,
      attemptWindowMinutes: 15,
      defaultIdleTimeoutMinutes: 30,
      deviceTokenTtlDays: 30,
      absoluteSessionHours: 12,
      sessionTouchIntervalMs: 30_000,
    });
  });
});
