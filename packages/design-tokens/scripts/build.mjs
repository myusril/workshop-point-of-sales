/**
 * Generates the typed token module and the semantic CSS variables from
 * `docs/ui/tokens.json`. The JSON is the source of truth shared with mobile;
 * this script only renames keys into CSS custom properties.
 *
 * Run with: npm run build:tokens --workspace @workshop-pos/design-tokens
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const sourcePath = resolve(repositoryRoot, "docs", "ui", "tokens.json");
const outputDirectory = resolve(packageRoot, "src", "generated");

const tokens = JSON.parse(readFileSync(sourcePath, "utf8"));

function kebab(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function cssVar(path) {
  return `--wpos-${path
    .split(".")
    .map((segment) => kebab(segment))
    .join("-")}`;
}

function px(value) {
  return typeof value === "number" ? `${value}px` : String(value);
}

function colorLines(themeName) {
  const theme = tokens.color[themeName];
  const lines = [];

  for (const group of ["bg", "text", "border", "accent", "focus", "overlay"]) {
    for (const [key, value] of Object.entries(theme[group])) {
      const path =
        group === "bg" || group === "text" || group === "border"
          ? `color.${group}.${key}`
          : `color.${group}.${key}`;
      lines.push(`  ${cssVar(path)}: ${value};`);
    }
  }

  for (const [status, values] of Object.entries(theme.status)) {
    for (const [key, value] of Object.entries(values)) {
      lines.push(`  ${cssVar(`color.status.${status}.${key}`)}: ${value};`);
    }
  }

  theme.chart.categorical.forEach((value, index) => {
    lines.push(`  ${cssVar(`color.chart.categorical.${index}`)}: ${value};`);
  });
  lines.push(`  ${cssVar("color.chart.grid")}: ${theme.chart.grid};`);

  return lines.join("\n");
}

const lightColors = colorLines("light");
const darkColors = colorLines("dark");

const spacing = Object.entries(tokens.spacing)
  .map(([key, value]) => `  ${cssVar(`space.${key}`)}: ${px(value)};`)
  .join("\n");

const radius = Object.entries(tokens.radius)
  .map(([key, value]) => `  ${cssVar(`radius.${key}`)}: ${px(value)};`)
  .join("\n");

const sizes = Object.entries(tokens.size)
  .map(([key, value]) => `  ${cssVar(`size.${key}`)}: ${px(value)};`)
  .join("\n");

const borders = Object.entries(tokens.border.width)
  .map(([key, value]) => `  ${cssVar(`border.${key}`)}: ${px(value)};`)
  .join("\n");

const zIndex = Object.entries(tokens.zIndex)
  .map(([key, value]) => `  ${cssVar(`z.${key}`)}: ${value};`)
  .join("\n");

const breakpoints = Object.entries(tokens.breakpoints)
  .map(([key, value]) => `  ${cssVar(`breakpoint.${key}`)}: ${px(value)};`)
  .join("\n");

const targets = Object.entries(tokens.size)
  .filter(([key]) => key === "targetWeb" || key === "targetMobile")
  .map(([key, value]) => `  ${cssVar(kebab(key))}: ${px(value)};`)
  .join("\n");

const fontFamilies = Object.entries(tokens.typography.families)
  .map(([key, value]) => `  ${cssVar(`font.${key}`)}: ${value.fallback};`)
  .join("\n");

const typeScale = Object.entries(tokens.typography.scale)
  .map(([key, value]) => {
    const name = key.replace(/\./g, "-");
    return [
      `  ${cssVar(`text.${name}.size`)}: ${px(value.size)};`,
      `  ${cssVar(`text.${name}.line-height`)}: ${px(value.lineHeight)};`,
      `  ${cssVar(`text.${name}.weight`)}: ${value.weight};`,
      `  ${cssVar(`text.${name}.letter-spacing`)}: ${px(value.letterSpacing)};`,
      `  ${cssVar(`text.${name}.family`)}: var(${cssVar(`font.${value.fontFamily}`)});`,
    ].join("\n");
  })
  .join("\n");

const durations = Object.entries(tokens.motion.duration)
  .map(([key, value]) => `  ${cssVar(`motion.duration.${key}`)}: ${value}ms;`)
  .join("\n");

const easings = Object.entries(tokens.motion.easing)
  .map(([key, value]) => `  ${cssVar(`motion.easing.${key}`)}: cubic-bezier(${value.join(", ")});`)
  .join("\n");

const css = `/*
 * Generated from docs/ui/tokens.json by packages/design-tokens/scripts/build.mjs.
 * Do not edit by hand. Light is the default; [data-theme="dark"] overrides every
 * semantic colour so a theme is never partially applied.
 */
:root {
  color-scheme: light;
${lightColors}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
${darkColors}
  }
}

[data-theme="dark"] {
  color-scheme: dark;
${darkColors}
}

[data-theme="light"] {
  color-scheme: light;
${lightColors}
}

:root {
${spacing}
${radius}
${sizes}
${borders}
${zIndex}
${breakpoints}
${targets}
${fontFamilies}
${typeScale}
${durations}
${easings}
}
`;

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "tokens.css"), css);

const ts = `// Generated from docs/ui/tokens.json. Do not edit by hand.
export const tokens = ${JSON.stringify(tokens, null, 2)} as const;

export type DesignTokens = typeof tokens;
`;
writeFileSync(resolve(outputDirectory, "tokens.ts"), ts);

console.log(
  `design-tokens: wrote tokens.css (${css.length} bytes) and tokens.ts from docs/ui/tokens.json`,
);
