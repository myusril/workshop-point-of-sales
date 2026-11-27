import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * In-app numeric keypad (DESIGN §7.3): integer rupiah only, no decimal key,
 * `000`, one-digit backspace, and a visible "Hapus semua" so a long-press is
 * never required. The typed digits and the formatted value are both shown by the
 * caller.
 */

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "back"] as const;

export function NumericKeypad({
  value,
  onChange,
  maxDigits = 12,
  onLimit,
  compact = false,
}: {
  value: string;
  onChange: (next: string) => void;
  maxDigits?: number;
  onLimit?: () => void;
  compact?: boolean;
}) {
  const theme = useTheme();

  function press(key: (typeof KEYS)[number]) {
    if (key === "back") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "000") {
      const next = value.length === 0 ? "0" : `${value}000`;
      if (next.replace(/^0+(?=\d)/, "").length > maxDigits) {
        onLimit?.();
        return;
      }
      onChange(next);
      return;
    }
    if (value === "0") {
      onChange(key === "0" ? "0" : key);
      return;
    }
    if (value.length >= maxDigits) {
      onLimit?.();
      return;
    }
    onChange(`${value}${key}`);
  }

  return (
    <View style={{ gap: theme.spacing[8] }}>
      {[0, 1, 2, 3].map((row) => (
        <View key={row} style={{ flexDirection: "row", gap: theme.spacing[8] }}>
          {KEYS.slice(row * 3, row * 3 + 3).map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={
                key === "back" ? "Hapus satu angka" : key === "000" ? "Tiga nol" : key
              }
              onPress={() => press(key)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: compact ? theme.size.targetMobile : theme.size.keypadKey,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.color.border.strong,
                backgroundColor: pressed ? theme.color.bg.hover : theme.color.bg.surface,
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Text style={[theme.type("title.md"), { color: theme.color.text.primary }]}>
                {key === "back" ? "\u232b" : key}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hapus semua angka"
        onPress={() => onChange("")}
        style={{
          minHeight: theme.size.targetMobile,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={[theme.type("body.strong"), { color: theme.color.text.link }]}>
          Hapus semua
        </Text>
      </Pressable>
    </View>
  );
}
