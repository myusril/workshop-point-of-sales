import { formatIdr } from "@workshop-pos/core";
import { Pressable, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";

import { useTheme } from "@/src/theme/ThemeProvider";
import { syncChipLabel } from "@/src/domain/status";
import { Badge } from "./forms";

export function Money({
  value,
  size = "numeric.lg",
  color,
  testID,
}: {
  value: bigint;
  size?: Parameters<ReturnType<typeof useTheme>["type"]>[0];
  color?: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Text
      testID={testID}
      accessibilityLabel={formatIdr(value)}
      style={[
        theme.type(size),
        { color: color ?? theme.color.text.primary, fontVariant: ["tabular-nums"] },
      ]}
    >
      {formatIdr(value)}
    </Text>
  );
}

export function Header({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string | null;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        minHeight: theme.size.mobileHeader,
        paddingHorizontal: theme.spacing[16],
        paddingVertical: theme.spacing[8],
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[8],
        backgroundColor: theme.color.bg.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.color.border.subtle,
      }}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali"
          onPress={onBack}
          style={{
            minHeight: theme.size.targetMobile,
            minWidth: theme.size.targetMobile,
            justifyContent: "center",
          }}
        >
          <Text style={[theme.type("body.strong"), { color: theme.color.text.link }]}>{"\u2190 Kembali"}</Text>
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[theme.type("title.sm"), { color: theme.color.text.primary }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[theme.type("caption"), { color: theme.color.text.muted }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function SyncChip({
  online,
  syncing,
  queued,
  conflicts,
  failed,
  onPress,
}: {
  online: boolean;
  syncing: boolean;
  queued: number;
  conflicts: number;
  failed: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const label = syncChipLabel({ online, syncing, queued, conflicts, failed });
  const tone =
    conflicts > 0
      ? theme.color.status.danger
      : !online
        ? theme.color.status.warning
        : failed > 0
          ? theme.color.status.warning
          : theme.color.status.neutral;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Status sinkronisasi: ${label}. Buka antrean sinkronisasi.`}
      accessibilityLiveRegion="polite"
      onPress={onPress}
      style={{
        minHeight: theme.size.targetMobile,
        justifyContent: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[4],
      }}
    >
      <RefreshCw size={theme.size.iconSm} color={tone.fg} />
      <Badge label={label} fg={tone.fg} bg={tone.bg} border={tone.border} />
    </Pressable>
  );
}

export function OfflineBanner({ queued }: { queued: number }) {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        minHeight: theme.size.mobileBanner,
        backgroundColor: theme.color.status.warning.bg,
        borderBottomWidth: 1,
        borderBottomColor: theme.color.status.warning.border,
        justifyContent: "center",
        paddingHorizontal: theme.spacing[16],
        paddingVertical: theme.spacing[8],
      }}
    >
      <Text style={[theme.type("caption"), { color: theme.color.status.warning.fg }]}>
        {queued > 0
          ? `Anda offline. ${queued} transaksi menunggu sinkron dan akan dikirim otomatis.`
          : "Anda offline. Transaksi tetap bisa dibuat dan akan disinkronkan otomatis."}
      </Text>
    </View>
  );
}
