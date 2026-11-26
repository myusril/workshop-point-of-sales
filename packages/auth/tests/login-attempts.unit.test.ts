import { describe, expect, it } from "vitest";

import {
  accountLockKeys,
  evaluateLockStatus,
  normalizeIdentifier,
} from "../src/login-attempts.ts";
import { POLICY } from "../src/rbac.ts";

const START = new Date("2026-11-26T08:00:00.000Z");
const MINUTE = 60_000;

function at(minutesAfterStart: number): Date {
  return new Date(START.getTime() + minutesAfterStart * MINUTE);
}

function failuresDescending(minutes: readonly number[]): Date[] {
  return [...minutes]
    .sort((left, right) => right - left)
    .map((value) => at(value));
}

describe("normalizeIdentifier", () => {
  it.each([
    [" Owner@Example.COM ", "owner@example.com"],
    ["CASHIER", "cashier"],
    ["dewi.lestari", "dewi.lestari"],
    ["+6281200000003", "081200000003"],
    ["0812-0000-0003", "081200000003"],
    [" 0812 0000 0003 ", "081200000003"],
    ["", ""],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeIdentifier(input)).toBe(expected);
  });

  it("keeps dotted usernames intact instead of stripping separators", () => {
    expect(normalizeIdentifier("dewi-lestari")).toBe("dewi-lestari");
    expect(normalizeIdentifier("dewi_lestari")).toBe("dewi_lestari");
  });

  it("caps an oversized identifier so the attempt key stays bounded", () => {
    const oversized = `${"a".repeat(400)}@example.com`;
    expect(normalizeIdentifier(oversized)).toHaveLength(320);
    expect(normalizeIdentifier("0".repeat(400))).toHaveLength(320);
  });
});

describe("accountLockKeys", () => {
  it("counts a resolved account on the alias and the account id", () => {
    expect(accountLockKeys("owner@example.com", "seed_owner_rina")).toEqual([
      "owner@example.com",
      "user:seed_owner_rina",
    ]);
  });

  it("counts an unknown identifier on itself only", () => {
    expect(accountLockKeys("hantu@example.com", null)).toEqual([
      "hantu@example.com",
    ]);
  });
});

describe("evaluateLockStatus", () => {
  it("does not lock below the failure threshold", () => {
    const status = evaluateLockStatus(failuresDescending([0, 1, 2, 3]), at(4));
    expect(status).toEqual({ locked: false, retryAfterSeconds: 0 });
  });

  it("locks for fifteen minutes on the fifth consecutive failure", () => {
    const status = evaluateLockStatus(failuresDescending([0, 1, 2, 3, 4]), at(4));
    expect(status.locked).toBe(true);
    expect(status.retryAfterSeconds).toBe(POLICY.lockoutMinutes * 60);
  });

  it("counts down while the lock is active and releases exactly at expiry", () => {
    const failures = failuresDescending([0, 1, 2, 3, 4]);

    expect(evaluateLockStatus(failures, at(9))).toEqual({
      locked: true,
      retryAfterSeconds: 10 * 60,
    });
    expect(evaluateLockStatus(failures, at(18))).toEqual({
      locked: true,
      retryAfterSeconds: 60,
    });
    expect(evaluateLockStatus(failures, at(19))).toEqual({
      locked: false,
      retryAfterSeconds: 0,
    });
    expect(evaluateLockStatus(failures, at(30))).toEqual({
      locked: false,
      retryAfterSeconds: 0,
    });
  });

  it("anchors on the fifth failure when a later request was rejected while locked", () => {
    // Tactical duplicates (races) add rows; they must not extend the lock.
    const failures = failuresDescending([0, 1, 2, 3, 4, 12]);
    expect(evaluateLockStatus(failures, at(12))).toEqual({
      locked: true,
      retryAfterSeconds: 7 * 60,
    });
  });

  it("treats a spread-out streak as locking from the fifth failure", () => {
    // Four old failures plus the fifth at minute 14: lock ends at minute 29.
    const failures = failuresDescending([0, 3, 7, 10, 14]);
    expect(evaluateLockStatus(failures, at(14))).toEqual({
      locked: true,
      retryAfterSeconds: POLICY.lockoutMinutes * 60,
    });
    expect(evaluateLockStatus(failures, at(29))).toEqual({
      locked: false,
      retryAfterSeconds: 0,
    });
  });

  it("rounds a partial second up so retryAfter is never zero while locked", () => {
    const failures = failuresDescending([0, 1, 2, 3, 4]);
    const status = evaluateLockStatus(failures, new Date(at(18).getTime() + 500));
    expect(status.locked).toBe(true);
    expect(status.retryAfterSeconds).toBe(60);
  });
});
