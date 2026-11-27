import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/src/theme/ThemeProvider";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  accessibilityLabel,
  style,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
}) {
  const theme = useTheme();
  const height = variant === "primary" ? theme.size.primaryMobile : theme.size.targetMobile;

  const background =
    variant === "primary"
      ? theme.color.accent.default
      : variant === "danger"
        ? theme.color.status.danger.bg
        : variant === "secondary"
          ? theme.color.bg.surface
          : "transparent";
  const border =
    variant === "primary"
      ? theme.color.accent.default
      : variant === "danger"
        ? theme.color.status.danger.border
        : theme.color.border.strong;
  const textColor =
    variant === "primary"
      ? theme.color.accent.onAccent
      : variant === "danger"
        ? theme.color.status.danger.fg
        : theme.color.text.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: height,
          borderRadius: theme.radius.sm,
          borderWidth: theme.border.width.default,
          borderColor: border,
          backgroundColor: pressed ? theme.color.bg.hover : background,
          paddingHorizontal: theme.spacing[16],
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: theme.spacing[8],
          opacity: disabled && !loading ? 0.55 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : icon}
      <Text style={[theme.type("body.strong"), { color: textColor }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  label,
  onPress,
  children,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={theme.spacing[8]}
      style={{
        minWidth: theme.size.targetMobile,
        minHeight: theme.size.targetMobile,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: theme.radius.md,
      }}
    >
      {children}
    </Pressable>
  );
}

export function TextLink({
  label,
  onPress,
  tone = "default",
}: {
  label: string;
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  const theme = useTheme();
  const color = tone === "danger" ? theme.color.status.danger.fg : theme.color.text.link;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: theme.size.targetMobile,
        minWidth: theme.size.targetMobile,
        justifyContent: "center",
      }}
    >
      <Text style={[theme.type("body.strong"), { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.color.bg.surface,
          borderRadius: theme.radius.md,
          borderWidth: theme.border.width.default,
          borderColor: theme.color.border.strong,
          padding: theme.spacing[16],
          gap: theme.spacing[8],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
