import { describe, expect, it } from "vitest";

import {
  PLATE_MAX_LENGTH,
  isNormalizedPlate,
  isValidPlate,
  normalizePlate,
  platesMatch,
} from "../src/plate.ts";

describe("plate normalization (BR-006, AC4.4)", () => {
  const cases: readonly [string, string][] = [
    ["b1234xyz", "B1234XYZ"],
    ["B 1234 XYZ", "B1234XYZ"],
    ["B1234XYZ", "B1234XYZ"],
    ["  b-1234.xyz ", "B1234XYZ"],
    ["b\t1234\nxyz", "B1234XYZ"],
    ["", ""],
    ["---", ""],
  ];

  for (const [input, expected] of cases) {
    it(`normalizes ${JSON.stringify(input)} to ${JSON.stringify(expected)}`, () => {
      expect(normalizePlate(input)).toBe(expected);
    });
  }

  it("is idempotent for every case", () => {
    for (const [input] of cases) {
      const once = normalizePlate(input);
      expect(normalizePlate(once)).toBe(once);
    }
  });

  it("all three PRD inputs resolve to one canonical plate", () => {
    const canonical = normalizePlate("b1234xyz");
    expect(normalizePlate("B 1234 XYZ")).toBe(canonical);
    expect(normalizePlate("B1234XYZ")).toBe(canonical);
    expect(platesMatch("b 1234 xyz", "B1234XYZ")).toBe(true);
  });

  it("validates canonical form and length bounds", () => {
    expect(isNormalizedPlate("B1234XYZ")).toBe(true);
    expect(isNormalizedPlate("b1234xyz")).toBe(false);
    expect(isNormalizedPlate("B 1234 XYZ")).toBe(false);
    expect(isNormalizedPlate("")).toBe(false);
    expect(isValidPlate("B".repeat(PLATE_MAX_LENGTH))).toBe(true);
    expect(isValidPlate("B".repeat(PLATE_MAX_LENGTH + 1))).toBe(false);
  });
});
