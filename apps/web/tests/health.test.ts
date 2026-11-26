import { describe, expect, it } from "vitest";

import { buildHealthPayload, migrationLabel } from "../lib/health";

const NOW = new Date("2026-11-26T08:30:00.000Z");

describe("buildHealthPayload", () => {
  it("maps a reachable database with no migrations to ok + none", () => {
    expect(
      buildHealthPayload({ databaseUp: true, migration: null, now: NOW }),
    ).toEqual({
      status: "ok",
      database: "up",
      migration: "none",
      timestamp: "2026-11-26T08:30:00.000Z",
    });
  });

  it("reports the newest applied migration version", () => {
    expect(
      buildHealthPayload({
        databaseUp: true,
        migration: "1764140000000",
        now: NOW,
      }),
    ).toEqual({
      status: "ok",
      database: "up",
      migration: "1764140000000",
      timestamp: "2026-11-26T08:30:00.000Z",
    });
  });

  it("maps an unreachable database to degraded and never exposes a version", () => {
    expect(
      buildHealthPayload({
        databaseUp: false,
        migration: "1764140000000",
        now: NOW,
      }),
    ).toEqual({
      status: "degraded",
      database: "down",
      migration: "unknown",
      timestamp: "2026-11-26T08:30:00.000Z",
    });
  });
});

describe("migrationLabel", () => {
  it("treats missing rows and empty values as none", () => {
    expect(migrationLabel(undefined)).toBe("none");
    expect(migrationLabel(null)).toBe("none");
    expect(migrationLabel("")).toBe("none");
  });

  it("keeps numeric and string versions stable", () => {
    expect(migrationLabel(1764140000000)).toBe("1764140000000");
    expect(migrationLabel("1764140000000")).toBe("1764140000000");
  });
});
