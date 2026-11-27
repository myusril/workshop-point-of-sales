import { useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/src/theme/ThemeProvider";
import { TextLink } from "./ui";

export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const content = (
    <View
      style={[
        {
          padding: padded ? theme.spacing[16] : 0,
          gap: theme.spacing[12],
          flexGrow: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>{content}</View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}
      contentContainerStyle={{ paddingBottom: theme.size.scrollPaddingBottom }}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </ScrollView>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.spacing[8],
      }}
    >
      <Text
        accessibilityRole="header"
        style={[theme.type("title.sm"), { color: theme.color.text.primary, flexShrink: 1 }]}
      >
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>{children}</Text>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none",
  multiline = false,
  maxLength,
  accessibilityLabel,
  autoFocus = false,
  editable = true,
  right,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  multiline?: boolean;
  maxLength?: number;
  accessibilityLabel?: string;
  autoFocus?: boolean;
  editable?: boolean;
  right?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing[4] }}>
      <Text style={[theme.type("label"), { color: theme.color.text.secondary }]}>{label}</Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: theme.border.width.default,
          borderColor: error ? theme.color.status.danger.border : theme.color.border.strong,
          borderRadius: theme.radius.sm,
          backgroundColor: editable ? theme.color.bg.surface : theme.color.bg.disabled,
          minHeight: theme.size.targetMobile,
          paddingHorizontal: theme.spacing[12],
        }}
      >
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.color.text.muted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          multiline={multiline}
          maxLength={maxLength}
          autoFocus={autoFocus}
          editable={editable}
          style={[
            theme.type("body.lg"),
            {
              color: theme.color.text.primary,
              flex: 1,
              minHeight: theme.size.targetMobile,
              paddingVertical: theme.spacing[8],
              textAlignVertical: multiline ? "top" : "center",
            },
          ]}
        />
        {right}
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type("caption"), { color: theme.color.status.danger.fg }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: theme.color.bg.surfaceSunken,
        borderRadius: theme.radius.sm,
        borderWidth: theme.border.width.default,
        borderColor: theme.color.border.strong,
        padding: theme.spacing[2],
        gap: theme.spacing[2],
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: theme.size.targetMobile,
              borderRadius: theme.radius.xs,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? theme.color.accent.default : "transparent",
              backgroundColor: selected ? theme.color.accent.subtle : "transparent",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: theme.spacing[8],
            }}
          >
            <Text
              style={[
                theme.type("body.strong"),
                { color: selected ? theme.color.accent.text : theme.color.text.secondary },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.color.border.subtle }} />;
}

export function Badge({
  label,
  fg,
  bg,
  border,
}: {
  label: string;
  fg: string;
  bg: string;
  border: string;
}) {
  const theme = useTheme();
  const text = useMemo(() => theme.type("caption"), [theme]);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[4],
        backgroundColor: bg,
        borderColor: border,
        borderWidth: 1,
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.spacing[8],
        paddingVertical: theme.spacing[4],
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />
      <Text style={[text, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing[24],
        gap: theme.spacing[8],
      }}
    >
      <Text
        accessibilityRole="header"
        style={[theme.type("title.sm"), { color: theme.color.text.primary, textAlign: "center" }]}
      >
        {title}
      </Text>
      <Text
        style={[theme.type("body"), { color: theme.color.text.secondary, textAlign: "center" }]}
      >
        {body}
      </Text>
      {action}
    </View>
  );
}

export function LoadingState({ label = "Memuat…" }: { label?: string }) {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing[24],
        gap: theme.spacing[8],
      }}
    >
      <ActivityIndicator color={theme.color.accent.default} />
      <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>{label}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = "Coba lagi",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing[8] }}>
      <Notice tone="danger" message={message} />
      {onRetry ? <TextLink label={retryLabel} onPress={onRetry} /> : null}
    </View>
  );
}

export function Notice({
  tone,
  title,
  message,
  action,
}: {
  tone: "info" | "warning" | "danger" | "success" | "neutral";
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  const colors = theme.color.status[tone];
  return (
    <View
      accessibilityLiveRegion={tone === "danger" ? "assertive" : "polite"}
      style={{
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: theme.radius.md,
        padding: theme.spacing[12],
        gap: theme.spacing[4],
      }}
    >
      {title ? (
        <Text style={[theme.type("body.strong"), { color: colors.fg }]}>{title}</Text>
      ) : null}
      <Text style={[theme.type("body"), { color: colors.fg }]}>{message}</Text>
      {action}
    </View>
  );
}
