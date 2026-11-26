import { describe, expect, it } from "vitest";

import { loginNotice, safeNextPath } from "../app/(auth-pages)/login/safe-next";

describe("safeNextPath", () => {
  it("keeps an in-app relative path", () => {
    expect(safeNextPath("/users")).toBe("/users");
    expect(safeNextPath("/outlets?tab=aktif")).toBe("/outlets?tab=aktif");
  });

  it("rejects absolute and protocol-relative targets", () => {
    expect(safeNextPath("https://evil.example/steal")).toBeNull();
    expect(safeNextPath("//evil.example/steal")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
  });

  it("rejects a loop back to the login page", () => {
    expect(safeNextPath("/login")).toBeNull();
    expect(safeNextPath("/login?next=/users")).toBeNull();
  });

  it("rejects missing and repeated values", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(["/users", "/outlets"])).toBeNull();
  });
});

describe("loginNotice", () => {
  it("explains an expired session", () => {
    expect(loginNotice("expired")).toContain("Sesi berakhir");
  });

  it("stays silent for unknown reasons", () => {
    expect(loginNotice("other")).toBeNull();
    expect(loginNotice(undefined)).toBeNull();
  });
});
