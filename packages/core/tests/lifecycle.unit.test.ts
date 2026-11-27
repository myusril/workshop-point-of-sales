import { describe, expect, it } from "vitest";

import {
  ORDER_TRANSITIONS,
  ORDER_STATUSES,
  OrderLifecycleError,
  assertCanAcceptPayment,
  assertCanVoid,
  assertTransition,
  canAcceptPayment,
  canRevertEstimate,
  canVoid,
  isHeaderEditable,
  isLineEditable,
  normalizeVoidReason,
  requiresRevertApproval,
  transitionSettlesStock,
  transitionsFrom,
  type OrderRole,
  type OrderStatus,
} from "../src/lifecycle.ts";

/**
 * BR-007 is transcribed literally here: the test is the second copy of the
 * table, so a code edit that silently widens the lifecycle fails.
 */
const EXPECTED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ["ESTIMATED", "PAID", "VOID"],
  ESTIMATED: ["APPROVED", "DRAFT", "VOID"],
  APPROVED: ["IN_PROGRESS", "PAID", "VOID"],
  IN_PROGRESS: ["COMPLETED", "PAID", "VOID"],
  COMPLETED: ["PAID", "VOID"],
  PAID: ["VOID"],
  VOID: [],
};

describe("order lifecycle (BR-007)", () => {
  it("matches the published transition table exactly", () => {
    expect(ORDER_TRANSITIONS).toEqual(EXPECTED_TRANSITIONS);
    for (const status of ORDER_STATUSES) {
      expect(transitionsFrom(status)).toEqual(EXPECTED_TRANSITIONS[status]);
    }
  });

  it("allows exactly the listed transitions and rejects every other pair", () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const allowed = EXPECTED_TRANSITIONS[from].includes(to);
        if (allowed) {
          expect(() => {
            assertTransition(from, to);
          }).not.toThrow();
          continue;
        }

        let caught: unknown;
        try {
          assertTransition(from, to);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(OrderLifecycleError);
        expect((caught as OrderLifecycleError).currentStatus).toBe(from);
        expect((caught as OrderLifecycleError).message).toContain(from);
      }
    }
  });

  it("treats VOID as terminal with its own message", () => {
    expect(transitionsFrom("VOID")).toEqual([]);
    for (const to of ORDER_STATUSES) {
      expect(() => {
        assertTransition("VOID", to);
      }).toThrow(/VOID bersifat final/);
    }
  });

  it("rejects a no-op transition naming the current status", () => {
    expect(() => {
      assertTransition("APPROVED", "APPROVED");
    }).toThrow(/sudah berstatus APPROVED/);
  });

  it("marks a revert from ESTIMATED to DRAFT as Admin/Owner-only and audited", () => {
    expect(requiresRevertApproval("ESTIMATED", "DRAFT")).toBe(true);
    expect(requiresRevertApproval("DRAFT", "ESTIMATED")).toBe(false);
    expect(canRevertEstimate("ADMIN")).toBe(true);
    expect(canRevertEstimate("OWNER")).toBe(true);
    expect(canRevertEstimate("CASHIER")).toBe(false);
    expect(canRevertEstimate("MECHANIC")).toBe(false);
  });
});

describe("payment eligibility (BR-009)", () => {
  it("accepts a walk-in DRAFT sale but not a DRAFT service intake", () => {
    expect(canAcceptPayment("DRAFT", "SALE")).toBe(true);
    expect(canAcceptPayment("DRAFT", "SERVICE")).toBe(false);
    expect(() => {
      assertCanAcceptPayment("DRAFT", "SERVICE");
    }).toThrow(/disetujui sebelum pembayaran/);
  });

  it("blocks an ESTIMATED order and names the reason", () => {
    expect(canAcceptPayment("ESTIMATED", "SERVICE")).toBe(false);
    expect(() => {
      assertCanAcceptPayment("ESTIMATED", "SERVICE");
    }).toThrow(/Estimasi belum dapat dibayar/);
  });

  it("accepts APPROVED, IN_PROGRESS, COMPLETED and never PAID/VOID", () => {
    for (const status of ["APPROVED", "IN_PROGRESS", "COMPLETED"] as const) {
      expect(canAcceptPayment(status, "SERVICE")).toBe(true);
      expect(canAcceptPayment(status, "SALE")).toBe(true);
    }
    expect(canAcceptPayment("PAID", "SALE")).toBe(false);
    expect(canAcceptPayment("VOID", "SALE")).toBe(false);
  });
});

describe("void authority (BR-008)", () => {
  const roles: OrderRole[] = ["OWNER", "ADMIN", "CASHIER", "MECHANIC"];
  const unpaid: OrderStatus[] = ["DRAFT", "ESTIMATED", "APPROVED", "IN_PROGRESS", "COMPLETED"];

  it("allows Admin and Owner to void unpaid orders only", () => {
    for (const status of unpaid) {
      expect(canVoid(status, "ADMIN")).toBe(true);
      expect(canVoid(status, "OWNER")).toBe(true);
      expect(canVoid(status, "CASHIER")).toBe(false);
      expect(canVoid(status, "MECHANIC")).toBe(false);
    }
    expect(roles.filter((role) => canVoid("COMPLETED", role))).toEqual(["OWNER", "ADMIN"]);
  });

  it("restricts a paid void to the Owner", () => {
    expect(canVoid("PAID", "OWNER")).toBe(true);
    expect(canVoid("PAID", "ADMIN")).toBe(false);
    expect(() => {
      assertCanVoid("PAID", "ADMIN");
    }).toThrow(/Hanya Pemilik/);
  });

  it("refuses to void a VOID order twice", () => {
    expect(canVoid("VOID", "OWNER")).toBe(false);
    expect(() => {
      assertCanVoid("VOID", "OWNER");
    }).toThrow(/sudah dibatalkan/);
  });

  it("requires the configured minimum reason length", () => {
    expect(normalizeVoidReason("  Salah input pelanggan  ", 10)).toBe(
      "Salah input pelanggan",
    );
    expect(() => normalizeVoidReason("   ", 10)).toThrow(/wajib diisi/);
    expect(() => normalizeVoidReason("salah", 10)).toThrow(/minimal 10 karakter/);
    expect(normalizeVoidReason("salah", 3)).toBe("salah");
  });
});

describe("editable windows and stock settlement", () => {
  it("freezes ESTIMATED, COMPLETED, PAID, and VOID figures", () => {
    for (const status of ["DRAFT", "APPROVED", "IN_PROGRESS"] as const) {
      expect(isLineEditable(status)).toBe(true);
      expect(isHeaderEditable(status)).toBe(true);
    }
    for (const status of ["ESTIMATED", "COMPLETED", "PAID", "VOID"] as const) {
      expect(isLineEditable(status)).toBe(false);
      expect(isHeaderEditable(status)).toBe(false);
    }
  });

  it("settles stock at the earlier of COMPLETED and PAID", () => {
    expect(transitionSettlesStock("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(transitionSettlesStock("COMPLETED", "PAID")).toBe(true);
    expect(transitionSettlesStock("DRAFT", "PAID")).toBe(true);
    expect(transitionSettlesStock("APPROVED", "IN_PROGRESS")).toBe(false);
    expect(transitionSettlesStock("PAID", "VOID")).toBe(false);
    expect(transitionSettlesStock("DRAFT", "ESTIMATED")).toBe(false);
  });
});
