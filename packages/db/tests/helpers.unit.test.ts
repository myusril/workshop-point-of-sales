import { describe, expect, it } from "vitest";
import {
  assertTestDatabase,
  databaseNameFromUrl,
} from "./helpers.ts";

describe("test database guard", () => {
  it("returns the database name for a _test database", () => {
    const name = databaseNameFromUrl(
      "postgresql://workshop:placeholder@127.0.0.1:55432/workshop_pos_test",
    );
    expect(name).toBe("workshop_pos_test");
    expect(assertTestDatabase("postgresql://u:p@localhost:5432/app_test")).toBe(
      "app_test",
    );
  });

  it("refuses a non-_test database without echoing credentials", () => {
    let message = "";
    try {
      assertTestDatabase("postgresql://workshop:placeholder@db.internal:5432/prod");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("prod");
    expect(message).not.toContain("placeholder");
    expect(message).not.toContain("workshop:placeholder");
  });

  it("reports only the host when the URL has no database name", () => {
    let message = "";
    try {
      databaseNameFromUrl("postgresql://workshop:placeholder@db.internal:5432");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("db.internal");
    expect(message).not.toContain("placeholder");
  });

  it("does not echo an unparseable URL", () => {
    let message = "";
    try {
      databaseNameFromUrl("postgresql://workshop:placeholder@::not-a-url");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain("placeholder");
    expect(message).not.toContain("not-a-url");
  });
});
