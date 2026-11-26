import { tokens } from "./generated/tokens.ts";

export { tokens };
export type { DesignTokens } from "./generated/tokens.ts";

function kebab(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/**
 * Maps a dotted token path to its generated CSS custom property, e.g.
 * `color.accent.onAccent` → `--wpos-color-accent-on-accent`.
 */
export function tokenVar(path: string): string {
  return `--wpos-${path
    .split(".")
    .map((segment) => kebab(segment))
    .join("-")}`;
}

/** Reads a dotted token path from the typed token object. */
export function tokenValue(path: string): unknown {
  let current: unknown = tokens;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
