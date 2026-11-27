import { tokens } from "@workshop-pos/design-tokens";
import type { TextStyle } from "react-native";

/**
 * React Native mapping of the shared design tokens (DESIGN §5, §7).
 *
 * No palette value is invented here: every colour, space, radius, type step,
 * and size comes from `@workshop-pos/design-tokens`, which is generated from
 * `docs/ui/tokens.json`. The mobile theme is the same semantic contract the web
 * shell consumes from CSS custom properties.
 */

export type ThemeMode = "light" | "dark";

export type TypeStep = keyof typeof tokens.typography.scale;

export type LifecycleTone =
  | "draft"
  | "estimated"
  | "approved"
  | "inProgress"
  | "completed"
  | "paid"
  | "void"
  | "pendingSync"
  | "sending"
  | "syncFailed"
  | "needsReview"
  | "synced";

export interface AppTheme {
  mode: ThemeMode;
  color: (typeof tokens.color)["light"] | (typeof tokens.color)["dark"];
  spacing: typeof tokens.spacing;
  radius: typeof tokens.radius;
  border: typeof tokens.border;
  size: typeof tokens.size;
  zIndex: typeof tokens.zIndex;
  motion: typeof tokens.motion;
  type: (step: TypeStep) => TextStyle;
  lifecycle: (tone: LifecycleTone) => {
    fg: string;
    bg: string;
    border: string;
  };
}

const fontFamily = {
  sans: {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
  },
  mono: "IBMPlexMono_400Regular",
} as const;

function buildType(step: TypeStep): TextStyle {
  const entry = tokens.typography.scale[step];
  const family = entry.fontFamily === "mono" ? fontFamily.mono : undefined;
  const weight =
    entry.weight === 600
      ? fontFamily.sans.semibold
      : entry.weight === 500
        ? fontFamily.sans.medium
        : fontFamily.sans.regular;
  return {
    fontFamily: family ?? weight,
    fontSize: entry.size,
    lineHeight: entry.lineHeight,
    letterSpacing: entry.letterSpacing,
  };
}

export function buildTheme(mode: ThemeMode): AppTheme {
  const color = tokens.color[mode];
  return {
    mode,
    color,
    spacing: tokens.spacing,
    radius: tokens.radius,
    border: tokens.border,
    size: tokens.size,
    zIndex: tokens.zIndex,
    motion: tokens.motion,
    type: buildType,
    lifecycle: (tone) => {
      const statusKey = tokens.lifecycle[tone];
      if (statusKey === "accent") {
        return {
          fg: color.accent.text,
          bg: color.accent.subtle,
          border: color.accent.default,
        };
      }
      return color.status[statusKey];
    },
  };
}

export const lightTheme = buildTheme("light");
export const darkTheme = buildTheme("dark");
