import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { tokenValue, tokenVar } from "../src/index.ts";

const css = readFileSync(new URL("../src/generated/tokens.css", import.meta.url), "utf8");
const source = JSON.parse(
  readFileSync(new URL("../../../docs/ui/tokens.json", import.meta.url), "utf8"),
) as {
  color: { light: Record<string, unknown>; dark: Record<string, unknown> };
  size: Record<string, number>;
};

describe("design tokens", () => {
  it("maps documented sizes used by the shell", () => {
    expect(source.size.sidebar).toBe(264);
    expect(css).toContain("--wpos-size-sidebar: 264px;");
    expect(css).toContain("--wpos-size-sidebar-collapsed: 72px;");
    expect(css).toContain("--wpos-size-topbar: 56px;");
    expect(css).toContain("--wpos-size-row-web: 44px;");
    expect(css).toContain("--wpos-space-24: 24px;");
    expect(css).toContain("--wpos-radius-md: 6px;");
    expect(css).toContain("--wpos-target-web: 44px;");
  });

  it("emits every light and dark semantic colour", () => {
    expect(css).toContain("--wpos-color-bg-canvas: #F4F5F2;");
    expect(css).toContain("--wpos-color-status-danger-fg: #A3231B;");
    expect(css).toContain("--wpos-color-accent-on-accent: #FFFFFF;");
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain("[data-theme=\"dark\"]");
    expect(css).toContain("--wpos-color-bg-canvas: #0F1416;");
    expect(css).toContain("--wpos-color-status-danger-fg: #FF9A90;");
    expect(css).toContain("--wpos-color-chart-grid: #E1E5E1;");
  });

  it("never relies on a partial dark theme", () => {
    const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'));
    for (const path of [
      "color.bg.surface",
      "color.text.primary",
      "color.border.default",
      "color.accent.default",
      "color.focus.ring",
      "color.status.warning.bg",
    ]) {
      expect(darkBlock).toContain(`${tokenVar(path)}:`);
    }
  });

  it("resolves typed token paths and CSS variable names", () => {
    expect(tokenValue("color.light.accent.default")).toBe("#0E6E66");
    expect(tokenValue("color.dark.accent.default")).toBe("#66D6C4");
    expect(tokenValue("size.sidebar")).toBe(264);
    expect(tokenVar("color.accent.onAccent")).toBe("--wpos-color-accent-on-accent");
    expect(tokenVar("motion.duration.fast")).toBe("--wpos-motion-duration-fast");
  });
});
